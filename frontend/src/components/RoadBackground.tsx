import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BRAND, BRAND_TRUCK, type TruckColors } from '../lib/theme'
import { TruckGraphic } from './TruckGraphic'

/**
 * Full-page landing background: a randomly winding two-lane road through snowy
 * mountains, with trucks gliding along it in both directions under rain and snow.
 *
 * All motion is CSS: trucks follow the road with CSS Motion Path (offset-path), so they
 * turn with the curve while the large scenery SVG stays static, and the weather is three
 * tiled layers (see `.weather` in index.css). JavaScript only measures the page and lays
 * out the road once per size. Everything is pale so the page text on top stays readable.
 */

type Pt = [number, number]

interface Size {
  w: number
  h: number
  /** Vertical band the road winds through, so page content never covers it. */
  laneTop: number
  laneHeight: number
}

const LANE = 11 // px from the centre line to each lane's centre
const SPEED = 85 // px per second along the road
const TRUCK_SCALE = 0.35 // the 230 × 92 truck drawing, scaled to ~80 px long

interface TruckSpec {
  colors: TruckColors
  /** Fraction of the trip already done at load, so trucks start spread out. */
  phase: number
  /** Speed multiplier — keeps trucks from travelling in lock-step. */
  pace: number
  oncoming: boolean
}

const TRUCKS: TruckSpec[] = [
  { colors: BRAND_TRUCK, phase: 0.05, pace: 1, oncoming: false },
  { colors: { trailer: '#334155', stripe: '#64748b', cab: BRAND.light }, phase: 0.55, pace: 0.92, oncoming: false },
  { colors: { trailer: '#1e3a5f', stripe: '#3b6ea5', cab: '#475569' }, phase: 0.3, pace: 1.08, oncoming: true },
  { colors: { trailer: '#3f3f46', stripe: '#a1a1aa', cab: '#b45309' }, phase: 0.8, pace: 0.96, oncoming: true },
]

/** Deterministic pseudo-random numbers, so scenery doesn't reshuffle on every render. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// Mountain ranges along the bottom of the page, drawn in a 1440 × 240 box stretched to the page width.
const FAR =
  '0,150 90,96 160,122 250,52 340,112 420,80 520,132 600,62 700,104 790,40 880,108 960,76 1060,122 1150,56 1240,102 1330,68 1440,110 1440,240 0,240'
const NEAR =
  '0,190 120,140 230,172 340,118 470,176 580,132 700,182 820,136 930,176 1050,124 1170,176 1290,140 1440,172 1440,240 0,240'
const FAR_PEAKS: Pt[] = [
  [90, 96],
  [250, 52],
  [600, 62],
  [790, 40],
  [960, 76],
  [1150, 56],
  [1330, 68],
]
const NEAR_PEAKS: Pt[] = [
  [120, 140],
  [340, 118],
  [580, 132],
  [820, 136],
  [1050, 124],
  [1290, 140],
]

/** Snow cap hugging a peak, with a jagged lower edge so it reads as snow. */
function cap([x, y]: Pt, s: number): string {
  return [
    [x - s, y + s * 0.9],
    [x - s * 0.55, y + s * 0.6],
    [x - s * 0.3, y + s * 0.85],
    [x, y],
    [x + s * 0.35, y + s * 0.7],
    [x + s * 0.6, y + s * 0.5],
    [x + s, y + s * 0.95],
  ]
    .map((p) => p.join(','))
    .join(' ')
}

/** Random gentle route across the page; x in 0–1 of the width, y in 0–1 of the lane. Picked once per page load. */
function randomRoute(): Pt[] {
  const n = 6
  const pts: Pt[] = []
  let y = 0.25 + Math.random() * 0.5
  for (let i = 0; i < n; i++) {
    const x = -0.1 + (1.2 * i) / (n - 1) + (i > 0 && i < n - 1 ? (Math.random() - 0.5) * 0.08 : 0)
    pts.push([x, y])
    // Next bend: a smooth swing up or down, kept inside the lane.
    y = Math.min(0.8, Math.max(0.2, y + (Math.random() - 0.5) * 0.6))
  }
  return pts
}

