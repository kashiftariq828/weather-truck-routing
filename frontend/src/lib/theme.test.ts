import { describe, expect, it } from 'vitest'
import { errorMessage } from '../api'
import css from '../index.css?raw'
import { RISK_LEVELS, UNKNOWN_COLOR } from './risk'

describe('risk colours', () => {
  // The map paints from lib/risk.ts; Tailwind classes (bg-risk-*, text-risk-*) use index.css.
  it('are the same in index.css and lib/risk.ts', () => {
    const token = (name: string) => css.match(new RegExp(`--color-risk-${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]
    const names = ['low', 'moderate', 'high', 'severe', 'notravel']
    expect(names.map(token)).toEqual(RISK_LEVELS.map((r) => r.color))
    expect(token('unknown')).toBe(UNKNOWN_COLOR)
  })
})

describe('errorMessage', () => {
  it('reads the shapes Django REST Framework returns', () => {
    expect(errorMessage({ detail: 'No truck route connects these places.' })).toBe(
      'No truck route connects these places.',
    )
    expect(errorMessage({ load_lb: ['A valid number is required.'] })).toBe('A valid number is required.')
    expect(errorMessage({ origin: { lat: ['Too big.'] }, non_field_errors: ['Same place.'] })).toBe(
      'Too big. Same place.',
    )
  })
  it('gives up on bodies with nothing to show', () => {
    expect(errorMessage(null)).toBeNull()
    expect(errorMessage('<html>')).toBeNull()
    expect(errorMessage({})).toBeNull()
  })
})
