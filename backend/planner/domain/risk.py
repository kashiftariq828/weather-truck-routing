"""Weather risk classification for a single checkpoint.

Implements the assessment's threshold table and load rules exactly. Where the
published ranges share an endpoint (e.g. rain 0.25 is both "0.10-0.25" and
"0.25-0.50"), the value is assigned to the *higher* level: when in doubt, err
on the side of safety.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum


class Risk(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return RISK_LABELS[self]


RISK_LABELS = {
    Risk.LOW: "Low",
    Risk.MODERATE: "Moderate",
    Risk.HIGH: "High",
    Risk.SEVERE: "Severe",
    Risk.NO_TRAVEL: "No Travel",
}

# Load-rule weight limits (lb).
HEAVY_LOAD_LB = 30_000
VERY_HEAVY_LOAD_LB = 40_000


def classify_wind(mph: float) -> Risk:
    if mph >= 55:
        return Risk.NO_TRAVEL
    if mph >= 45:
        return Risk.SEVERE
    if mph >= 35:
        return Risk.HIGH
    if mph >= 25:
        return Risk.MODERATE
    return Risk.LOW


def classify_rain(in_per_hr: float) -> Risk:
    if in_per_hr > 1.00:
        return Risk.NO_TRAVEL
    if in_per_hr >= 0.50:
        return Risk.SEVERE
    if in_per_hr >= 0.25:
        return Risk.HIGH
    if in_per_hr >= 0.10:
        return Risk.MODERATE
    return Risk.LOW


def classify_snow(in_per_hr: float) -> Risk:
    if in_per_hr > 3.0:
        return Risk.NO_TRAVEL
    if in_per_hr >= 2.0:
        return Risk.SEVERE
    if in_per_hr >= 1.0:
        return Risk.HIGH
    if in_per_hr >= 0.5:
        return Risk.MODERATE
    return Risk.LOW


def classify_wind_with_load(mph: float, load_lb: float) -> Risk:
    """Wind risk after applying the load rules.

    - >= 55 mph                -> No Travel for any load
    - 45-54 mph and > 30,000 lb -> No Travel
    - 35-44 mph and > 40,000 lb -> Severe
    """
    base = classify_wind(mph)
    if base == Risk.SEVERE and load_lb > HEAVY_LOAD_LB:
        return Risk.NO_TRAVEL
    if base == Risk.HIGH and load_lb > VERY_HEAVY_LOAD_LB:
        return Risk.SEVERE
    return base


@dataclass(frozen=True)
class Assessment:
    level: Risk
    cause: str | None  # "wind" | "rain" | "snow" | None when everything is Low
    reason: str


def assess(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float) -> Assessment:
    """Overall checkpoint risk: the worst of wind (load-adjusted), rain and snow."""
    wind_base = classify_wind(wind_mph)
    wind = classify_wind_with_load(wind_mph, load_lb)
    rain = classify_rain(rain_in_hr)
    snow = classify_snow(snow_in_hr)

    # On ties, wind wins (it carries the load explanation), then snow, then rain.
    candidates = [("wind", wind), ("snow", snow), ("rain", rain)]
    cause, level = max(candidates, key=lambda c: c[1])

    if level == Risk.LOW:
        return Assessment(Risk.LOW, None, "All conditions within Low thresholds")

    if cause == "wind":
        reason = f"Wind {_num(wind_mph, 1, 0)} mph"
        if wind != wind_base:
            reason += f" with {load_lb:,.0f} lb load"
    elif cause == "snow":
        reason = f"Snow {_num(snow_in_hr, 3, 2)} in/hr"
    else:
        reason = f"Rain {_num(rain_in_hr, 3, 2)} in/hr"
    return Assessment(level, cause, f"{reason} → {level.label}")


def _num(value: float, max_decimals: int, min_decimals: int) -> str:
    """Format at the data's own precision so a shown value never sits on the wrong side
    of a threshold (44.6 mph must not read "45 mph → High")."""
    text = f"{value:.{max_decimals}f}"
    if "." in text:
        whole, frac = text.split(".")
        frac = frac.rstrip("0").ljust(min_decimals, "0")
        text = f"{whole}.{frac}" if frac else whole
    return text
