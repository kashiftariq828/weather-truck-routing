"""Place checkpoints along a route and estimate when the truck reaches each one."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from .geometry import Point, cumulative_miles, locate, point_at


@dataclass(frozen=True)
class Step:
    """A routing-engine step: `duration_s` spent between vertex indices start..end."""

    start: int
    end: int
    duration_s: float


@dataclass(frozen=True)
class Checkpoint:
    mile: float
    point: Point
    eta: datetime
    vertex_index: int  # index of the route vertex at or just before this checkpoint


def vertex_times(coords: Sequence[Point], steps: Sequence[Step], total_duration_s: float) -> list[float]:
    """Seconds from departure to each vertex.

    Each step's duration is spread over its vertices in proportion to distance,
    so slow city streets and fast interstates each get realistic timing. Falls
    back to constant speed when the router supplied no steps.
    """
    n = len(coords)
    if n == 0:
        return []
    cum = cumulative_miles(coords)
    if not steps:
        total = cum[-1] or 1.0
        return [total_duration_s * d / total for d in cum]

    times = [0.0] * n
    elapsed = 0.0
    filled_to = 0
    for step in sorted(steps, key=lambda s: s.start):
        end = min(step.end, n - 1)
        # Steps are expected to be contiguous. If one overlaps the previous it is clipped;
        # if there is a gap, the step is stretched back over it so no vertex is left at 0 s.
        start = min(filled_to, end)
        span = cum[end] - cum[start]
        for i in range(start + 1, end + 1):
            frac = (cum[i] - cum[start]) / span if span > 0 else (i - start) / max(1, end - start)
            times[i] = elapsed + step.duration_s * frac
        if end > start:
            elapsed += step.duration_s
            filled_to = end
    # Any vertices past the last step (shouldn't happen) inherit the final time.
    for i in range(filled_to + 1, n):
        times[i] = elapsed
    if times[-1] <= 0:  # steps carried no time at all: fall back to constant speed
        return vertex_times(coords, [], total_duration_s)
    # Keep the arrival time consistent with the router's total even if steps were clipped.
    if total_duration_s > 0:
        scale = total_duration_s / times[-1]
        times = [t * scale for t in times]
    return times


def build_checkpoints(
    coords: Sequence[Point],
    times_s: Sequence[float],
    interval_mi: float,
    departure: datetime,
) -> list[Checkpoint]:
    """Checkpoints at 0, interval, 2*interval, ... plus the destination."""
    cum = cumulative_miles(coords)
    total = cum[-1]
    miles = [0.0]
    m = interval_mi
    while m < total - 1e-6:
        miles.append(m)
        m += interval_mi
    if total > 0:
        miles.append(total)

    out = []
    for mile in miles:
        i, f = locate(cum, mile)
        t = times_s[i] + (times_s[i + 1] - times_s[i]) * f if len(coords) >= 2 else 0.0
        out.append(
            Checkpoint(
                mile=mile,
                point=point_at(coords, cum, mile),
                eta=departure + timedelta(seconds=t),
                vertex_index=i,
            )
        )
    return out
