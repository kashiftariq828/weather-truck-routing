"""Turn checkpoint risk into per-route mileage statistics and pick the best route."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from .risk import Risk


@dataclass(frozen=True)
class Segment:
    start_mile: float
    end_mile: float
    level: Risk | None  # None = no forecast available for either end


def segments_from_checkpoints(miles: Sequence[float], levels: Sequence[Risk | None]) -> list[Segment]:
    """The stretch between two checkpoints takes the worse of its two endpoints.

    Conservative by design: a storm seen at either end is assumed to cover the
    stretch between them.
    """
    out = []
    for i in range(len(miles) - 1):
        known = [lv for lv in (levels[i], levels[i + 1]) if lv is not None]
        out.append(Segment(miles[i], miles[i + 1], max(known) if known else None))
    return out


@dataclass(frozen=True)
class RouteStats:
    miles_by_level: dict[Risk, float]
    unknown_miles: float
    avg_risk: float  # mile-weighted mean of level numbers (0-4) over forecast-covered miles
    duration_s: float

    @property
    def no_travel_miles(self) -> float:
        return self.miles_by_level[Risk.NO_TRAVEL]

    @property
    def severe_miles(self) -> float:
        return self.miles_by_level[Risk.SEVERE]

    @property
    def high_miles(self) -> float:
        return self.miles_by_level[Risk.HIGH]


def route_stats(segments: Sequence[Segment], duration_s: float) -> RouteStats:
    by_level = dict.fromkeys(Risk, 0.0)
    unknown = 0.0
    for seg in segments:
        length = seg.end_mile - seg.start_mile
        if seg.level is None:
            unknown += length
        else:
            by_level[seg.level] += length
    known = sum(by_level.values())
    avg = sum(int(lv) * mi for lv, mi in by_level.items()) / known if known else 0.0
    return RouteStats(by_level, unknown, avg, duration_s)


def _ranking_key(s: RouteStats) -> tuple[float, float, float, float, float]:
    # Miles are compared at 0.1 mi and risk at 0.01 so float noise can't decide.
    return (
        round(s.no_travel_miles, 1),
        round(s.severe_miles, 1),
        round(s.high_miles, 1),
        round(s.avg_risk, 2),
        s.duration_s,
    )


@dataclass(frozen=True)
class Recommendation:
    order: list[int]  # route indices, best first
    best: int
    reason: str
    all_routes_no_travel: bool
    not_advised: list[int] = field(default_factory=list)


def recommend(stats: Sequence[RouteStats]) -> Recommendation:
    """Rank routes by: No-Travel miles, Severe miles, High miles, average risk, travel time.

    The spec's order starts at Severe miles; No-Travel miles are placed first
    so a route through No-Travel conditions is never preferred over one without.
    """
    if not stats:
        raise ValueError("no routes to rank")
    order = sorted(range(len(stats)), key=lambda i: _ranking_key(stats[i]))
    best = order[0]
    not_advised = [i for i in order if _ranking_key(stats[i])[0] > 0]  # same rounding as the ranking
    return Recommendation(
        order=order,
        best=best,
        reason=_explain(stats, order),
        all_routes_no_travel=len(not_advised) == len(stats),
        not_advised=not_advised,
    )


def _explain(stats: Sequence[RouteStats], order: Sequence[int]) -> str:
    if len(order) == 1:
        return "Only one route available"
    best, runner = stats[order[0]], stats[order[1]]
    kb, kr = _ranking_key(best), _ranking_key(runner)
    labels = ["No-Travel miles", "Severe miles", "High miles", "average risk"]
    for idx, label in enumerate(labels):
        if kb[idx] != kr[idx]:
            if idx == 3:
                return f"Lowest {label}: {kb[idx]:.2f} vs {kr[idx]:.2f}"
            return f"Fewest {label}: {kb[idx]:.1f} vs {kr[idx]:.1f}"
    diff_min = (runner.duration_s - best.duration_s) / 60
    if diff_min >= 1:
        return f"Equal weather risk — fastest by {diff_min:.0f} min"
    return "Equal weather risk and travel time"
