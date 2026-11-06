"""TomTom client: truck routing (traffic-aware, with alternatives) and address search.

Docs: https://docs.tomtom.com/routing-api/documentation/routing/calculate-route
      https://docs.tomtom.com/search-api/documentation/search-service/fuzzy-search
"""

from __future__ import annotations

import hashlib
import itertools
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

import httpx
from django.conf import settings
from django.core.cache import cache

from ..domain.checkpoints import Step
from ..domain.geometry import Point

BASE_URL = "https://api.tomtom.com"
SEARCH_CACHE_TTL_S = 24 * 60 * 60
LB_TO_KG = 0.453592
# Empty tractor + 53 ft trailer is roughly 33,000 lb; the user enters cargo weight only.
TRACTOR_TRAILER_TARE_LB = 33_000


class RoutingError(Exception):
    """Raised with a message that is safe to show to the user.

    `no_route` marks requests that can't be routed at all (e.g. a point in the sea),
    as opposed to the service failing.
    """

    def __init__(self, message: str, no_route: bool = False):
        super().__init__(message)
        self.no_route = no_route


# TomTom engine error codes -> what the user should be told.
NO_ROUTE_MESSAGES = {
    "MAP_MATCHING_FAILURE": "One of the places isn't near a road a truck can use. Pick a nearby town or address.",
    "NO_ROUTE_FOUND": "No truck route connects these places (they may be on different continents or islands).",
    "CANNOT_RESTORE_BASEROUTE": "No truck route connects these places.",
}
# departAt must be in the future when TomTom receives it; leave room for the request to travel.
DEPART_AT_MARGIN = timedelta(minutes=1)


@dataclass(frozen=True)
class Route:
    coords: list[Point]
    distance_m: float
    duration_s: float
    steps: list[Step]  # elapsed-time markers along the geometry
    road_names: list[str]  # main roads by distance, longest first


@dataclass(frozen=True)
class Place:
    label: str
    lon: float
    lat: float


def gross_weight_kg(load_lb: float) -> int:
    return round((TRACTOR_TRAILER_TARE_LB + load_lb) * LB_TO_KG)


