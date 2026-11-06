import { useId, type CSSProperties } from 'react'
import { riskColor } from '../lib/risk'
import { BRAND } from '../lib/theme'
import { CloudRainIcon, ShieldIcon, WindIcon } from './Icons'

const [LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL] = ([0, 1, 2, 3, 4] as const).map(riskColor)

/** Stylised route map: three routes draw in, checkpoints pulse, and the result chips float. */
export function HeroIllustration() {
  const id = useId()
  const grid = `grid-${id}`
  const land = `land-${id}`
  const dots = [
    [70, 250, LOW],
    [150, 205, LOW],
    [235, 175, LOW],
    [320, 150, LOW],
    [400, 105, LOW],
    [140, 300, MODERATE],
    [230, 315, HIGH],
    [320, 290, SEVERE],
  ] as const
  return (
    <div className="card-in relative mx-auto w-full max-w-[540px]" style={{ '--i': 2 } as CSSProperties} aria-hidden>
      <div className="rounded-3xl bg-white p-3 shadow-2xl ring-1 ring-slate-200">
        <svg viewBox="0 0 480 360" className="w-full rounded-2xl">
          <defs>
            <pattern id={grid} width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M24 0H0v24" fill="none" stroke="#000000" strokeOpacity="0.05" />
            </pattern>
            <linearGradient id={land} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fbfbfb" />
              <stop offset="1" stopColor="#f1f1f1" />
            </linearGradient>
          </defs>
          <rect width="480" height="360" fill={`url(#${land})`} />
          <rect width="480" height="360" fill={`url(#${grid})`} />
          {/* Weather cell over the southern routes */}
          <circle className="storm" cx="270" cy="305" r="70" fill={SEVERE} opacity="0.18" />
          <circle className="storm" cx="270" cy="305" r="40" fill={NO_TRAVEL} opacity="0.22" />

          {/* Routes: two risky alternatives and the recommended one on top */}
          <path
            className="draw"
            style={{ '--d': '0.2s' } as CSSProperties}
            d="M60 260 C 120 330, 260 340, 330 290 S 420 140, 420 100"
            fill="none"
            stroke={HIGH}
            strokeOpacity="0.75"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            className="draw"
            style={{ '--d': '0.45s' } as CSSProperties}
            d="M60 260 C 90 200, 140 300, 230 240 S 380 160, 420 100"
            fill="none"
            stroke={MODERATE}
            strokeOpacity="0.6"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            className="draw"
            style={{ '--d': '0.7s' } as CSSProperties}
            d="M60 260 C 140 200, 230 180, 300 155 S 400 110, 420 100"
            fill="none"
            stroke="#ffffff"
            strokeWidth="11"
            strokeLinecap="round"
            strokeOpacity="0.9"
          />
          <path
            className="draw"
            style={{ '--d': '0.7s' } as CSSProperties}
            d="M60 260 C 140 200, 230 180, 300 155 S 400 110, 420 100"
            fill="none"
            stroke={LOW}
            strokeWidth="6"
            strokeLinecap="round"
          />

          {dots.map(([x, y, c], i) => (
            <circle
              key={i}
              className="dot"
              style={{ '--d': `${1.2 + i * 0.08}s` } as CSSProperties}
              cx={x}
              cy={y}
              r="5.5"
              fill={c}
              stroke="#fff"
              strokeWidth="2"
            />
          ))}

          {/* Origin and destination */}
          <circle cx="60" cy="260" r="9" stroke="#fff" strokeWidth="3" style={{ fill: BRAND.light }} />
          <path
            d="M420 104s14-13.5 14-24.5a14 14 0 0 0-28 0C406 90.5 420 104 420 104z"
            stroke="#fff"
            strokeWidth="2.5"
            style={{ fill: BRAND.base }}
          />
          <circle cx="420" cy="79" r="5" style={{ fill: BRAND.accent }} />
        </svg>
      </div>

      <div className="float absolute -top-4 -left-3 flex items-center gap-2.5 rounded-2xl bg-emerald-600 px-4 py-2.5 shadow-xl ring-1 ring-white/20 sm:-left-8">
        <ShieldIcon size={20} />
        <div>
          <div className="text-sm leading-tight font-extrabold">Good to go</div>
          <div className="text-xs font-medium text-white">Route B · 0 severe miles</div>
        </div>
      </div>
      <div
        className="float absolute -right-2 bottom-10 rounded-2xl bg-white px-4 py-2.5 text-slate-950 shadow-xl ring-1 ring-slate-200 sm:-right-6"
        style={{ animationDelay: '1.2s' }}
      >
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-risk-severe text-white">
            <CloudRainIcon size={15} />
          </span>
          Rain 0.89 in/hr <span className="text-xs text-risk-severe">Severe</span>
        </div>
        <div className="mt-0.5 text-xs font-medium text-slate-700">Avoided by Route B · mile 182</div>
      </div>
      <div
        className="float absolute -bottom-5 left-6 hidden items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-lg ring-1 ring-slate-200 sm:flex"
        style={{ animationDelay: '0.6s' }}
      >
        <WindIcon size={14} className="text-accent" /> 47 mph + 38,000 lb → No Travel
      </div>
    </div>
  )
}
