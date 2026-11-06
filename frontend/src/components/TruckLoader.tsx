import { useEffect, useId, useState } from 'react'
import { TruckGraphic } from './TruckGraphic'

/** What the backend works through while a plan is computed; shown one after another. */
const STEPS = [
  'Finding truck routes',
  'Placing weather checkpoints',
  'Fetching forecasts at each ETA',
  'Scoring risk & ranking routes',
]
const STEP_MS = 1600
// A normal plan takes a few seconds; beyond this the server is waiting out the weather service's per-minute limit.
const SLOW_MS = 10_000

/** Map overlay shown while a plan is being fetched: an animated truck driving through weather. */
export function TruckLoader() {
  const [step, setStep] = useState(0)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const t = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), STEP_MS)
    const s = window.setTimeout(() => setSlow(true), SLOW_MS)
    return () => {
      window.clearInterval(t)
      window.clearTimeout(s)
    }
  }, [])

  return (
    <div className="loader-backdrop absolute inset-0 z-10 flex items-center justify-center bg-slate-900/25 backdrop-blur-[2px]">
      <div
        role="status"
        aria-live="polite"
        className="loader-card w-[300px] rounded-2xl bg-white/95 p-5 shadow-2xl ring-1 ring-slate-900/5"
      >
        <TruckScene />
        <p className="mt-4 text-center text-sm font-semibold text-slate-900">Planning your trip</p>
        <p key={slow ? 'slow' : step} className="step-text mt-0.5 text-center text-xs text-slate-700">
          {slow ? 'Weather service is busy — waiting for capacity (up to a minute)…' : `${STEPS[step]}…`}
        </p>
        <ol className="mt-3 flex justify-center gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i < step ? 'w-4 bg-brand-light' : i === step ? 'w-8 bg-brand' : 'w-4 bg-slate-200'
              }`}
            />
          ))}
        </ol>
      </div>
    </div>
  )
}

function TruckScene() {
  const id = useId()
  const clip = `scene-${id}`
  const sky = `sky-${id}`
  return (
    <svg viewBox="0 0 260 120" className="w-full" aria-hidden>
      <defs>
        <clipPath id={clip}>
          <rect width="260" height="120" rx="14" />
        </clipPath>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdecec" />
          <stop offset="1" stopColor="#fffafa" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="260" height="120" fill={`url(#${sky})`} />

        {/* Weather drifting past: clouds with rain */}
        <g className="drift-slow">
          <Cloud x={30} y={20} />
          <Cloud x={290} y={14} />
        </g>
        <g className="drift-fast">
          <Cloud x={170} y={30} small />
          <Cloud x={430} y={26} small />
        </g>

        {/* Road with lane markings scrolling under the truck */}
        <rect y="92" width="260" height="28" fill="#2b3640" />
        <rect y="92" width="260" height="2" fill="#56636e" />
        <g className="road-dashes">
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x={i * 40} y="105" width="20" height="2.5" rx="1.2" fill="#f2c94c" />
          ))}
        </g>

        {/* Speed lines */}
        <g className="speed-lines" stroke="#c9a5a5" strokeWidth="2" strokeLinecap="round">
          <line x1="40" y1="62" x2="62" y2="62" />
          <line x1="30" y1="72" x2="56" y2="72" />
          <line x1="44" y1="82" x2="60" y2="82" />
        </g>

        {/* Truck, gently bouncing on the road */}
        <g transform="translate(66 42) scale(0.65)">
          <TruckGraphic label="SAFE ROUTE" bodyClassName="truck-bounce" />
        </g>
      </g>
    </svg>
  )
}

function Cloud({ x, y, small = false }: { x: number; y: number; small?: boolean }) {
  const s = small ? 0.7 : 1
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M8 22a10 10 0 0 1 2-19.8A13 13 0 0 1 35 6a9 9 0 0 1 1 16z" fill="#ffffff" stroke="#cbd5e1" />
      <g className="rain" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="28" x2="10" y2="34" />
        <line x1="22" y1="28" x2="20" y2="34" />
        <line x1="32" y1="28" x2="30" y2="34" />
      </g>
    </g>
  )
}
