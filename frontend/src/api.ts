export interface Place {
  label: string
  lon: number
  lat: number
}

export type RiskLevel = 0 | 1 | 2 | 3 | 4

export interface CheckpointWeather {
  wind_mph: number
  gust_mph: number | null
  rain_in_hr: number
  snow_in_hr: number
}

export interface Checkpoint {
  mile: number
  lon: number
  lat: number
  eta: string
  level: RiskLevel | null
  reason: string
  weather: CheckpointWeather | null
}

export interface RouteSegment {
  level: RiskLevel | null
  coords: [number, number][]
}

export interface RouteStats {
  miles_by_level: Record<string, number>
  unknown_mi: number
  no_travel_mi: number
  severe_mi: number
  high_mi: number
  avg_risk: number
}

export interface PlannedRoute {
  id: number
  name: string
  via: string[]
  is_detour: boolean
  distance_mi: number
  duration_s: number
  arrival: string
  stats: RouteStats
  checkpoints: Checkpoint[]
  segments: RouteSegment[]
  rank: number
  recommended: boolean
  not_advised: boolean
}

export interface Plan {
  plan_id: string
  departure: string
  load_lb: number
  interval_mi: number
  recommended_id: number
  recommendation_reason: string
  all_routes_no_travel: boolean
  routes: PlannedRoute[]
}

export interface PlanRequest {
  origin: { lon: number; lat: number }
  destination: { lon: number; lat: number }
  departure: string
  load_lb: number
  interval_mi: 10 | 25 | 50
}

export interface Heatmap {
  start: string
  hours: number
  spacing_mi: number
  points: { lon: number; lat: number; levels: number[] }[]
}

export class ApiError extends Error {}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let resp: Response
  try {
    resp = await fetch(url, init)
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.')
  }
  const body: unknown = await resp.json().catch(() => null)
  if (!resp.ok) throw new ApiError(errorMessage(body) ?? `Request failed (${resp.status})`)
  return body as T
}

/** DRF errors are either {detail} or {field: [messages]} (possibly nested); flatten them for display. */
export function errorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  if ('detail' in body && typeof body.detail === 'string') return body.detail
  return messages(body).join(' ') || null
}

function messages(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(messages)
  if (value && typeof value === 'object') return Object.values(value).flatMap(messages)
  return typeof value === 'string' || typeof value === 'number' ? [String(value)] : []
}

export function geocode(q: string, signal?: AbortSignal): Promise<Place[]> {
  return request(`/api/geocode?q=${encodeURIComponent(q)}`, { signal })
}

export function planTrip(body: PlanRequest): Promise<Plan> {
  return request('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function fetchHeatmap(planId: string): Promise<Heatmap> {
  return request(`/api/plan/${planId}/heatmap`)
}
