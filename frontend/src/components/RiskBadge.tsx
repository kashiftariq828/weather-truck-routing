import type { RiskLevel } from '../api'
import { riskColor, riskLabel } from '../lib/risk'

export function RiskBadge({ level }: { level: RiskLevel | null }) {
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white"
      style={{ background: riskColor(level) }}
    >
      {riskLabel(level)}
    </span>
  )
}
