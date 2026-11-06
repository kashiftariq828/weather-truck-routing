"""Sample points covering the corridor around the candidate routes."""

from __future__ import annotations

from collections.abc import Sequence

from .geometry import Point, bearing_deg, cumulative_miles, destination, point_at

OFFSETS_MI = (-30.0, -15.0, 0.0, 15.0, 30.0)
MAX_POINTS = 220


def corridor_points(
    routes: Sequence[Sequence[Point]],
    spacing_mi: float = 15.0,
    offsets_mi: Sequence[float] = OFFSETS_MI,
    max_points: int = MAX_POINTS,
) -> tuple[list[Point], float]:
    """A roughly even grid of points along and either side of every route.

    Points are snapped to a grid (cell ~= spacing) so overlapping routes don't
    double up. Spacing grows until the set fits `max_points`, which keeps
    weather-API usage bounded for very long trips. Returns (points, spacing_mi).
    """
    while True:
        pts = _sample(routes, spacing_mi, offsets_mi)
        if len(pts) <= max_points:
            return pts, spacing_mi
        spacing_mi *= 1.25


def _sample(routes: Sequence[Sequence[Point]], spacing_mi: float, offsets_mi: Sequence[float]) -> list[Point]:
    cell = spacing_mi / 69.0  # degrees of latitude per mile ~= 1/69
    seen: dict[tuple[int, int], Point] = {}
    for coords in routes:
        if len(coords) < 2:
            continue
        cum = cumulative_miles(coords)
        total = cum[-1]
        m = 0.0
        while m <= total:
            here = point_at(coords, cum, m)
            ahead = point_at(coords, cum, min(total, m + 2.0))
            behind = point_at(coords, cum, max(0.0, m - 2.0))
            heading = bearing_deg(behind, ahead)
            for off in offsets_mi:
                p = here if off == 0 else destination(here, heading + 90, off)
                key = (round(p[0] / cell), round(p[1] / cell))
                seen.setdefault(key, (round(key[0] * cell, 4), round(key[1] * cell, 4)))
            m += spacing_mi
    return list(seen.values())
