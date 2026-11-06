"""Fallback alternative routes: detour through a via point beside the main route.

Routing APIs don't always return three alternatives (some refuse them on
long trips, or find fewer than requested). Pushing the route through a point offset
to the left or right of the main route's midpoint produces a genuinely
different corridor, which is what a weather comparison needs.
"""

from __future__ import annotations

from collections.abc import Sequence

from .geometry import Point, bearing_deg, cumulative_miles, destination, overlap_ratio, point_at

# Offsets as a share of trip length, tried in order on alternating sides.
OFFSET_SHARES = (0.12, 0.2, 0.3)
MIN_OFFSET_MI = 8.0
MAX_OFFSET_MI = 150.0
MAX_OVERLAP = 0.85


def via_candidates(main: Sequence[Point]) -> list[Point]:
    """Via points beside the main route's midpoint, nearest first, alternating sides."""
    cum = cumulative_miles(main)
    total = cum[-1]
    if total == 0:
        return []
    mid = point_at(main, cum, total / 2)
    heading = bearing_deg(point_at(main, cum, total * 0.4), point_at(main, cum, total * 0.6))
    out = []
    for share in OFFSET_SHARES:
        dist = min(MAX_OFFSET_MI, max(MIN_OFFSET_MI, total * share))
        out.append(destination(mid, heading + 90, dist))
        out.append(destination(mid, heading - 90, dist))
    return out


def is_distinct(
    candidate: Sequence[Point], existing: Sequence[Sequence[Point]], max_overlap: float = MAX_OVERLAP
) -> bool:
    return all(overlap_ratio(candidate, other) <= max_overlap for other in existing)
