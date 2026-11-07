// Spam and abuse signals for public submissions. Nothing here rejects a real
// person: the honeypot is the only hard signal (a hidden field no human can
// fill), everything else is recorded on the response so Results can show it.

import { classifyRequest } from '../integrations/bot-detection.js'

export interface AbuseInput {
  honeypotFilled: boolean
  startedAt: string | null
  now: number
  answeredCount: number
  userAgent: string | null
  acceptLanguage: string | null | undefined
}

export interface AbuseVerdict { spam: boolean; flags: string[] }

export function abuseVerdict(input: AbuseInput): AbuseVerdict {
  const flags: string[] = []
  if (input.honeypotFilled) flags.push('honeypot')
  const ua = classifyRequest({ userAgent: input.userAgent, acceptLanguage: input.acceptLanguage, navigation: false })
  if (ua.automated) flags.push(`ua:${ua.reason}`)
  if (input.startedAt) {
    const elapsed = input.now - Date.parse(input.startedAt)
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 1500 && input.answeredCount >= 3) flags.push('fast')
  }
  return { spam: input.honeypotFilled, flags }
}

/** Device summary for Results ("iphone · safari"), from the user agent only. */
export function deviceSummary(userAgent: string | null | undefined): string {
  const ua = userAgent ?? ''
  const os = /iPhone/i.test(ua) ? 'iphone' : /iPad/i.test(ua) ? 'ipad' : /Android/i.test(ua) ? 'android' : /Windows/i.test(ua) ? 'windows' : /Mac OS X|Macintosh/i.test(ua) ? 'mac' : /Linux/i.test(ua) ? 'linux' : 'unknown'
  const browser = /Edg\//i.test(ua) ? 'edge' : /OPR\//i.test(ua) ? 'opera' : /Firefox\//i.test(ua) ? 'firefox' : /Chrome\//i.test(ua) && !/Chromium/i.test(ua) ? 'chrome' : /Chromium/i.test(ua) ? 'chromium' : /Safari\//i.test(ua) ? 'safari' : 'unknown'
  return `${os} · ${browser}`
}
