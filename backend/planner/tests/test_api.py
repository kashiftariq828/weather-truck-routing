"""End-to-end API tests with the routing and weather services mocked."""

import itertools
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx
from rest_framework.test import APIClient

from planner.clients.open_meteo import Forecast, OpenMeteoClient, WeatherError
from planner.clients.tomtom import TomTomClient, gross_weight_kg

ORIGIN = {"lon": -104.99, "lat": 39.74}
DEST = {"lon": -104.99, "lat": 41.14}  # ~97 miles due north


def _line(waypoints, per_leg=40):
    pts = []
    for (x1, y1), (x2, y2) in itertools.pairwise(waypoints):
        pts += [(x1 + (x2 - x1) * k / per_leg, y1 + (y2 - y1) * k / per_leg) for k in range(per_leg)]
    pts.append(tuple(waypoints[-1]))
    return pts


def _tomtom_route(waypoints, offset_deg=0.0):
    """A TomTom-shaped route along straight legs, optionally bowed sideways (for alternatives)."""
    pts = _line(waypoints)
    mid = len(pts) // 2
    pts = [(x + offset_deg * (1 - abs(i - mid) / mid), y) for i, (x, y) in enumerate(pts)]
    n_legs = len(waypoints) - 1
    legs = [
        {"points": [{"latitude": y, "longitude": x} for x, y in pts[i * 40 : (i + 1) * 40 + 1]]} for i in range(n_legs)
    ]
    # pointIndex counts across legs, so repeated leg-boundary points are part of the index.
    total_pts = sum(len(leg["points"]) for leg in legs)
    duration = 3600.0 * n_legs * (1 + abs(offset_deg))
    return {
        "summary": {"lengthInMeters": 160_000.0 * n_legs, "travelTimeInSeconds": duration},
        "legs": legs,
        "progress": [
            {"pointIndex": 0, "travelTimeInSeconds": 0, "distanceInMeters": 0},
            {"pointIndex": total_pts - 1, "travelTimeInSeconds": duration, "distanceInMeters": 160_000 * n_legs},
        ],
        "guidance": {
            "instructions": [
                {"routeOffsetInMeters": 0, "roadNumbers": ["I-25"]},
                {"routeOffsetInMeters": 160_000 * n_legs},
            ]
        },
    }


def _tomtom_handler(native_alternatives: bool):
    def handler(request: httpx.Request) -> httpx.Response:
        locations = request.url.path.split("/calculateRoute/")[1].removesuffix("/json")
        waypoints = [tuple(reversed([float(v) for v in loc.split(",")])) for loc in locations.split(":")]
        q = parse_qs(request.url.query.decode())
        assert q["travelMode"] == ["truck"]
        routes = [_tomtom_route(waypoints)]
        if native_alternatives and "maxAlternatives" in q:
            routes += [_tomtom_route(waypoints, 0.6), _tomtom_route(waypoints, -0.6)]
        return httpx.Response(200, json={"formatVersion": "0.0.12", "routes": routes})

    return handler


