import { BRAND_TRUCK, type TruckColors } from '../lib/theme'

const WHEEL_X = [34, 58, 150, 196]

interface Props {
  colors?: TruckColors
  /** Text on the trailer side. */
  label?: string
  /** Snow piled on the trailer roof. */
  snowyRoof?: boolean
  /** Fill for a headlight beam ahead of the cab (e.g. a gradient url); no beam when omitted. */
  beam?: string
  /** Class for the body (not the wheels), e.g. a bounce animation. */
  bodyClassName?: string
}

/**
 * Tractor-trailer side view facing right, drawn in a 230 × 92 box with the wheels'
 * bottom at y = 85. Place it with a transform; the wheels spin via `.wheel-spin`.
 */
export function TruckGraphic({ colors = BRAND_TRUCK, label, snowyRoof = false, beam, bodyClassName }: Props) {
  return (
    <g>
      {beam && <polygon points="212,53 320,38 320,74 212,57" style={{ fill: beam }} />}
      <g className={bodyClassName}>
        <rect x="4" y="8" width="138" height="58" rx="4" style={{ fill: colors.trailer }} />
        <rect x="4" y="8" width="138" height="8" rx="4" style={{ fill: colors.stripe }} />
        {snowyRoof && <path d="M6 9 Q 20 2 34 7 T 62 6 T 90 7 T 118 5 T 140 9 Z" fill="#ffffff" />}
        {label && (
          <text x="73" y="46" textAnchor="middle" fontSize="15" fontWeight="800" fill="#ffffff" letterSpacing="1">
            {label}
          </text>
        )}
        <rect x="142" y="58" width="10" height="6" fill="#1b1b1b" />
        <path d="M152 26h38l22 24v20h-60z" style={{ fill: colors.cab }} />
        <path d="M160 32h26l15 17h-41z" fill="#e0f2fe" />
        <rect x="152" y="60" width="62" height="10" rx="2" fill="#1f1f1f" />
        <rect x="206" y="52" width="8" height="5" rx="1.5" fill="#fef08a" />
        <rect x="148" y="14" width="4" height="22" rx="1.5" fill="#6b6b6b" />
      </g>
      {WHEEL_X.map((cx) => (
        <g key={cx} transform={`translate(${cx} 74)`}>
          <circle r="11" fill="#111111" />
          <g className="wheel-spin">
            <circle r="5" fill="#9aa3ad" />
            <rect x="-1" y="-9" width="2" height="18" fill="#4b5563" />
            <rect x="-9" y="-1" width="18" height="2" fill="#4b5563" />
          </g>
        </g>
      ))}
    </g>
  )
}
