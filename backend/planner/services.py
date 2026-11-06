"""Trip planning: ties the routing and weather clients to the domain rules."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.core.cache import cache

from .clients.open_meteo import Forecast, OpenMeteoClient, floor_hour, grid_key
from .clients.tomtom import Route, RoutingError, TomTomClient
from .domain.alternatives import is_distinct, via_candidates
from .domain.checkpoints import Checkpoint, build_checkpoints, vertex_times
from .domain.geometry import METERS_PER_MILE, Point, simplify
from .domain.heatmap import corridor_points
from .domain.recommend import RouteStats, recommend, route_stats, segments_from_checkpoints
from .domain.risk import Assessment, Risk, assess

ROUTE_COUNT = 3
HEATMAP_HOURS = 48
PLAN_TTL_S = 60 * 60
ROUTE_LETTERS = "ABCDEFG"


class PlanNotFoundError(Exception):
    pass


@dataclass(frozen=True)
class TripRequest:
    origin: Point
    destination: Point
    departure: datetime
    load_lb: float
    interval_mi: int


# --- Routes -----------------------------------------------------------------


def find_routes(router: TomTomClient, req: TripRequest) -> tuple[list[Route], list[bool]]:
    """Up to three distinct truck routes, plus a flag marking via-point detours.

    The router's own alternatives come first; via-point detours only fill the
    gap when it returns fewer than three.
    """
    origin, destination = req.origin, req.destination
    routes = router.directions([origin, destination], req.departure, req.load_lb, alternatives=ROUTE_COUNT)
    if not routes:
        raise RoutingError("No truck route found between these places.", no_route=True)
    detour = [False] * len(routes)
    for via in via_candidates(routes[0].coords):
        if len(routes) >= ROUTE_COUNT:
            break
        try:
            [candidate] = router.directions([origin, via, destination], req.departure, req.load_lb)[:1]
        except (RoutingError, ValueError):
            continue  # e.g. via point in the sea; try the next one
        if is_distinct(candidate.coords, [r.coords for r in routes]):
            routes.append(candidate)
            detour.append(True)
    return routes[:ROUTE_COUNT], detour[:ROUTE_COUNT]


# --- Plan -------------------------------------------------------------------


def plan_trip(req: TripRequest, router: TomTomClient | None = None, weather: OpenMeteoClient | None = None) -> dict:
    router = router or TomTomClient()
    weather = weather or OpenMeteoClient()

    routes, detour = find_routes(router, req)
    checkpoints = [
        build_checkpoints(r.coords, vertex_times(r.coords, r.steps, r.duration_s), req.interval_mi, req.departure)
        for r in routes
    ]

    latest_eta = max(cp.eta for cps in checkpoints for cp in cps)
    forecasts = weather.forecasts((cp.point for cps in checkpoints for cp in cps), req.departure, latest_eta)

    route_payloads, all_stats = [], []
    for i, (route, cps) in enumerate(zip(routes, checkpoints, strict=True)):
        assessed = [_assess_checkpoint(cp, forecasts, req.load_lb) for cp in cps]
        levels = [a.level if a else None for _, a in assessed]
        segments = segments_from_checkpoints([cp.mile for cp in cps], levels)
        stats = route_stats(segments, route.duration_s)
        all_stats.append(stats)
        route_payloads.append(
            {
                "id": i,
                "name": f"Route {ROUTE_LETTERS[i]}",
                "via": route.road_names,
                "is_detour": detour[i],
                "distance_mi": round(route.distance_m / METERS_PER_MILE, 1),
                "duration_s": round(route.duration_s),
                "arrival": (req.departure + timedelta(seconds=route.duration_s)).isoformat(),
                "stats": _stats_payload(stats),
                "checkpoints": [_checkpoint_payload(cp, c, a) for cp, (c, a) in zip(cps, assessed, strict=True)],
                "segments": _segment_payload(route.coords, cps, levels),
            }
        )

    rec = recommend(all_stats)
    for rank, idx in enumerate(rec.order):
        route_payloads[idx]["rank"] = rank + 1
        route_payloads[idx]["recommended"] = idx == rec.best
        route_payloads[idx]["not_advised"] = idx in rec.not_advised

    plan_id = uuid.uuid4().hex
    corridor, spacing_mi = corridor_points([r.coords for r in routes])
    cache.set(
        f"plan:{plan_id}",
        {
            "corridor": corridor,
            "spacing_mi": spacing_mi,
            "departure": req.departure,
            "load_lb": req.load_lb,
        },
        PLAN_TTL_S,
    )

    return {
        "plan_id": plan_id,
        "departure": req.departure.isoformat(),
        "load_lb": req.load_lb,
        "interval_mi": req.interval_mi,
        "recommended_id": rec.best,
        "recommendation_reason": rec.reason,
        "all_routes_no_travel": rec.all_routes_no_travel,
        "routes": route_payloads,
    }


def _assess_checkpoint(cp: Checkpoint, forecasts: dict[Point, Forecast], load_lb: float):
    fc = forecasts.get(grid_key(cp.point))
    conditions = fc.at(cp.eta) if fc else None
    if conditions is None:
        return None, None
    return conditions, assess(conditions.wind_mph, conditions.rain_in_hr, conditions.snow_in_hr, load_lb)


def _checkpoint_payload(cp: Checkpoint, conditions, a: Assessment | None) -> dict:
    return {
        "mile": round(cp.mile, 1),
        "lon": round(cp.point[0], 5),
        "lat": round(cp.point[1], 5),
        "eta": cp.eta.isoformat(),
        "level": int(a.level) if a else None,
        "reason": a.reason if a else "No forecast available for this time",
        "weather": (
            {
                "wind_mph": round(conditions.wind_mph, 1),
                "gust_mph": round(conditions.gust_mph, 1) if conditions.gust_mph is not None else None,
                "rain_in_hr": round(conditions.rain_in_hr, 3),
                "snow_in_hr": round(conditions.snow_in_hr, 3),
            }
            if conditions
            else None
        ),
    }


def _stats_payload(s: RouteStats) -> dict:
    return {
        "miles_by_level": {r.label: round(s.miles_by_level[r], 1) for r in Risk},
        "unknown_mi": round(s.unknown_miles, 1),
        "no_travel_mi": round(s.no_travel_miles, 1),
        "severe_mi": round(s.severe_miles, 1),
        "high_mi": round(s.high_miles, 1),
        "avg_risk": round(s.avg_risk, 2),
    }


def _segment_payload(coords: list[Point], cps: list[Checkpoint], levels: list[Risk | None]) -> list[dict]:
    """Route geometry split between checkpoints, each piece tagged with its risk level.

    Neighbouring pieces with the same level are merged and simplified to keep
    the response small.
    """
    pieces: list[dict] = []
    for i in range(len(cps) - 1):
        a, b = cps[i], cps[i + 1]
        known = [lv for lv in (levels[i], levels[i + 1]) if lv is not None]
        level = int(max(known)) if known else None
        line = [a.point, *coords[a.vertex_index + 1 : b.vertex_index + 1], b.point]
        if pieces and pieces[-1]["level"] == level:
            pieces[-1]["coords"].extend(line[1:])
        else:
            pieces.append({"level": level, "coords": line})
    for p in pieces:
        p["coords"] = [(round(x, 5), round(y, 5)) for x, y in simplify(p["coords"])]
    return pieces


# --- Heatmap ----------------------------------------------------------------


def corridor_heatmap(plan_id: str, weather: OpenMeteoClient | None = None) -> dict:
    """Risk level for every corridor point, for each hour 0..48 after departure."""
    plan = cache.get(f"plan:{plan_id}")
    if plan is None:
        raise PlanNotFoundError(plan_id)
    weather = weather or OpenMeteoClient()

    start = floor_hour(plan["departure"])
    forecasts = weather.forecasts(plan["corridor"], start, start + timedelta(hours=HEATMAP_HOURS))
    hours = [start + timedelta(hours=h) for h in range(HEATMAP_HOURS + 1)]
    points = []
    for p in plan["corridor"]:
        fc = forecasts.get(grid_key(p))
        levels = []
        for hour in hours:
            c = fc.at(hour) if fc else None
            levels.append(int(assess(c.wind_mph, c.rain_in_hr, c.snow_in_hr, plan["load_lb"]).level) if c else -1)
        points.append({"lon": p[0], "lat": p[1], "levels": levels})
    return {
        "start": start.isoformat(),
        "hours": HEATMAP_HOURS,
        "spacing_mi": round(plan["spacing_mi"], 2),
        "points": points,
    }
