import { useEffect, useRef } from 'react'
import type { Plan, PlannedRoute } from '../api'
import { formatDuration, formatMiles, formatTime } from '../lib/format'
import { riskColor, riskLabel } from '../lib/risk'
import { friendlyReason, hazards, verdictFor, type Hazard, type Verdict } from '../lib/trip'
import { AlertIcon, CheckIcon, CloudRainIcon, ShieldIcon, SnowIcon, WindIcon } from './Icons'

const VERDICTS: Record<
  Verdict,
  { title: string; text: (route: string) => string; className: string; urgent: boolean }
> = {
  clear: {
    title: 'Good to go',
    text: (r) => `Clear to light weather the whole way on ${r}.`,
    className: 'from-emerald-600 to-emerald-700',
    urgent: false,
  },
  caution: {
    title: 'Drive with caution',
    text: (r) => `High-risk weather on part of ${r}. Slow down through the hazards below.`,
    className: 'from-orange-500 to-orange-600',
    urgent: false,
  },
  danger: {
    title: 'Severe weather on route',
    text: (r) => `Even the safest option, ${r}, crosses severe weather. Consider delaying departure.`,
    className: 'from-red-600 to-red-700',
    urgent: true,
  },
  'no-travel': {
    title: 'Do not travel',
    text: () =>
      'Every route crosses No-Travel conditions. Delay departure — use the forecast slider to find a safer window.',
    className: 'from-purple-700 to-purple-800',
    urgent: true,
  },
}

const CAUSE_ICON = { wind: WindIcon, rain: CloudRainIcon, snow: SnowIcon }
const MAX_HAZARDS = 6

interface Props {
  plan: Plan
  selectedId: number
  onFocusHazard: (h: Hazard) => void
}

/** The answer first: verdict, recommended route, why, and what's ahead on the selected route. */
export function TripSummary({ plan, selectedId, onFocusHazard }: Props) {
  const best = plan.routes.find((r) => r.recommended) ?? plan.routes[0]
  const selected = plan.routes.find((r) => r.id === selectedId) ?? best
  const v = VERDICTS[plan.all_routes_no_travel ? 'no-travel' : verdictFor(best)]
  const ref = useRef<HTMLElement>(null)

  // Bring the answer into view as soon as a new plan arrives; the form above it is done with.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [plan.plan_id])

  return (
    <section ref={ref} aria-label="Trip summary" className="card-in scroll-mt-4 space-y-3">
      <div className={`overflow-hidden rounded-2xl bg-gradient-to-br ${v.className} p-4 text-white shadow-lg`}>
        <div className="flex items-start gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 ${
              v.urgent ? 'animate-pulse' : ''
            }`}
          >
            {v.urgent ? <AlertIcon size={24} /> : <ShieldIcon size={24} />}
          </span>
          <div className="min-w-0">
            <h2 className="text-xl leading-tight font-extrabold tracking-tight">{v.title}</h2>
            <p className="mt-0.5 text-sm text-white/90">{v.text(best.name)}</p>
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-white/10 p-3 ring-1 ring-white/15">
          <div className="text-xs font-semibold tracking-wider text-white/90 uppercase">
            {plan.all_routes_no_travel ? `Least risky: ${best.name}` : `Take ${best.name}`}
          </div>
          {best.via.length > 0 && <div className="truncate text-sm font-semibold">via {best.via.join(', ')}</div>}
          <div className="mt-2 grid grid-cols-3 gap-2">
            <BigStat label="Distance" value={formatMiles(best.distance_mi)} />
            <BigStat label="Drive" value={formatDuration(best.duration_s)} />
            <BigStat label="Arrive" value={formatTime(best.arrival)} />
          </div>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-sm font-medium">
          <CheckIcon size={16} className="mt-0.5 shrink-0" />
          {friendlyReason(plan)}
        </p>
      </div>

      <HazardList
        route={selected}
        departure={plan.departure}
        isBest={selected.id === best.id}
        onFocus={onFocusHazard}
      />
    </section>
  )
}

function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium tracking-wider text-white/90 uppercase">{label}</div>
      <div className="text-base leading-tight font-bold tabular-nums">{value}</div>
    </div>
  )
}

function HazardList({
  route,
  departure,
  isBest,
  onFocus,
}: {
  route: PlannedRoute
  departure: string
  isBest: boolean
  onFocus: (h: Hazard) => void
}) {
  const list = hazards(route)
  const shown = list.slice(0, MAX_HAZARDS)
  return (
    <div className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-900/5">
      <h3 className="flex items-baseline justify-between gap-2 text-sm font-bold text-slate-900">
        Hazards ahead
        <span className="text-xs font-medium text-slate-700">
          {route.name}
          {isBest ? ' · recommended' : ''}
        </span>
      </h3>
      {list.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          <CheckIcon size={16} /> No weather hazards on this route.
        </p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {shown.map((h) => {
            const Icon = CAUSE_ICON[h.cause]
            const into = (new Date(h.eta).getTime() - new Date(departure).getTime()) / 1000
            return (
              <li key={`${h.routeId}-${h.peakIdx}`}>
                <button
                  type="button"
                  onClick={() => onFocus(h)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-slate-100 p-2.5 text-left transition hover:border-slate-200 hover:bg-slate-50"
                  title="Show on map"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ background: riskColor(h.level) }}
                  >
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold text-slate-900">{h.condition}</span>
                      <span className="text-xs font-bold" style={{ color: riskColor(h.level) }}>
                        {riskLabel(h.level)}
                      </span>
                    </span>
                    <span className="block text-xs text-slate-700">
                      {h.fromMile === h.toMile
                        ? `Mile ${Math.round(h.fromMile)}`
                        : `Miles ${Math.round(h.fromMile)}–${Math.round(h.toMile)}`}
                    </span>
                    <span className="block text-xs text-slate-700">
                      {formatTime(h.eta)} · <span className="whitespace-nowrap">{formatDuration(into)} into trip</span>
                    </span>
                  </span>
                  <span className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-700">
                    ›
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      {list.length > MAX_HAZARDS && (
        <p className="mt-1.5 text-xs text-slate-700">
          +{list.length - MAX_HAZARDS} more — see the colored route on the map.
        </p>
      )}
    </div>
  )
}
