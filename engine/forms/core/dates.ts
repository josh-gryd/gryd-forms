// ISO calendar helpers. Dates are stored as YYYY-MM-DD, date-times as
// YYYY-MM-DDTHH:mm (no zone — a respondent's local wall time is the answer),
// times as HH:mm. String comparison orders all three correctly.

export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1) return false
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return d <= days
}

export function isIsoDateTime(v: string): boolean {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(v)
  return !!m && isIsoDate(m[1]) && isTime(`${m[2]}:${m[3]}`)
}

export function isTime(v: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(v)
  if (!m) return false
  const h = Number(m[1]), min = Number(m[2])
  return h >= 0 && h <= 23 && min >= 0 && min <= 59
}

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatIsoDate(v: string): string {
  if (!isIsoDate(v)) return v
  const [y, m, d] = v.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export function formatIsoDateTime(v: string): string {
  if (!isIsoDateTime(v)) return v
  const [date, time] = v.split('T')
  return `${formatIsoDate(date)} ${time}`
}
