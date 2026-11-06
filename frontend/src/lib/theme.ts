/**
 * Brand colours for inline SVG, as references to the CSS
 * variables in index.css (@theme), so the palette is defined in one place.
 * Apply them through `style` (e.g. `style={{ fill: BRAND.base }}`): SVG presentation
 * attributes don't resolve var().
 */
export const BRAND = {
  base: 'var(--color-brand)',
  light: 'var(--color-brand-light)',
  accent: 'var(--color-accent)',
}

/** Paint for the three coloured parts of a truck; any CSS colour. */
export interface TruckColors {
  trailer: string
  stripe: string
  cab: string
}

/** The app's own truck. */
export const BRAND_TRUCK: TruckColors = { trailer: BRAND.base, stripe: BRAND.light, cab: BRAND.accent }