/** Catmull-Rom through the points, as cubic Béziers — a smooth road with no kinks. */
function smoothPath(pts: Pt[]): string {
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

interface Tree {
  x: number
  y: number
  h: number
}
interface Sign {
  x: number
  y: number
  glyph: string
}
interface Roadside {
  length: number
  trees: Tree[]
  signs: Sign[]
}

/** Pines and warning signs placed just off both shoulders, following the road's curve. */
function roadside(path: SVGPathElement, size: Size): Roadside {
  const length = path.getTotalLength()
  const r = seeded(11)
  const at = (s: number) => {
    const p = path.getPointAtLength(s)
    const q = path.getPointAtLength(Math.min(length, s + 1))
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1
    // Unit normal to the road at this point.
    return { x: p.x, y: p.y, nx: -(q.y - p.y) / len, ny: (q.x - p.x) / len }
  }
  const inside = (x: number, y: number) => x > -20 && x < size.w + 20 && y > 0 && y < size.h
  const trees: Tree[] = []
  for (let s = 20; s < length; s += 46 + r() * 30) {
    const p = at(s)
    const side = r() < 0.5 ? -1 : 1
    const off = LANE * 2 + 22 + r() * 34
    const x = p.x + p.nx * off * side
    const y = p.y + p.ny * off * side
    if (inside(x, y)) trees.push({ x, y, h: 20 + r() * 16 })
  }
  const signs: Sign[] = [
    [0.22, '❄'],
    [0.68, '⚠'],
  ].map(([f, glyph]) => {
    const p = at(length * (f as number))
    const off = LANE * 2 + 16
    return { x: p.x + p.nx * off, y: p.y + p.ny * off, glyph: glyph as string }
  })
  return { length, trees, signs }
}

export function RoadBackground() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const [size, setSize] = useState<Size | null>(null)
  const [side, setSide] = useState<Roadside | null>(null)
  const route = useMemo(randomRoute, [])
  const id = useId().replace(/:/g, '')

  // Follow the landing container's real size so the road spans the whole page.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => {
      // The page marks the open band reserved for the road with [data-road-lane]; without one, use the whole page.
      const lane = el.parentElement?.querySelector<HTMLElement>('[data-road-lane]')
      const next = {
        w: el.clientWidth,
        h: el.clientHeight,
        laneTop: lane?.offsetTop ?? 0,
        laneHeight: lane?.offsetHeight ?? el.clientHeight,
      }
      // Keep the same object when nothing changed, so React skips the re-render and road layout.
      setSize((prev) => (prev && (Object.keys(next) as (keyof Size)[]).every((k) => prev[k] === next[k]) ? prev : next))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const d = useMemo(
    () => (size ? smoothPath(route.map(([x, y]) => [x * size.w, size.laneTop + y * size.laneHeight])) : ''),
    [route, size],
  )

  useEffect(() => {
    if (pathRef.current && d && size) setSide(roadside(pathRef.current, size))
  }, [d, size])

  const pathId = `road-${id}`
  const beamId = `beam-${id}`
  const length = side?.length ?? 0

  return (
    <div ref={wrapRef} aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {size && (
        <svg width={size.w} height={size.h} className="block">
          <defs>
            <path id={pathId} ref={pathRef} d={d} />
            <linearGradient id={beamId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fde68a" stopOpacity="0.9" />
              <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Snowy mountain ranges along the bottom of the page */}
          <svg x="0" y={size.h - 240} width={size.w} height="240" viewBox="0 0 1440 240" preserveAspectRatio="none">
            <polygon points={FAR} fill="#e2e8f0" />
            {FAR_PEAKS.map((p) => (
              <polygon key={`f${p[0]}`} points={cap(p, 26)} fill="#ffffff" />
            ))}
            <polygon points={NEAR} fill="#cbd5e1" />
            {NEAR_PEAKS.map((p) => (
              <polygon key={`n${p[0]}`} points={cap(p, 20)} fill="#f8fafc" />
            ))}
          </svg>

          {/* Road: snowy shoulder, pale asphalt with a wet sheen, dashed centre line */}
          <use
            href={`#${pathId}`}
            fill="none"
            stroke="#000000"
            strokeOpacity="0.05"
            strokeWidth={LANE * 4 + 20}
            strokeLinecap="round"
          />
          <use href={`#${pathId}`} fill="none" stroke="#f8fafc" strokeWidth={LANE * 4 + 14} strokeLinecap="round" />
          <use
            href={`#${pathId}`}
            fill="none"
            stroke="#d6dbe1"
            strokeOpacity="0.95"
            strokeWidth={LANE * 4}
            strokeLinecap="round"
          />
          <use
            href={`#${pathId}`}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.35"
            strokeWidth={LANE * 4 - 12}
            strokeDasharray="110 150"
            strokeLinecap="round"
          />
          <use
            href={`#${pathId}`}
            fill="none"
            stroke="#f59e0b"
            strokeOpacity="0.65"
            strokeWidth="2"
            strokeDasharray="18 16"
          />

          {/* Snow-tipped pines and warning signs beside the road */}
          {side?.trees.map((t, i) => (
            <g key={i} transform={`translate(${t.x.toFixed(1)} ${(t.y - t.h).toFixed(1)})`} opacity="0.8">
              <rect x="-1.5" y={t.h - 3} width="3" height="5" fill="#6b4f3a" />
              <polygon points={`0,0 ${t.h * 0.34},${t.h} ${-t.h * 0.34},${t.h}`} fill="#4d7a62" />
              <polygon
                points={`0,0 ${t.h * 0.15},${t.h * 0.44} 0,${t.h * 0.34} ${-t.h * 0.15},${t.h * 0.44}`}
                fill="#ffffff"
              />
              <polygon
                points={`${-t.h * 0.3},${t.h} ${t.h * 0.3},${t.h} ${t.h * 0.18},${t.h * 0.86} ${-t.h * 0.2},${t.h * 0.88}`}
                fill="#ffffff"
                opacity="0.9"
              />
            </g>
          ))}
          {side?.signs.map((s) => (
            <g key={s.glyph} transform={`translate(${s.x.toFixed(1)} ${(s.y - 30).toFixed(1)})`}>
              <rect x="-1.5" y="8" width="3" height="24" fill="#6b7280" />
              <rect
                x="-10"
                y="-10"
                width="20"
                height="20"
                rx="2"
                transform="rotate(45)"
                fill="#facc15"
                stroke="#1f2937"
                strokeWidth="2"
              />
              <text y="5" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1f2937">
                {s.glyph}
              </text>
            </g>
          ))}
        </svg>
      )}

      {length > 0 &&
        TRUCKS.map((t, i) => <RoadTruck key={i} spec={t} road={d} length={length} beam={`url(#${beamId})`} />)}

      <div className="weather weather-snow-far" />
      <div className="weather weather-snow-near" />
      <div className="weather weather-rain" />
    </div>
  )
}

