"""Geometry helpers. Points are (lon, lat) tuples, matching GeoJSON order."""

from __future__ import annotations

import itertools
import math
from bisect import bisect_right
from collections.abc import Sequence

Point = tuple[float, float]

EARTH_RADIUS_MI = 3958.8
METERS_PER_MILE = 1609.344


def haversine_mi(a: Point, b: Point) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_MI * math.asin(min(1.0, math.sqrt(h)))


def cumulative_miles(coords: Sequence[Point]) -> list[float]:
    """Distance from the start of the line to each vertex."""
    out = [0.0]
    for prev, cur in itertools.pairwise(coords):
        out.append(out[-1] + haversine_mi(prev, cur))
    return out


def locate(cum: Sequence[float], target: float) -> tuple[int, float]:
    """Find the segment containing `target` miles.

    Returns (i, f) such that the point lies on segment i -> i+1 at fraction f.
    """
    if len(cum) < 2:
        return 0, 0.0
    target = min(max(target, 0.0), cum[-1])
    i = min(bisect_right(cum, target) - 1, len(cum) - 2)
    seg = cum[i + 1] - cum[i]
    f = (target - cum[i]) / seg if seg > 0 else 0.0
    return i, f


def lerp_point(a: Point, b: Point, f: float) -> Point:
    return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)


def point_at(coords: Sequence[Point], cum: Sequence[float], target: float) -> Point:
    i, f = locate(cum, target)
    if len(coords) < 2:
        return coords[0]
    return lerp_point(coords[i], coords[i + 1], f)


def bearing_deg(a: Point, b: Point) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def destination(origin: Point, bearing: float, distance_mi: float) -> Point:
    """Point reached travelling `distance_mi` from `origin` along `bearing` degrees."""
    lon1, lat1 = math.radians(origin[0]), math.radians(origin[1])
    brg = math.radians(bearing)
    d = distance_mi / EARTH_RADIUS_MI
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(brg))
    lon2 = lon1 + math.atan2(
        math.sin(brg) * math.sin(d) * math.cos(lat1),
        math.cos(d) - math.sin(lat1) * math.sin(lat2),
    )
    return (((math.degrees(lon2) + 540) % 360) - 180, math.degrees(lat2))


def overlap_ratio(a: Sequence[Point], b: Sequence[Point], cell_deg: float = 0.02) -> float:
    """Approximate share of line `a` that runs along line `b`.

    Both lines are rasterised onto a coarse grid (~1.4 mi cells); the ratio is
    the fraction of `a`'s cells that `b` also touches (including neighbours).
    """

    def cells(line: Sequence[Point]) -> set[tuple[int, int]]:
        out: set[tuple[int, int]] = set()
        for p, q in itertools.pairwise(line):
            steps = max(1, int(max(abs(q[0] - p[0]), abs(q[1] - p[1])) / cell_deg))
            for k in range(steps + 1):
                x, y = lerp_point(p, q, k / steps)
                out.add((int(x // cell_deg), int(y // cell_deg)))
        return out

    a_cells = cells(a)
    if not a_cells:
        return 0.0
    b_cells = cells(b)
    shared = sum(
        1 for cx, cy in a_cells if any((cx + dx, cy + dy) in b_cells for dx in (-1, 0, 1) for dy in (-1, 0, 1))
    )
    return shared / len(a_cells)


def simplify(coords: Sequence[Point], tolerance_deg: float = 0.0004) -> list[Point]:
    """Ramer-Douglas-Peucker line simplification (iterative)."""
    n = len(coords)
    if n <= 2:
        return list(coords)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    tol2 = tolerance_deg**2
    while stack:
        start, end = stack.pop()
        ax, ay = coords[start]
        bx, by = coords[end]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        worst, worst_i = -1.0, -1
        for i in range(start + 1, end):
            px, py = coords[i]
            if seg2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > worst:
                worst, worst_i = d2, i
        if worst > tol2:
            keep[worst_i] = True
            stack.append((start, worst_i))
            stack.append((worst_i, end))
    return [p for p, k in zip(coords, keep, strict=True) if k]
