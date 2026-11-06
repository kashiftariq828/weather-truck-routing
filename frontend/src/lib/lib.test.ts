import { describe, expect, it } from 'vitest'
import type { Heatmap, Plan, PlannedRoute } from '../api'
import { defaultDeparture, formatAmount, formatDuration } from './format'
import { heatmapGeoJSON, heatRadiusAtZoom0, planBounds } from './geo'
import { friendlyReason, hazards, verdictFor } from './trip'

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(9450)).toBe('2h 38m')
    expect(formatDuration(1800)).toBe('30m')
  })
})

describe('defaultDeparture', () => {
  it('rounds up to the next full hour', () => {
    expect(defaultDeparture(new Date(2026, 0, 10, 8, 25))).toBe('2026-01-10T09:00')
  })
})

describe('heatmapGeoJSON', () => {
  it('flattens hourly levels into r0..rN properties and clamps unknown to 0', () => {
    const heat: Heatmap = { start: '', hours: 2, spacing_mi: 15, points: [{ lon: 1, lat: 2, levels: [0, 3, -1] }] }
    const fc = heatmapGeoJSON(heat)
    expect(fc.features[0].properties).toEqual({ r0: 0, r1: 3, r2: 0 })
    expect(fc.features[0].geometry.coordinates).toEqual([1, 2])
  })
})

describe('heatRadiusAtZoom0', () => {
  it('scales with grid spacing and latitude', () => {
    const equator = heatRadiusAtZoom0(15, 0)
    expect(heatRadiusAtZoom0(30, 0)).toBeCloseTo(equator * 2)
    expect(heatRadiusAtZoom0(15, 60)).toBeCloseTo(equator * 2)
  })
})

describe('formatAmount', () => {
  it('never rounds a value across a threshold', () => {
    expect(formatAmount(44.6, 1)).toBe('44.6')
    expect(formatAmount(47, 1)).toBe('47')
    expect(formatAmount(0.248, 3, 2)).toBe('0.248')
    expect(formatAmount(0.1, 3, 2)).toBe('0.10')
    expect(formatAmount(1.004, 3, 2)).toBe('1.004')
    expect(formatAmount(0, 3, 2)).toBe('0.00')
  })
})

describe('planBounds', () => {
  it('falls back to checkpoints when a route has no segments', () => {
    const plan = {
      routes: [{ segments: [], checkpoints: [{ lon: -100, lat: 40 }] }],
    } as unknown as Plan
    expect(planBounds(plan)).toEqual([
      [-100, 40],
      [-100, 40],
    ])
  })
})

const cp = (mile: number, level: number | null, reason = 'Rain 0.30 in/hr → High') => ({
  mile,
  lon: 0,
  lat: 0,
  eta: new Date(Date.UTC(2026, 0, 1, 8) + mile * 60_000).toISOString(),
  level,
  reason,
  weather: null,
})

const route = (id: number, levels: (number | null)[], stats: Partial<PlannedRoute['stats']> = {}, extra = {}) =>
  ({
    id,
    name: `Route ${'ABC'[id]}`,
    rank: id + 1,
    duration_s: 3600,
    checkpoints: levels.map((lv, i) => cp(i * 10, lv)),
    stats: { no_travel_mi: 0, severe_mi: 0, high_mi: 0, avg_risk: 0, ...stats },
    ...extra,
  }) as unknown as PlannedRoute

describe('verdictFor', () => {
  it('reads the worst checkpoint level', () => {
    expect(verdictFor(route(0, [0, 1, null]))).toBe('clear')
    expect(verdictFor(route(0, [0, 2, 1]))).toBe('caution')
    expect(verdictFor(route(0, [3, 0]))).toBe('danger')
    expect(verdictFor(route(0, [4]))).toBe('no-travel')
    expect(verdictFor(route(0, [null, null]))).toBe('clear')
  })
})

describe('hazards', () => {
  it('groups consecutive risky checkpoints and reports the worst point', () => {
    const r = route(0, [0, 1, 3, 2, 0, null, 2, 0])
    r.checkpoints[2].reason = 'Snow 2.10 in/hr → Severe'
    const hs = hazards(r)
    expect(hs.map((h) => [h.fromMile, h.toMile, h.level, h.peakIdx, h.cause, h.condition])).toEqual([
      [10, 30, 3, 2, 'snow', 'Snow 2.10 in/hr'],
      [60, 60, 2, 6, 'rain', 'Rain 0.30 in/hr'],
    ])
  })
  it('returns nothing for a clear route', () => {
    expect(hazards(route(0, [0, 0, null]))).toEqual([])
  })
})

describe('friendlyReason', () => {
  const plan = (a: PlannedRoute, b: PlannedRoute) => ({ routes: [a, b] }) as unknown as Plan
  it('explains the deciding factor in plain words', () => {
    expect(friendlyReason(plan(route(0, [], {}), route(1, [], { no_travel_mi: 20 })))).toBe(
      'Avoids 20 mi of No-Travel weather that Route B drives through.',
    )
    expect(friendlyReason(plan(route(0, [], { severe_mi: 4.5 }), route(1, [], { severe_mi: 40 })))).toBe(
      'Avoids 36 mi of severe weather that Route B drives through.',
    )
    expect(friendlyReason(plan(route(0, []), route(1, [], {}, { duration_s: 3600 + 95 * 60 })))).toBe(
      'Same weather risk as Route B, and 1 h 35 min faster.',
    )
    expect(friendlyReason({ routes: [route(0, [])] } as unknown as Plan)).toBe(
      'This is the only truck route available.',
    )
  })
})