/**
 * One truck driving along the road. The box is centred on the road's centre line and the
 * drawing sits in the right-hand lane of its direction of travel (local +y). Oncoming
 * trucks run the path backwards, turned 180°, so their drawing is mirrored to stay upright.
 */
function RoadTruck({ spec, road, length, beam }: { spec: TruckSpec; road: string; length: number; beam: string }) {
  const laneOffset = LANE / TRUCK_SCALE // in drawing units
  const boxHeight = 2 * (46 + laneOffset)
  const top = boxHeight / 2 + laneOffset - 46
  const duration = length / (SPEED * spec.pace)
  const start = spec.oncoming ? 1 - spec.phase : spec.phase
  const style = {
    offsetPath: `path("${road}")`,
    offsetRotate: spec.oncoming ? 'auto 180deg' : 'auto',
    animationDirection: spec.oncoming ? 'reverse' : 'normal',
    '--drive-time': `${duration.toFixed(2)}s`,
    '--drive-delay': `-${(duration * spec.phase).toFixed(2)}s`,
    '--park': `${(start * 100).toFixed(1)}%`,
  } as CSSProperties
  return (
    <svg
      className="road-truck"
      width={230 * TRUCK_SCALE}
      height={boxHeight * TRUCK_SCALE}
      viewBox={`0 0 230 ${boxHeight}`}
      overflow="visible"
      style={style}
    >
      <g transform={spec.oncoming ? `translate(0 ${top + 92}) scale(1 -1)` : `translate(0 ${top})`}>
        <TruckGraphic colors={spec.colors} beam={beam} snowyRoof />
      </g>
    </svg>
  )
}
