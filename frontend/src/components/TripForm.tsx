import { useState } from 'react'
import type { Place, PlanRequest } from '../api'
import { defaultDeparture } from '../lib/format'
import { OriginIcon, PinIcon, SwapIcon, TruckIcon, WeightIcon } from './Icons'
import { PlaceInput } from './PlaceInput'
import type { Trip } from './TripBar'

const INTERVALS = [10, 25, 50] as const
const MAX_LOAD_LB = 200_000

interface Props {
  onSubmit: (trip: Trip) => void
  loading: boolean
}

export function TripForm({ onSubmit, loading }: Props) {
  const [origin, setOrigin] = useState<Place | null>(null)
  const [destination, setDestination] = useState<Place | null>(null)
  const [departure, setDeparture] = useState(defaultDeparture)
  const [load, setLoad] = useState('35000')
  const [interval, setIntervalMi] = useState<PlanRequest['interval_mi']>(25)

  const loadLb = Number(load)
  // Number('') is 0, so an emptied field would otherwise submit an empty truck.
  const loadValid = load.trim() !== '' && Number.isFinite(loadLb) && loadLb >= 0 && loadLb <= MAX_LOAD_LB
  const departureValid = departure !== '' && !Number.isNaN(new Date(departure).getTime())
  const valid = origin && destination && departureValid && loadValid

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    onSubmit({
      req: {
        origin: { lon: origin.lon, lat: origin.lat },
        destination: { lon: destination.lon, lat: destination.lat },
        departure: new Date(departure).toISOString(),
        load_lb: loadLb,
        interval_mi: interval,
      },
      labels: { origin: origin.label, destination: destination.label },
    })
  }

  const swap = () => {
    setOrigin(destination)
    setDestination(origin)
  }

  return (
    <form onSubmit={submit}>
      <div className="relative space-y-3">
        <PlaceInput
          label="Origin"
          value={origin}
          onChange={setOrigin}
          placeholder="City or address"
          icon={<OriginIcon size={15} className="text-brand-light" />}
        />
        <PlaceInput
          label="Destination"
          value={destination}
          onChange={setDestination}
          placeholder="City or address"
          icon={<PinIcon size={15} className="text-risk-severe" />}
        />
        {origin && destination && (
          <button
            type="button"
            onClick={swap}
            aria-label="Swap origin and destination"
            title="Swap origin and destination"
            className="fade-in absolute top-[52px] right-9 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:rotate-180 hover:border-brand-light hover:text-brand"
          >
            <SwapIcon size={14} />
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[3fr_2fr]">
        <div className="relative">
          <label
            htmlFor="departure"
            className="mb-1 block text-xs font-semibold tracking-wider text-slate-700 uppercase"
          >
            Departure
          </label>
          <input
            id="departure"
            type="datetime-local"
            value={departure}
            onChange={(e) => setDeparture(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm shadow-sm transition outline-none focus:border-brand-light focus:ring-3 focus:ring-brand-light/20"
          />
        </div>
        <div className="relative">
          <label htmlFor="load" className="mb-1 block text-xs font-semibold tracking-wider text-slate-700 uppercase">
            Load weight
          </label>
          <WeightIcon size={15} className="pointer-events-none absolute top-[30px] left-3 text-slate-600" />
          <input
            id="load"
            type="number"
            min={0}
            max={MAX_LOAD_LB}
            aria-invalid={!loadValid}
            step={500}
            value={load}
            onChange={(e) => setLoad(e.target.value)}
            className={`w-full rounded-lg border bg-white py-2 pr-9 pl-9 text-sm shadow-sm transition outline-none focus:ring-3 ${
              loadValid
                ? 'border-slate-300 focus:border-brand-light focus:ring-brand-light/20'
                : 'border-red-400 focus:ring-red-200'
            }`}
          />
          <span className="pointer-events-none absolute top-[29px] right-3 text-xs font-medium text-slate-600">lb</span>
          {!loadValid && <p className="mt-1 text-xs text-red-600">Enter 0–{MAX_LOAD_LB.toLocaleString()} lb</p>}
        </div>
      </div>

      <fieldset className="mt-3">
        <legend className="mb-1 block text-xs font-semibold tracking-wider text-slate-700 uppercase">
          Weather checkpoint every
        </legend>
        <div className="relative grid grid-cols-3 rounded-lg bg-slate-100 p-1">
          {/* Sliding highlight behind the active option */}
          <span
            aria-hidden
            className="absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-md bg-white shadow-sm ring-1 ring-slate-900/5 transition-transform duration-300 ease-out"
            style={{ transform: `translateX(${INTERVALS.indexOf(interval) * 100}%)` }}
          />
          {INTERVALS.map((mi) => (
            <button
              key={mi}
              type="button"
              onClick={() => setIntervalMi(mi)}
              aria-pressed={interval === mi}
              className={`relative rounded-md py-1.5 text-sm font-medium transition-colors ${
                interval === mi ? 'text-brand' : 'text-slate-700 hover:text-slate-800'
              }`}
            >
              {mi} mi
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={!valid || loading}
        className="group mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white shadow-md shadow-brand/20 transition hover:bg-brand-light hover:shadow-lg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        {loading ? (
          <span className="spinner h-4 w-4 rounded-full border-2 border-white/40 border-t-white" aria-hidden />
        ) : (
          <TruckIcon size={17} className="transition-transform group-hover:translate-x-0.5" />
        )}
        {loading ? 'Planning routes…' : 'Plan safest route'}
      </button>
    </form>
  )
}
