import itertools
from datetime import UTC, datetime, timedelta

import pytest

from planner.domain.checkpoints import Step, build_checkpoints, vertex_times
from planner.domain.geometry import cumulative_miles

DEPART = datetime(2026, 1, 10, 8, 0, tzinfo=UTC)

# A straight line due north: 1 degree of latitude ~= 69.09 miles.
LINE = [(-100.0, 40.0 + i * 0.1) for i in range(11)]  # ~69 miles, 10 segments


def test_constant_speed_without_steps():
    times = vertex_times(LINE, [], total_duration_s=3600)
    assert times[0] == 0
    assert times[-1] == pytest.approx(3600)
    assert times[5] == pytest.approx(1800, rel=1e-3)


def test_step_durations_shape_timing():
    # First half is slow (city), second half fast (interstate).
    steps = [Step(0, 5, 3000), Step(5, 10, 600)]
    times = vertex_times(LINE, steps, total_duration_s=3600)
    assert times[5] == pytest.approx(3000)
    assert times[10] == pytest.approx(3600)
    assert times[2] < times[5] < times[7]


def test_step_indices_beyond_geometry_are_clamped():
    steps = [Step(0, 5, 1800), Step(5, 25, 1800)]  # second step overruns the 11-vertex line
    times = vertex_times(LINE, steps, total_duration_s=3600)
    assert len(times) == len(LINE)
    assert times[-1] == pytest.approx(3600)
    assert times == sorted(times)


@pytest.mark.parametrize("interval", [10, 25, 50])
def test_checkpoint_spacing_includes_start_and_end(interval):
    times = vertex_times(LINE, [], 3600)
    cps = build_checkpoints(LINE, times, interval, DEPART)
    total = cumulative_miles(LINE)[-1]
    assert cps[0].mile == 0
    assert cps[-1].mile == pytest.approx(total)
    # Every stretch is exactly one interval, except the last one into the destination.
    for a, b in itertools.pairwise(cps[:-1]):
        assert b.mile - a.mile == pytest.approx(interval)
    assert cps[-1].mile - cps[-2].mile <= interval + 1e-6


def test_etas_increase_and_end_at_arrival():
    times = vertex_times(LINE, [], 3600)
    cps = build_checkpoints(LINE, times, 10, DEPART)
    etas = [cp.eta for cp in cps]
    assert etas == sorted(etas)
    assert etas[0] == DEPART
    assert etas[-1] == DEPART + timedelta(seconds=3600)


def test_checkpoint_position_is_interpolated():
    times = vertex_times(LINE, [], 3600)
    cps = build_checkpoints(LINE, times, 10, DEPART)
    lon, lat = cps[1].point
    assert lon == pytest.approx(-100.0)
    assert lat == pytest.approx(40.0 + 10 / 69.09, abs=1e-3)


def test_gap_between_steps_leaves_no_vertex_at_time_zero():
    # Vertices 3-4 aren't covered by any step; they must still get increasing times.
    steps = [Step(0, 3, 1000), Step(5, 10, 1000)]
    times = vertex_times(LINE, steps, total_duration_s=2000)
    assert all(b > a for a, b in itertools.pairwise(times))
    assert times[-1] == pytest.approx(2000)


def test_steps_without_duration_fall_back_to_constant_speed():
    times = vertex_times(LINE, [Step(0, 10, 0)], total_duration_s=3600)
    assert times[5] == pytest.approx(1800, rel=1e-3)
    assert times[-1] == pytest.approx(3600)