class TomTomClient:
    def __init__(self, api_key: str | None = None, http: httpx.Client | None = None):
        self.api_key = api_key if api_key is not None else settings.TOMTOM_API_KEY
        self.http = http or httpx.Client(timeout=30.0)

    def _require_key(self) -> None:
        if not self.api_key:
            raise RoutingError("Routing is not configured: set TOMTOM_API_KEY on the server.")

    # --- Routing ----------------------------------------------------------

    def directions(
        self,
        waypoints: Sequence[Point],
        departure: datetime,
        load_lb: float,
        alternatives: int = 0,
    ) -> list[Route]:
        """Fastest truck routes through `waypoints`, using traffic expected at `departure`.

        `alternatives` is the number of routes wanted in total (TomTom adds up to
        alternatives - 1 extra routes).
        """
        self._require_key()
        locations = ":".join(f"{lat},{lon}" for lon, lat in waypoints)
        params: list[tuple[str, str | int]] = [
            ("key", self.api_key),
            ("travelMode", "truck"),
            ("vehicleCommercial", "true"),
            ("vehicleWeight", gross_weight_kg(load_lb)),
            ("routeType", "fastest"),
            ("traffic", "true"),
            ("instructionsType", "coded"),
            ("extendedRouteRepresentation", "travelTime"),
            ("extendedRouteRepresentation", "distance"),
        ]
        if departure > datetime.now(UTC) + DEPART_AT_MARGIN:
            params.append(("departAt", departure.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")))
        if alternatives > 1:
            params.append(("maxAlternatives", alternatives - 1))

        try:
            resp = self.http.get(f"{BASE_URL}/routing/1/calculateRoute/{locations}/json", params=params)
        except httpx.HTTPError as exc:
            raise RoutingError(f"Routing service unreachable: {exc}") from exc
        if resp.status_code != 200:
            raise self._error(resp, "Routing")
        try:
            return [self._parse_route(r) for r in resp.json().get("routes", [])]
        except (ValueError, KeyError, TypeError, AttributeError) as exc:
            raise RoutingError("Routing service returned an unreadable response.") from exc

    @staticmethod
    def _error(resp: httpx.Response, service: str) -> RoutingError:
        if resp.status_code == 429:
            return RoutingError(f"{service} service rate limit reached — please try again in a minute.")
        if resp.status_code in (401, 403):
            return RoutingError(f"{service} service rejected the API key.")
        try:
            body = resp.json()
            msg = body.get("detailedError", {}).get("message") or body.get("error", {}).get("description")
        except (ValueError, AttributeError):
            msg = None
        msg = msg or resp.text[:200]
        for code, friendly in NO_ROUTE_MESSAGES.items():
            if code in msg:
                return RoutingError(friendly, no_route=True)
        return RoutingError(f"{service} service error ({resp.status_code}): {msg}")

    @staticmethod
    def _parse_route(route: dict) -> Route:
        # Points of all legs, in order; TomTom's pointIndex counts across legs the same way.
        coords = [(p["longitude"], p["latitude"]) for leg in route["legs"] for p in leg["points"]]
        summary = route["summary"]

        # `progress` gives cumulative travel time at points along the route; turn
        # consecutive markers into steps so ETAs follow the real speed profile.
        progress = sorted(route.get("progress", []), key=lambda p: p["pointIndex"])
        steps = [
            Step(a["pointIndex"], b["pointIndex"], float(b["travelTimeInSeconds"] - a["travelTimeInSeconds"]))
            for a, b in itertools.pairwise(progress)
            if b["pointIndex"] > a["pointIndex"]
        ]

        # Road names: distance between consecutive instructions, credited to the road taken.
        road_m: dict[str, float] = defaultdict(float)
        instructions = route.get("guidance", {}).get("instructions", [])
        for ins, nxt in itertools.pairwise(instructions):
            name = (ins.get("roadNumbers") or [None])[0] or ins.get("street")
            if name:
                road_m[name] += nxt.get("routeOffsetInMeters", 0) - ins.get("routeOffsetInMeters", 0)

        return Route(
            coords=coords,
            distance_m=float(summary["lengthInMeters"]),
            duration_s=float(summary["travelTimeInSeconds"]),
            steps=steps,
            road_names=sorted(road_m, key=road_m.get, reverse=True)[:3],
        )

    # --- Search -----------------------------------------------------------

    def autocomplete(self, text: str, size: int = 6) -> list[Place]:
        self._require_key()
        text = text.strip()
        # Hashed: the query is user text and may hold spaces or symbols cache backends reject.
        key = f"tt-search:{hashlib.sha256(text.lower().encode()).hexdigest()}:{size}"
        hit = cache.get(key)
        if hit is not None:
            return hit
        try:
            resp = self.http.get(
                f"{BASE_URL}/search/2/search/{quote(text, safe='')}.json",
                params={"key": self.api_key, "typeahead": "true", "limit": size, "idxSet": "Geo,Addr,PAD,POI"},
            )
        except httpx.HTTPError as exc:
            raise RoutingError(f"Search service unreachable: {exc}") from exc
        if resp.status_code != 200:
            raise self._error(resp, "Search")
        try:
            places = [self._parse_place(r) for r in resp.json().get("results", []) if r.get("position")]
        except (ValueError, KeyError, TypeError, AttributeError) as exc:
            raise RoutingError("Search service returned an unreadable response.") from exc
        cache.set(key, places, SEARCH_CACHE_TTL_S)
        return places

    @staticmethod
    def _parse_place(r: dict) -> Place:
        """Readable label: the place's own name, then region and country.

        For areas (cities, districts) the name comes from the address field matching
        `entityType`, because `freeformAddress` can mix in a wrong parent area
        (e.g. Lahore is returned as "Islamabad Lahore, Punjab").
        """
        addr = r.get("address", {})
        entity = r.get("entityType", "")
        if r.get("type") == "Geography" and entity:
            name = addr.get(entity[0].lower() + entity[1:]) or addr.get("freeformAddress", "")
            parts = [name, addr.get("countrySubdivision"), addr.get("country")]
        else:
            poi = r.get("poi", {}).get("name")
            parts = [poi, addr.get("freeformAddress"), addr.get("country")]
        label = ", ".join(dict.fromkeys(p for p in parts if p))  # drop blanks and repeats, keep order
        return Place(label=label, lon=r["position"]["lon"], lat=r["position"]["lat"])
