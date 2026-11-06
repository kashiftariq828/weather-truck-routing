import { useEffect, useState, type CSSProperties } from 'react'
import { formatDateTime } from '../lib/format'
import { CloudRainIcon, PauseIcon, PlayIcon } from './Icons'

interface Props {
  start: string
  hours: number
  /** Called on every change. Kept outside React state so the map doesn't re-render. */
  onHourChange: (hour: number) => void
}

const PLAY_STEP_MS = 350
const TICKS = [0, 12, 24, 36, 48]

export function ForecastSlider({ start, hours, onHourChange }: Props) {
  const [hour, setHour] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => onHourChange(hour), [hour, onHourChange])

  useEffect(() => {
    if (!playing) return
    const t = window.setInterval(() => {
      setHour((h) => {
        if (h >= hours) {
          setPlaying(false)
          return h
        }
        return h + 1
      })
    }, PLAY_STEP_MS)
    return () => window.clearInterval(t)
  }, [playing, hours])

  const at = new Date(new Date(start).getTime() + hour * 3600_000)

  return (
    <div className="card-in rounded-2xl bg-white/95 p-3.5 shadow-xl ring-1 ring-slate-900/5 backdrop-blur">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (!playing && hour >= hours) setHour(0)
            setPlaying((p) => !p)
          }}
          aria-label={playing ? 'Pause forecast animation' : 'Play forecast animation'}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-md shadow-brand/30 transition hover:scale-105 hover:bg-brand-light active:scale-95"
        >
          {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} className="translate-x-px" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-800">
              <CloudRainIcon size={14} className="shrink-0 text-brand-light" />
              <span className="truncate tabular-nums">{formatDateTime(at)}</span>
            </span>
            <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand tabular-nums">
              +{hour}h
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={hours}
            step={1}
            value={hour}
            onChange={(e) => {
              setPlaying(false)
              setHour(Number(e.target.value))
            }}
            aria-label="Forecast hour"
            aria-valuetext={`${hour} hours from departure`}
            style={{ '--fill': `${(hour / hours) * 100}%` } as CSSProperties}
            className="range mt-2 w-full"
          />
          <div className="mt-1 flex justify-between text-xs font-medium text-slate-600 tabular-nums">
            {TICKS.map((t) => (
              <span key={t}>{t === 0 ? 'Departure' : `${t}h`}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
