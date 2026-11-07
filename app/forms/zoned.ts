// Wall-clock times in a named time zone, for datetime-local inputs: a form's
// opening and closing times are chosen in the form's zone, whatever zone the
// browser happens to be in.

function parts(ts: number, timeZone: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ts))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return out
}

/** How far ahead of UTC the zone's clock is at that instant, in ms. */
function offset(ts: number, timeZone: string): number {
  const p = parts(ts, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000
}

const pad = (n: number) => String(n).padStart(2, '0')

/** An instant → "YYYY-MM-DDTHH:mm" as the zone's clock shows it. */
export function isoToZonedInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return ''
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return ''
  try { const p = parts(ts, timeZone); return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour === 24 ? 0 : p.hour)}:${pad(p.minute)}` } catch { return '' }
}

/** "YYYY-MM-DDTHH:mm" on the zone's clock → the instant, as ISO. */
export function zonedInputToIso(value: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  try {
    let ts = wall - offset(wall, timeZone)
    ts = wall - offset(ts, timeZone) // settle across a DST change
    return new Date(ts).toISOString()
  } catch { return null }
}

/** "Oct 1, 2026, 9:00 AM EDT" in the zone. */
export function formatInZone(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return ''
  try { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(iso)) + ` (${timeZone.replace(/_/g, ' ')})` } catch { return new Date(iso).toUTCString() }
}
