"""Open-Meteo hourly forecast client (free, no API key).

Docs: https://open-meteo.com/en/docs
"""

from __future__ import annotations

import math
import time
from collections.abc import Iterable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx

from ..domain.geometry import Point

BASE_URL = "https://api.open-meteo.com/v1/forecast"
HOURLY_VARS = ("wind_speed_10m", "wind_gusts_10m", "rain", "showers", "snowfall")
BATCH_SIZE = 100
# The free tier allows 600 location-calls a minute, and a long trip can use most of that.
# A burst over the minute limit is worth waiting out (once) rather than failing the plan;
# hourly and daily limits are not.
MINUTE_LIMIT_RETRIES = 1
LIMIT_MESSAGES = {
    "Minutely": "Weather service rate limit reached — please try again in a minute.",
    "Hourly": "Weather service hourly limit reached — please try again later.",
    "Daily": "Weather service daily limit reached — please try again tomorrow.",
}
# Forecasts are looked up on a ~2 km grid; nearby checkpoints share one request.
GRID_DECIMALS = 2


class WeatherError(Exception):
    pass


@dataclass(frozen=True)
class Conditions:
    wind_mph: float
    gust_mph: float | None
    rain_in_hr: float
    snow_in_hr: float


@dataclass(frozen=True)
class Forecast:
    """Hourly series for one location. `start_ts` is the unix time of index 0."""

    start_ts: int
    wind: tuple[float | None, ...]
    gust: tuple[float | None, ...]
    rain: tuple[float | None, ...]  # rain + showers, accumulated over the preceding hour
    snow: tuple[float | None, ...]  # snowfall, accumulated over the preceding hour

    def at(self, when: datetime) -> Conditions | None:
        """Conditions the truck meets at `when`.

        Wind is instantaneous, so the nearest hour is used. Precipitation values
        are totals for the hour *ending* at the timestamp, so the hour containing
        `when` is the one labelled with the next full hour.
        """
        hours = (when.timestamp() - self.start_ts) / 3600
        wind_i = math.floor(hours + 0.5)  # nearest hour, half-hours rounding up
        precip_i = math.floor(hours) + 1
        wind = _get(self.wind, wind_i)
        rain = _get(self.rain, precip_i)
        snow = _get(self.snow, precip_i)
        if wind is None or rain is None or snow is None:
            return None
        return Conditions(wind, _get(self.gust, wind_i), rain, snow)


def _get(values: Sequence[float | None], i: int) -> float | None:
    return values[i] if 0 <= i < len(values) else None


def _limit_kind(resp: httpx.Response) -> str:
    """Which Open-Meteo limit a 429 refers to ("Minutely", "Hourly" or "Daily")."""
    try:
        reason = resp.json().get("reason", "")
    except (ValueError, AttributeError):
        reason = ""
    return next((kind for kind in LIMIT_MESSAGES if reason.startswith(kind)), "Minutely")


def _add(a: float | None, b: float | None) -> float | None:
    """Sum of two hourly values where a missing one counts as zero; None only if both are missing."""
    return None if a is None and b is None else (a or 0.0) + (b or 0.0)


def grid_key(p: Point) -> Point:
    return (round(p[0], GRID_DECIMALS), round(p[1], GRID_DECIMALS))


def floor_hour(dt: datetime) -> datetime:
    return dt.astimezone(UTC).replace(minute=0, second=0, microsecond=0)


class OpenMeteoClient:
    def __init__(self, http: httpx.Client | None = None, max_workers: int = 4, sleep=time.sleep):
        self.http = http or httpx.Client(timeout=20.0)
        self.max_workers = max_workers
        self.sleep = sleep

    def forecasts(self, points: Iterable[Point], start: datetime, end: datetime) -> dict[Point, Forecast]:
        """Hourly forecasts from `start` to `end` (UTC hours), keyed by `grid_key(point)`.

        Always fetched live, never cached, so every plan uses the latest model run.
        """
        start_h = floor_hour(start)
        # One extra hour so the precipitation total for the final hour is included.
        end_h = floor_hour(end) + timedelta(hours=1)
        keys = sorted({grid_key(p) for p in points})

        result: dict[Point, Forecast] = {}
        batches = [keys[i : i + BATCH_SIZE] for i in range(0, len(keys), BATCH_SIZE)]
        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            fetched = pool.map(lambda b: self._fetch(b, start_h, end_h), batches)
            for batch, forecasts in zip(batches, fetched, strict=True):
                result.update(zip(batch, forecasts, strict=True))
        return result

    def _fetch(self, batch: Sequence[Point], start: datetime, end: datetime) -> list[Forecast]:
        params = {
            "latitude": ",".join(str(p[1]) for p in batch),
            "longitude": ",".join(str(p[0]) for p in batch),
            "hourly": ",".join(HOURLY_VARS),
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "timezone": "GMT",
            "timeformat": "unixtime",
            "start_hour": start.strftime("%Y-%m-%dT%H:%M"),
            "end_hour": end.strftime("%Y-%m-%dT%H:%M"),
        }
        for attempt in range(MINUTE_LIMIT_RETRIES + 1):
            try:
                resp = self.http.get(BASE_URL, params=params)
            except httpx.HTTPError as exc:
                raise WeatherError(f"Weather service unreachable: {exc}") from exc
            if resp.status_code != 429:
                break
            limit = _limit_kind(resp)
            if limit != "Minutely" or attempt == MINUTE_LIMIT_RETRIES:
                raise WeatherError(LIMIT_MESSAGES[limit])
            self.sleep(60 - datetime.now(UTC).second + 2)  # just past the start of the next minute
        if resp.status_code != 200:
            raise WeatherError(f"Weather service error ({resp.status_code}): {resp.text[:200]}")
        try:
            payload = resp.json()
            items = payload if isinstance(payload, list) else [payload]
            if len(items) != len(batch):
                raise WeatherError("Weather service returned an unexpected number of locations")
            return [self._parse(item) for item in items]
        except (ValueError, KeyError, TypeError) as exc:
            raise WeatherError("Weather service returned an unreadable response") from exc

    @staticmethod
    def _parse(item: dict) -> Forecast:
        h = item["hourly"]
        times = h["time"]
        rain = tuple(_add(r, s) for r, s in zip(h["rain"], h["showers"], strict=True))
        return Forecast(
            start_ts=int(times[0]) if times else 0,
            wind=tuple(h["wind_speed_10m"]),
            gust=tuple(h["wind_gusts_10m"]),
            rain=rain,
            snow=tuple(h["snowfall"]),
        )
