const timeFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

/** "Thu 3:20 PM MST" in the viewer's time zone. */
export function formatTime(iso: string | Date): string {
  return timeFmt.format(new Date(iso))
}

export function formatDateTime(iso: string | Date): string {
  return dateTimeFmt.format(new Date(iso))
}

/** 9450 -> "2h 38m" */
export function formatDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`
}

export function formatMiles(mi: number): string {
  return `${mi.toLocaleString(undefined, { maximumFractionDigits: mi < 10 ? 1 : 0 })} mi`
}

/**
 * A weather value at the data's own precision, trimmed: (44.6, 1) -> "44.6", (47, 1) -> "47",
 * (0.1, 3, 2) -> "0.10". Rounding to fewer digits could push a value across a risk threshold
 * (44.6 mph shown as "45" next to a High badge).
 */
export function formatAmount(value: number, maxDecimals: number, minDecimals = 0): string {
  const [whole, frac = ''] = value.toFixed(maxDecimals).split('.')
  const digits = frac.replace(/0+$/, '').padEnd(minDecimals, '0')
  return digits ? `${whole}.${digits}` : whole
}

/** Local date-time in the format <input type="datetime-local"> expects. */
function toDateTimeInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** `hours` from now, on the hour. */
function hoursAhead(now: Date, hours: number): Date {
  const d = new Date(now)
  d.setHours(d.getHours() + hours, 0, 0, 0)
  return d
}

/** One hour from now, on the hour. */
export function defaultDeparture(now = new Date()): string {
  return toDateTimeInput(hoursAhead(now, 1))
}
