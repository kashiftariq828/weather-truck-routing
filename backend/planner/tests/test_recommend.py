import pytest

from planner.domain.recommend import Segment, recommend, route_stats, segments_from_checkpoints
from planner.domain.risk import Risk

L, M, H, S, N = Risk.LOW, Risk.MODERATE, Risk.HIGH, Risk.SEVERE, Risk.NO_TRAVEL


def stats_for(levels_by_segment, duration_s=3600, seg_len=10):
    segs = [Segment(i * seg_len, (i + 1) * seg_len, lv) for i, lv in enumerate(levels_by_segment)]
    return route_stats(segs, duration_s)


def test_segment_takes_worse_endpoint():
    segs = segments_from_checkpoints([0, 10, 20], [L, S, M])
    assert [s.level for s in segs] == [S, S]


def test_segment_with_missing_forecast():
    segs = segments_from_checkpoints([0, 10, 20], [None, M, None])
    assert [s.level for s in segs] == [M, M]
    segs = segments_from_checkpoints([0, 10], [None, None])
    assert segs[0].level is None


def test_route_stats_miles_and_mile_weighted_average():
    s = stats_for([L, H, S, None])
    assert s.severe_miles == 10
    assert s.high_miles == 10
    assert s.unknown_miles == 10
    assert s.avg_risk == pytest.approx((0 + 2 + 3) / 3)


def test_fewest_severe_miles_wins_over_speed():
    fast_but_severe = stats_for([S, L], duration_s=1000)
    slow_but_safe = stats_for([H, H], duration_s=9000)
    rec = recommend([fast_but_severe, slow_but_safe])
    assert rec.best == 1
    assert "Severe" in rec.reason


def test_high_miles_break_severe_tie():
    a = stats_for([H, H, L])
    b = stats_for([H, M, M])
    assert recommend([a, b]).best == 1


def test_average_risk_breaks_high_tie():
    a = stats_for([M, M, L])
    b = stats_for([M, L, L])
    assert recommend([a, b]).best == 1


def test_travel_time_is_last_tiebreaker():
    a = stats_for([L, M], duration_s=5000)
    b = stats_for([M, L], duration_s=4000)
    rec = recommend([a, b])
    assert rec.best == 1
    assert "fastest" in rec.reason


def test_no_travel_route_is_never_preferred():
    no_travel = stats_for([N, L, L])
    many_severe = stats_for([S, S, S])
    rec = recommend([no_travel, many_severe])
    assert rec.best == 1
    assert rec.not_advised == [0]
    assert not rec.all_routes_no_travel


def test_all_routes_no_travel_flag():
    rec = recommend([stats_for([N]), stats_for([N, N])])
    assert rec.all_routes_no_travel
    assert rec.best == 0


def test_not_advised_uses_the_same_rounding_as_the_ranking():
    # 0.04 mi of No Travel rounds to 0.0: ranked as clean, so it must not be flagged either.
    tiny = route_stats([Segment(0, 0.04, N), Segment(0.04, 10, L)], 3600)
    real = route_stats([Segment(0, 0.06, N), Segment(0.06, 10, L)], 3600)
    rec = recommend([tiny, real])
    assert rec.not_advised == [1]
