import pytest

from planner.domain.risk import (
    Risk,
    assess,
    classify_rain,
    classify_snow,
    classify_wind,
    classify_wind_with_load,
)

L, M, H, S, N = Risk.LOW, Risk.MODERATE, Risk.HIGH, Risk.SEVERE, Risk.NO_TRAVEL


@pytest.mark.parametrize(
    ("mph", "expected"),
    [(0, L), (24.9, L), (25, M), (34.9, M), (35, H), (44.9, H), (45, S), (54.9, S), (55, N), (80, N)],
)
def test_wind_thresholds(mph, expected):
    assert classify_wind(mph) == expected


@pytest.mark.parametrize(
    ("rate", "expected"),
    [(0, L), (0.09, L), (0.10, M), (0.24, M), (0.25, H), (0.49, H), (0.50, S), (1.00, S), (1.01, N)],
)
def test_rain_thresholds(rate, expected):
    assert classify_rain(rate) == expected


@pytest.mark.parametrize(
    ("rate", "expected"),
    [(0, L), (0.49, L), (0.5, M), (0.99, M), (1.0, H), (1.99, H), (2.0, S), (3.0, S), (3.01, N)],
)
def test_snow_thresholds(rate, expected):
    assert classify_snow(rate) == expected


@pytest.mark.parametrize(
    ("mph", "load", "expected"),
    [
        # >= 55 mph: No Travel for any load
        (55, 0, N),
        (60, 10_000, N),
        # 45-54 mph: No Travel above 30,000 lb, otherwise Severe
        (47, 30_000, S),
        (47, 30_001, N),
        (54.9, 45_000, N),
        # 35-44 mph: Severe above 40,000 lb, otherwise High
        (40, 40_000, H),
        (40, 40_001, S),
        (35, 80_000, S),
        # Below 35 mph load doesn't matter
        (34.9, 80_000, M),
        (10, 80_000, L),
    ],
)
def test_load_rules(mph, load, expected):
    assert classify_wind_with_load(mph, load) == expected


def test_assess_takes_worst_condition():
    a = assess(wind_mph=10, rain_in_hr=0.3, snow_in_hr=2.5, load_lb=20_000)
    assert a.level == S
    assert a.cause == "snow"


def test_assess_explains_load_rule():
    a = assess(wind_mph=47, rain_in_hr=0, snow_in_hr=0, load_lb=38_000)
    assert a.level == N
    assert a.cause == "wind"
    assert "38,000 lb" in a.reason
    assert "No Travel" in a.reason


def test_assess_all_low():
    a = assess(wind_mph=5, rain_in_hr=0, snow_in_hr=0, load_lb=40_000)
    assert a.level == L
    assert a.cause is None


@pytest.mark.parametrize(
    ("args", "reason"),
    [
        ((44.6, 0, 0, 0), "Wind 44.6 mph → High"),  # must not round up to "45 mph"
        ((47.0, 0, 0, 0), "Wind 47 mph → Severe"),
        ((0, 0.248, 0, 0), "Rain 0.248 in/hr → Moderate"),  # must not round up to "0.25"
        ((0, 0.1, 0, 0), "Rain 0.10 in/hr → Moderate"),
        ((0, 1.004, 0, 0), "Rain 1.004 in/hr → No Travel"),  # must not read "1.00 → No Travel"
        ((0, 0, 3.01, 0), "Snow 3.01 in/hr → No Travel"),
    ],
)
def test_reason_shows_values_at_data_precision(args, reason):
    assert assess(*args).reason == reason
