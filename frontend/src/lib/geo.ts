import type { FeatureCollection, LineString, Point } from 'geojson'
import type { ExpressionSpecification } from 'maplibre-gl'
import type { Heatmap, Plan } from '../api'

/** Route geometry split into risk-colored pieces. `level` -1 = no forecast. */
export function routesGeoJSON(plan: Plan): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: plan.routes.flatMap((r) =>
      r.segments.map((s) => ({
        type: 'Feature' as const,
        properties: { routeId: r.id, level: s.level ?? -1 },
        geometry: { type: 'LineString' as const, coordinates: s.coords },
      })),
    ),
  }
}

export function checkpointsGeoJSON(plan: Plan): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: plan.routes.flatMap((r) =>
      r.checkpoints.map((c, idx) => ({
        type: 'Feature' as const,
        properties: { routeId: r.id, idx, level: c.level ?? -1 },
        geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
      })),
    ),
  }
}

/**
 * One feature per corridor point with flat properties r0..r48 (risk level per hour).
 * MapLibre stringifies nested arrays, so every hour gets its own numeric property;
 * the slider then only swaps which property the heatmap weight reads.
 */
export function heatmapGeoJSON(heat: Heatmap): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: heat.points.map((p) => {
      const props: Record<string, number> = {}
      p.levels.forEach((lv, h) => (props[`r${h}`] = Math.max(0, lv)))
      return {
        type: 'Feature' as const,
        properties: props,
        geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
      }
    }),
  }
}

/** Heatmap weight for a forecast hour: risk level 0-4 scaled to 0-1. */
export function heatWeight(hour: number): ExpressionSpecification {
  return ['/', ['get', `r${hour}`], 4]
}

type Bounds = [[number, number], [number, number]]

export function planBounds(plan: Plan): Bounds {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
  const extend = ([x, y]: [number, number]) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  // Checkpoints too: a zero-length route has no segments, and fitBounds can't take Infinity.
  for (const r of plan.routes) {
    for (const s of r.segments) s.coords.forEach(extend)
    for (const c of r.checkpoints) extend([c.lon, c.lat])
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ]
}

const EARTH_CIRCUMFERENCE_MI = 24901
const TILE_SIZE = 512

/**
 * Heatmap radius in pixels at zoom 0 so each point's blur covers about its own
 * grid cell. Radius then doubles per zoom level, keeping the colors stable
 * as the user zooms instead of fading or saturating.
 */
export function heatRadiusAtZoom0(spacingMi: number, latitude: number, factor = 1.4): number {
  const pxPerMile = TILE_SIZE / (EARTH_CIRCUMFERENCE_MI * Math.cos((latitude * Math.PI) / 180))
  return factor * spacingMi * pxPerMile
}
