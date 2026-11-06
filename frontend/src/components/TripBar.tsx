import type { PlanRequest } from '../api'
import { formatDateTime } from '../lib/format'

/** A submitted trip: what the API was asked for, plus place names to show it back. */
export interface Trip {
  req: PlanRequest
  labels: { origin: string; destination: string }
}

/** The trip being planned, shown in the planner header with a way to change it. */
export function TripBar({ trip, onEdit }: { trip: Trip; onEdit: () => void }) {
  const short = (label: string) => label.split(',')[0]
  return (
    <div className="mt-4 rounded-2xl bg-red-50 p-3 ring-1 ring-red-200">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-base leading-tight font-bold">
            <span className="truncate" title={trip.labels.origin}>
              {short(trip.labels.origin)}
            </span>
            <span className="text-accent">→</span>
            <span className="truncate" title={trip.labels.destination}>
              {short(trip.labels.destination)}
            </span>
          </div>
          <div className="mt-1 text-sm font-medium text-slate-800">
            {formatDateTime(trip.req.departure)} · {trip.req.load_lb.toLocaleString()} lb · every {trip.req.interval_mi}{' '}
            mi
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-lg bg-accent px-3.5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-light"
        >
          Edit trip
        </button>
      </div>
    </div>
  )
}
