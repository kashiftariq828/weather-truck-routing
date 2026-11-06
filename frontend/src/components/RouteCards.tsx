import type { CSSProperties } from 'react'
import type { Plan, PlannedRoute } from '../api'
import { formatDuration, formatMiles, formatTime } from '../lib/format'
import { RISK_LEVELS, UNKNOWN_COLOR } from '../lib/risk'
import { AlertIcon, ShieldIcon } from './Icons'

interface Props {
  plan: Plan
  selectedId: number
  onSelect: (id: number) => void
}

export function RouteCards({ plan, selectedId, onSelect }: Props) {
  const ranked = [...plan.routes].sort((a, b) => a.rank - b.rank)
  return (
    <div className="space-y-3">
      {ranked.map((r, i) => (
        <RouteCard
          key={`${plan.plan_id}-${r.id}`}
          index={i}
          route={r}
          selected={r.id === selectedId}
          reason={r.recommended ? plan.recommendation_reason : null}
          onSelect={() => onSelect(r.id)}
        />
      ))}
    </div>
  )
}

/** Color of the worst risk level the route passes through. */
function worstColor(route: PlannedRoute): string {
  const worst = [...RISK_LEVELS].reverse().find((r) => (route.stats.miles_by_level[r.label] ?? 0) > 0)
  return worst?.color ?? UNKNOWN_COLOR
}

function RouteCard({
  index,
  route,
  selected,
  reason,
  onSelect,
}: {
  index: number
  route: PlannedRoute
  selected: boolean
  reason: string | null
  onSelect: () => void
}) {
  const s = route.stats
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{ '--i': index } as CSSProperties}
      className={`card-in relative w-full overflow-hidden rounded-xl bg-white p-3.5 pl-4 text-left shadow-sm ring-1 transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        selected ? 'ring-2 ring-brand' : 'ring-slate-900/5'
      }`}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: worstColor(route) }} />

      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-slate-900">{route.name}</span>
        {route.recommended && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
            <ShieldIcon size={12} /> Recommended
          </span>
        )}
        {route.not_advised && (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-700 px-2 py-0.5 text-xs font-semibold text-white">
            <AlertIcon size={12} /> Not advised
          </span>
        )}
        {route.is_detour && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Detour</span>
        )}
        <span
          className={`ml-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
            route.rank === 1 ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700'
          }`}
          title={`Ranked #${route.rank}`}
        >
          #{route.rank}
        </span>
      </div>
      {route.via.length > 0 && <p className="mt-0.5 truncate text-xs text-slate-700">via {route.via.join(', ')}</p>}

      <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
        <Stat label="Distance" value={formatMiles(route.distance_mi)} />
        <Stat label="Drive time" value={formatDuration(route.duration_s)} />
        <Stat label="Arrive" value={formatTime(route.arrival)} />
      </div>

      <RiskBar route={route} index={index} />

      <div className="mt-2.5 grid grid-cols-4 gap-2 text-xs">
        <Stat label="No Travel" value={formatMiles(s.no_travel_mi)} danger={s.no_travel_mi > 0} />
        <Stat label="Severe" value={formatMiles(s.severe_mi)} danger={s.severe_mi > 0} />
        <Stat label="High" value={formatMiles(s.high_mi)} />
        <Stat label="Avg risk" value={`${s.avg_risk.toFixed(2)} / 4`} />
      </div>

      {reason && (
        <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800">
          <ShieldIcon size={13} className="shrink-0" />
          {reason}
        </p>
      )}
    </button>
  )
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <div className="text-xs font-medium tracking-wider text-slate-600 uppercase">{label}</div>
      <div className={`font-semibold tabular-nums ${danger ? 'text-red-600' : 'text-slate-800'}`}>{value}</div>
    </div>
  )
}

/** Share of the route's miles at each risk level. */
function RiskBar({ route, index }: { route: PlannedRoute; index: number }) {
  const parts = [
    ...RISK_LEVELS.map((r) => ({ label: r.label, color: r.color, miles: route.stats.miles_by_level[r.label] ?? 0 })),
    { label: 'No forecast', color: UNKNOWN_COLOR, miles: route.stats.unknown_mi },
  ].filter((p) => p.miles > 0)
  const total = parts.reduce((t, p) => t + p.miles, 0) || 1
  return (
    <div
      className="bar-grow mt-2.5 flex h-2 overflow-hidden rounded-full bg-slate-100"
      style={{ '--i': index } as CSSProperties}
      aria-label="Miles by risk level"
    >
      {parts.map((p) => (
        <div
          key={p.label}
          title={`${p.label}: ${formatMiles(p.miles)}`}
          style={{ width: `${(p.miles / total) * 100}%`, background: p.color }}
        />
      ))}
    </div>
  )
}
