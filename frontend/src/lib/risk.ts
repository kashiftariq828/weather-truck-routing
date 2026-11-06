import type { RiskLevel } from '../api'

export const RISK_LEVELS: { level: RiskLevel; label: string; color: string }[] = [
  { level: 0, label: 'Low', color: '#2e9e5b' },
  { level: 1, label: 'Moderate', color: '#e3b505' },
  { level: 2, label: 'High', color: '#f07c1e' },
  { level: 3, label: 'Severe', color: '#d6312f' },
  { level: 4, label: 'No Travel', color: '#6d1f80' },
]

export const UNKNOWN_COLOR = '#9aa3ad'

export function riskLabel(level: RiskLevel | null): string {
  return level === null ? 'No forecast' : RISK_LEVELS[level].label
}

export function riskColor(level: RiskLevel | null): string {
  return level === null ? UNKNOWN_COLOR : RISK_LEVELS[level].color
}

/** MapLibre expression mapping a numeric `level` property (-1 = unknown) to its color. */
export const LEVEL_COLOR_EXPRESSION = [
  'match',
  ['get', 'level'],
  ...RISK_LEVELS.flatMap((r) => [r.level, r.color]),
  UNKNOWN_COLOR,
]
