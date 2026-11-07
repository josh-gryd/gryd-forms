// Time zones for the pickers: every IANA zone the browser knows, with the
// current value kept even when this browser doesn't list it.

const COMMON = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Amsterdam', 'Europe/Lisbon', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'UTC']

export function timeZones(current?: string | null): string[] {
  let all: string[] = []
  try { all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [] } catch { all = [] }
  const list = all.length ? [...all] : [...COMMON]
  if (!list.includes('UTC')) list.push('UTC')
  if (current && !list.includes(current)) list.unshift(current)
  return list
}
