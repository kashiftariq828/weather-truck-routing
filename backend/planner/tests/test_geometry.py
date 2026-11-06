import pytest

from planner.domain.alternatives import is_distinct, via_candidates
from planner.domain.geometry import destination, haversine_mi, overlap_ratio, simplify
from planner.domain.heatmap import corridor_points

LINE = [(-100.0, 40.0 + i * 0.1) for i in range(31)]  # ~207 miles due north


def test_haversine_known_distance():
    # Denver -> Salt Lake City is ~371 miles great-circle.
    assert haversine_mi((-104.99, 39.74), (-111.89, 40.76)) == pytest.approx(371, rel=0.01)


def test_destination_round_trip():
    p = destination((-100.0, 40.0), 90, 50)
    assert haversine_mi((-100.0, 40.0), p) == pytest.approx(50, rel=1e-3)


def test_overlap_ratio():
    shifted = [(x + 1.0, y) for x, y in LINE]  # ~53 miles east
    assert overlap_ratio(LINE, LINE) == pytest.approx(1.0)
    assert overlap_ratio(LINE, shifted) == 0.0
    assert not is_distinct(LINE, [LINE])
    assert is_distinct(shifted, [LINE])


def test_via_candidates_sit_beside_the_midpoint():
    vias = via_candidates(LINE)
    assert len(vias) == 6
    mid = (-100.0, 41.5)
    first, second = vias[0], vias[1]
    assert first[0] > -100 > second[0]  # alternating east / west of a northbound route
    assert haversine_mi(mid, first) == pytest.approx(207 * 0.12, rel=0.05)


def test_simplify_keeps_endpoints_and_drops_collinear_points():
    out = simplify(LINE)
    assert out[0] == LINE[0]
    assert out[-1] == LINE[-1]
    assert len(out) == 2


def test_corridor_points_are_bounded_and_deduplicated():
    pts, spacing = corridor_points([LINE, LINE])
    assert len(pts) == len(set(pts))
    assert 0 < len(pts) <= 220
    assert spacing == 15
    long_line = [(-120.0 + i * 0.1, 40.0) for i in range(500)]  # ~2,100 miles
    long_pts, long_spacing = corridor_points([long_line])
    assert len(long_pts) <= 220
    assert long_spacing > 15
