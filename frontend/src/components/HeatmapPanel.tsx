import type { Heatmap } from '../api'
import { ForecastSlider } from './ForecastSlider'
import { AlertIcon } from './Icons'

interface Props {
  heatmap: Heatmap | undefined
  error: Error | null
  onHourChange: (hour: number) => void
}

/** The forecast slider once the heatmap has loaded; until then, its loading or error state. */
export function HeatmapPanel({ heatmap, error, onHourChange }: Props) {
  if (heatmap) return <ForecastSlider start={heatmap.start} hours={heatmap.hours} onHourChange={onHourChange} />
  return (
    <div className="fade-in flex items-center justify-center gap-2 rounded-2xl bg-white/95 p-3 text-xs font-medium text-slate-600 shadow-xl ring-1 ring-slate-900/5">
      {error ? (
        <>
          <AlertIcon size={14} className="text-red-500" />
          Heatmap unavailable: {error.message}
        </>
      ) : (
        <>
          <span className="spinner h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-brand-light" />
          Loading 48-hour forecast heatmap…
        </>
      )}
    </div>
  )
}