def _weather_handler(wind_mph):
    def handler(request: httpx.Request) -> httpx.Response:
        q = parse_qs(urlparse(str(request.url)).query)
        lats = q["latitude"][0].split(",")
        start = datetime.strptime(q["start_hour"][0], "%Y-%m-%dT%H:%M").replace(tzinfo=UTC)
        end = datetime.strptime(q["end_hour"][0], "%Y-%m-%dT%H:%M").replace(tzinfo=UTC)
        hours = int((end - start).total_seconds() // 3600) + 1
        times = [int(start.timestamp()) + 3600 * h for h in range(hours)]
        item = {
            "hourly": {
                "time": times,
                "wind_speed_10m": [wind_mph] * hours,
                "wind_gusts_10m": [wind_mph + 10] * hours,
                "rain": [0.0] * hours,
                "showers": [0.0] * hours,
                "snowfall": [0.0] * hours,
            }
        }
        return httpx.Response(200, json=[item] * len(lats) if len(lats) > 1 else item)

    return handler


def _plan(load_lb, wind_mph, native_alternatives=False):
    departure = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
    with respx.mock(assert_all_called=False) as mock:
        mock.get(url__regex=r".*api\.tomtom\.com/routing/.*").mock(side_effect=_tomtom_handler(native_alternatives))
        mock.get(url__regex=r".*api\.open-meteo\.com.*").mock(side_effect=_weather_handler(wind_mph))
        client = APIClient()
        resp = client.post(
            "/api/plan",
            {"origin": ORIGIN, "destination": DEST, "departure": departure, "load_lb": load_lb, "interval_mi": 25},
            format="json",
        )
        heat = client.get(f"/api/plan/{resp.json()['plan_id']}/heatmap") if resp.status_code == 200 else None
    return resp, heat


def test_plan_returns_three_routes_with_checkpoints():
    resp, heat = _plan(load_lb=20_000, wind_mph=10)
    assert resp.status_code == 200, resp.content
    data = resp.json()
    assert len(data["routes"]) == 3
    assert sum(r["recommended"] for r in data["routes"]) == 1
    assert [r["is_detour"] for r in data["routes"]] == [False, True, True]
    main = data["routes"][0]
    assert [cp["mile"] for cp in main["checkpoints"]][:4] == [0, 25, 50, 75]
    assert all(cp["level"] == 0 for cp in main["checkpoints"])
    # The direct route is shortest and equally safe, so it wins on time.
    assert data["recommended_id"] == 0

    assert heat.status_code == 200
    h = heat.json()
    assert h["hours"] == 48
    assert all(len(p["levels"]) == 49 for p in h["points"])


def test_router_alternatives_are_used_before_detours():
    resp, _ = _plan(load_lb=20_000, wind_mph=10, native_alternatives=True)
    data = resp.json()
    assert [r["is_detour"] for r in data["routes"]] == [False, False, False]
    assert data["routes"][0]["via"] == ["I-25"]
    # ETAs follow the router's travel times: the last checkpoint arrives at the route's duration.
    route = data["routes"][1]
    first, last = route["checkpoints"][0]["eta"], route["checkpoints"][-1]["eta"]
    elapsed = datetime.fromisoformat(last) - datetime.fromisoformat(first)
    assert elapsed.total_seconds() == pytest.approx(route["duration_s"], abs=1)


def test_heavy_load_in_high_wind_is_no_travel():
    resp, heat = _plan(load_lb=35_000, wind_mph=47)
    data = resp.json()
    assert data["all_routes_no_travel"] is True
    cp = data["routes"][0]["checkpoints"][1]
    assert cp["level"] == 4
    assert "35,000 lb" in cp["reason"]
    assert all(lv == 4 for lv in heat.json()["points"][0]["levels"])


def test_light_load_in_same_wind_is_severe():
    resp, _ = _plan(load_lb=25_000, wind_mph=47)
    assert resp.json()["routes"][0]["checkpoints"][1]["level"] == 3


@pytest.mark.parametrize(
    ("patch", "message"),
    [
        ({"interval_mi": 15}, "interval_mi"),
        ({"load_lb": -1}, "load_lb"),
        ({"departure": "2020-01-01T00:00:00Z"}, "past"),
        ({"destination": ORIGIN}, "same place"),
    ],
)
def test_plan_validation(patch, message):
    body = {
        "origin": ORIGIN,
        "destination": DEST,
        "departure": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        "load_lb": 20_000,
        "interval_mi": 25,
    }
    body.update(patch)
    resp = APIClient().post("/api/plan", body, format="json")
    assert resp.status_code == 400
    assert message in resp.content.decode()


def test_heatmap_for_unknown_plan():
    assert APIClient().get("/api/plan/nope/heatmap").status_code == 404


def test_forecast_lookup_uses_hour_containing_eta():
    start = datetime(2026, 1, 10, 8, tzinfo=UTC)
    fc = Forecast(
        start_ts=int(start.timestamp()),
        wind=(10, 20, 30),
        gust=(None, None, None),
        rain=(0.0, 0.1, 0.2),  # value at index i = total for hour (i-1 .. i)
        snow=(0.0, 0.0, 0.0),
    )
    c = fc.at(start + timedelta(minutes=20))  # 08:20 -> wind 08:00, rain 08:00-09:00
    assert c.wind_mph == 10
    assert c.rain_in_hr == 0.1
    c = fc.at(start + timedelta(minutes=50))  # 08:50 -> wind 09:00, rain 08:00-09:00
    assert c.wind_mph == 20
    assert c.rain_in_hr == 0.1
    assert fc.at(start + timedelta(hours=3)) is None  # beyond forecast


def test_gross_weight_adds_tractor_trailer_tare():
    assert gross_weight_kg(0) == round(33_000 * 0.453592)
    assert gross_weight_kg(40_000) == round(73_000 * 0.453592)


def test_search_labels_use_the_matched_place_name():
    lahore = {
        "type": "Geography",
        "entityType": "MunicipalitySubdivision",
        "position": {"lat": 31.56, "lon": 74.35},
        "address": {
            "municipalitySubdivision": "Lahore",
            "municipality": "Islamabad",
            "countrySubdivision": "Punjab",
            "country": "Pakistan",
            "freeformAddress": "Islamabad Lahore, Punjab",
        },
    }
    warehouse = {
        "type": "POI",
        "position": {"lat": 41.8, "lon": -87.6},
        "poi": {"name": "ACME Warehouse"},
        "address": {"freeformAddress": "100 Main St, Chicago, IL 60601", "country": "United States"},
    }
    assert TomTomClient._parse_place(lahore).label == "Lahore, Punjab, Pakistan"
    assert TomTomClient._parse_place(warehouse).label == "ACME Warehouse, 100 Main St, Chicago, IL 60601, United States"


def test_wind_half_hour_rounds_up_consistently():
    start = datetime(2026, 1, 10, 8, tzinfo=UTC)
    fc = Forecast(int(start.timestamp()), (10, 20, 30, 40), (None,) * 4, (0.0,) * 4, (0.0,) * 4)
    # Python's round() would send 08:30 to 08:00 but 09:30 to 10:00; both must go to the later hour.
    assert fc.at(start + timedelta(minutes=30)).wind_mph == 20
    assert fc.at(start + timedelta(minutes=90)).wind_mph == 30


def test_every_plan_fetches_fresh_weather():
    """Forecasts are never cached: planning the same trip again must hit Open-Meteo again."""
    with respx.mock(assert_all_called=False) as mock:
        mock.get(url__regex=r".*api\.tomtom\.com/routing/.*").mock(side_effect=_tomtom_handler(True))
        weather = mock.get(url__regex=r".*api\.open-meteo\.com.*").mock(side_effect=_weather_handler(10))
        client = APIClient()
        for hours_ahead, load in [(2, 20_000), (30, 45_000)]:
            body = {
                "origin": ORIGIN,
                "destination": DEST,
                "departure": (datetime.now(UTC) + timedelta(hours=hours_ahead)).isoformat(),
                "load_lb": load,
                "interval_mi": 25,
            }
            assert client.post("/api/plan", body, format="json").status_code == 200
            if hours_ahead == 2:
                first_calls = weather.call_count
        assert first_calls > 0
        assert weather.call_count == 2 * first_calls


def test_heatmap_hours_line_up_with_departure():
    """Hour h of the heatmap is departure hour + h."""
    resp, heat = _plan(load_lb=20_000, wind_mph=10)
    h = heat.json()
    departure = datetime.fromisoformat(resp.json()["departure"])
    assert datetime.fromisoformat(h["start"]) == departure.replace(minute=0, second=0, microsecond=0)
    assert all(-1 not in p["levels"] for p in h["points"])


def test_boolean_load_is_rejected():
    body = {
        "origin": ORIGIN,
        "destination": DEST,
        "departure": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        "load_lb": True,
        "interval_mi": 25,
    }
    resp = APIClient().post("/api/plan", body, format="json")
    assert resp.status_code == 400
    assert "load_lb" in resp.json()


@pytest.mark.parametrize(
    ("engine_message", "status", "text"),
    [
        ("Engine error: MAP_MATCHING_FAILURE: Origin (30, -40)", 422, "near a road"),
        ("Engine error: NO_ROUTE_FOUND: different ProductId's", 422, "No truck route connects"),
        ("Something else broke", 502, "Routing service error (400)"),
    ],
)
def test_unroutable_trips_get_a_plain_message(engine_message, status, text):
    body = {
        "origin": ORIGIN,
        "destination": DEST,
        "departure": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        "load_lb": 1000,
        "interval_mi": 25,
    }
    with respx.mock:
        respx.get(url__regex=r".*api\.tomtom\.com/routing/.*").mock(
            return_value=httpx.Response(400, json={"detailedError": {"message": engine_message}})
        )
        resp = APIClient().post("/api/plan", body, format="json")
    assert resp.status_code == status
    assert text in resp.json()["detail"]


def test_search_escapes_slashes_and_reports_search_errors():
    with respx.mock:
        route = respx.get(url__regex=r".*api\.tomtom\.com/search/.*").mock(
            return_value=httpx.Response(500, text="boom")
        )
        resp = APIClient().get("/api/geocode", {"q": "Unit 4/12 Main St"})
    assert route.calls.last.request.url.raw_path.startswith(b"/search/2/search/Unit%204%2F12%20Main%20St.json")
    assert resp.status_code == 502
    assert resp.json()["detail"].startswith("Search service error (500)")


def test_depart_at_is_only_sent_comfortably_in_the_future():
    with respx.mock:
        route = respx.get(url__regex=r".*api\.tomtom\.com/routing/.*").mock(
            return_value=httpx.Response(200, json={"routes": []})
        )
        client = TomTomClient()
        client.directions([(0, 0), (1, 1)], datetime.now(UTC) + timedelta(seconds=20), 0)
        assert "departAt" not in str(route.calls.last.request.url)
        client.directions([(0, 0), (1, 1)], datetime.now(UTC) + timedelta(hours=1), 0)
        assert "departAt" in str(route.calls.last.request.url)


def _limited(reason):
    return httpx.Response(429, json={"reason": reason, "error": True})


def test_minute_limit_is_waited_out_once():
    ok = _weather_handler(10)
    replies = iter([_limited("Minutely API request limit exceeded. Please try again in one minute.")])
    waits = []
    with respx.mock:
        respx.get(url__regex=r".*api\.open-meteo\.com.*").mock(side_effect=lambda req: next(replies, None) or ok(req))
        start = datetime.now(UTC)
        result = OpenMeteoClient(sleep=waits.append).forecasts([(-100, 40)], start, start + timedelta(hours=2))
    assert len(result) == 1
    assert len(waits) == 1
    assert 2 <= waits[0] <= 62


@pytest.mark.parametrize(
    ("reason", "message"),
    [
        ("Minutely API request limit exceeded.", "try again in a minute"),
        ("Hourly API request limit exceeded.", "hourly limit"),
        ("Daily API request limit exceeded.", "daily limit"),
    ],
)
def test_weather_limits_report_which_limit(reason, message):
    waits = []
    with respx.mock:
        respx.get(url__regex=r".*api\.open-meteo\.com.*").mock(return_value=_limited(reason))
        start = datetime.now(UTC)
        with pytest.raises(WeatherError, match=message):
            OpenMeteoClient(sleep=waits.append).forecasts([(-100, 40)], start, start + timedelta(hours=2))
    # Only the minute limit is worth waiting for, and only once.
    assert len(waits) == (1 if reason.startswith("Minutely") else 0)
