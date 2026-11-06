import { useState } from 'react'
import { RISK_LEVELS, UNKNOWN_COLOR } from '../lib/risk'

export function Legend() {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-xl bg-white/95 text-xs shadow-lg ring-1 ring-slate-900/5 backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 font-semibold text-slate-700"
      >
        Weather risk
        <span className={`text-slate-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="fade-in px-3 pb-2.5">
          <ul className="space-y-1">
            {RISK_LEVELS.map((r) => (
              <li key={r.level} className="flex items-center gap-2 text-slate-700">
                <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: r.color }} />
                {r.label}
              </li>
            ))}
            <li className="flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: UNKNOWN_COLOR }} />
              No forecast
            </li>
          </ul>
          <div className="mt-2 border-t border-slate-100 pt-2">
            <div className="mb-1 font-medium text-slate-600">Heatmap</div>
            <div
              className="h-1.5 w-32 rounded-full"
              style={{
                background: 'linear-gradient(to right, rgba(227,181,5,0.25), #e3b505, #f07c1e, #d6312f, #6d1f80)',
              }}
            />
            <div className="mt-0.5 flex w-32 justify-between text-xs text-slate-600">
              <span>Moderate</span>
              <span>No Travel</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
