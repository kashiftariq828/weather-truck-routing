import type { Checkpoint, Plan, PlannedRoute, RiskLevel } from '../api'

/** One-glance answer for the driver, from the worst level on the route. */
export type Verdict = 'clear' | 'caution' | 'danger' | 'no-travel'

function worstLevel(route: PlannedRoute): RiskLevel | null {
  const known = route.checkpoints.map((c) => c.level).filter((lv): lv is RiskLevel => lv !== null)
  return known.length ? (Math.max(...known) as RiskLevel) : null
}

export function verdictFor(route: PlannedRoute): Verdict {
  const worst = worstLevel(route) ?? 0
  if (worst >= 4) return 'no-travel'
  if (worst === 3) return 'danger'
  if (worst === 2) return 'caution'
  return 'clear'
}

/** A run of consecutive checkpoints at Moderate or worse, reported at its worst point. */
export interface Hazard {
  routeId: number
  /** Index of the worst checkpoint in the run, for focusing the map. */
  peakIdx: number
  fromMile: number
  toMile: number
  level: RiskLevel
  cause: 'wind' | 'rain' | 'snow'
  /** What was measured, e.g. "Rain 0.30 in/hr" or "Wind 47 mph with 38,000 lb load". */
  condition: string
  eta: string
}

export function hazards(route: PlannedRoute, minLevel: RiskLevel = 1): Hazard[] {
  const out: Hazard[] = []
  let run: { cps: Checkpoint[]; idx: number[] } | null = null
  const flush = () => {
    if (!run) return
    // Worst level wins; on a tie, the first (earliest) point of that level.
    let peak = 0
    run.cps.forEach((c, i) => {
      if ((c.level ?? 0) > (run!.cps[peak].level ?? 0)) peak = i
    })
    const p = run.cps[peak]
    out.push({
      routeId: route.id,
      peakIdx: run.idx[peak],
      fromMile: run.cps[0].mile,
      toMile: run.cps[run.cps.length - 1].mile,
      level: p.level as RiskLevel,
      cause: causeOf(p.reason),
      condition: p.reason.split(' → ')[0],
      eta: p.eta,
    })
    run = null
  }
  route.checkpoints.forEach((c, i) => {
    if (c.level !== null && c.level >= minLevel) {
      run ??= { cps: [], idx: [] }
      run.cps.push(c)
      run.idx.push(i)
    } else {
      flush()
    }
  })
  flush()
  return out
}

/** The backend's reasons start with the condition that set the level ("Rain 1.15 in/hr → No Travel"). */
function causeOf(reason: string): Hazard['cause'] {
  if (reason.startsWith('Wind')) return 'wind'
  if (reason.startsWith('Snow')) return 'snow'
  return 'rain'
}

/**
 * Why the recommended route won, in a driver's words. Walks the same keys, in the
 * same order and at the same precision, as the backend ranking.
 */
export function friendlyReason(plan: Plan): string {
  const ranked = [...plan.routes].sort((a, b) => a.rank - b.rank)
  const [best, next] = ranked
  if (!next) return 'This is the only truck route available.'
  const a = best.stats
  const b = next.stats
  const mi = (n: number) => `${Math.round(n)} mi`
  if (a.no_travel_mi !== b.no_travel_mi)
    return `Avoids ${mi(b.no_travel_mi - a.no_travel_mi)} of No-Travel weather that ${next.name} drives through.`
  if (a.severe_mi !== b.severe_mi)
    return `Avoids ${mi(b.severe_mi - a.severe_mi)} of severe weather that ${next.name} drives through.`
  if (a.high_mi !== b.high_mi) return `${mi(b.high_mi - a.high_mi)} less high-risk weather than ${next.name}.`
  if (a.avg_risk !== b.avg_risk) return `Calmer weather overall than ${next.name}.`
  const saved = Math.round((next.duration_s - best.duration_s) / 60)
  if (saved >= 1) return `Same weather risk as ${next.name}, and ${formatMinutes(saved)} faster.`
  return `Same weather and drive time as ${next.name}.`
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h ${m} min` : `${m} min`
}
