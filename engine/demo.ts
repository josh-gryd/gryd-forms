// Demo mode (FORMS_DEMO=1): a public install anyone can try. Everything is
// wiped and re-seeded at the top of every hour, and the features a stranger
// could misuse are off: uploads (no hosting files), redirect endings (no
// bouncing visitors to a look-alike page), and email or Slack (nothing leaves
// the app). Every guard is here, on the server, so the browser can't skip it.

import fs from 'node:fs'
import path from 'node:path'
import { getDb } from './db/index.js'
import { storageConfig } from './forms/storage.js'
import { ServiceError } from './forms/errors.js'
import { formsLog } from './forms/log.js'
import { setWorkspaceValue } from './forms/repo.js'
import type { FormDefinition } from './forms/core/index'

export const DEMO_MAX_FORMS = 150
export const DEMO_RESET_MS = 60 * 60 * 1000

export function isDemo(): boolean {
  return process.env.FORMS_DEMO === '1'
}

/** Throws when demo mode turns `what` off. */
export function demoRefuse(what: 'uploads' | 'images'): void {
  if (!isDemo()) return
  throw new ServiceError(403, what === 'uploads'
    ? 'File uploads are turned off in the demo. Everything else on this form works.'
    : 'Image uploads are turned off in the demo. Run your own copy to add logos and images.')
}

/** Publishing in the demo: no redirect endings, and the total number of forms stays bounded. */
export function demoCheckPublish(def: FormDefinition): void {
  if (!isDemo()) return
  if (def.endings.some(e => e.kind === 'redirect')) {
    throw new ServiceError(422, 'Redirect endings are turned off in the demo. Change the ending to a thank-you message to publish.', { issues: [{ kind: 'demo_redirect', message: 'Redirect endings are off in the demo.' }] })
  }
}

export function demoCheckCreate(): void {
  if (!isDemo()) return
  const n = (getDb().prepare('SELECT COUNT(*) AS n FROM forms').get() as { n: number }).n
  if (n >= DEMO_MAX_FORMS) throw new ServiceError(429, 'The demo is full for this hour. It resets at the top of the hour.')
}

// Children first, so a foreign key never blocks a delete.
const TABLES = [
  'form_submission_events', 'form_submission_answers', 'form_notifications', 'form_files', 'form_submissions',
  'form_assets', 'form_versions', 'forms', 'form_folders', 'form_templates', 'form_workspace_assets', 'forms_workspace',
]

/** When the next wipe happens: the top of the next hour. */
export function nextResetAt(now = Date.now()): number {
  return Math.floor(now / DEMO_RESET_MS) * DEMO_RESET_MS + DEMO_RESET_MS
}

export async function resetDemo(): Promise<void> {
  const db = getDb()
  db.transaction(() => { for (const t of TABLES) db.prepare(`DELETE FROM ${t}`).run() })()
  const cfg = storageConfig()
  if (cfg.kind === 'local' && fs.existsSync(cfg.dir)) {
    for (const name of fs.readdirSync(cfg.dir)) fs.rmSync(path.join(cfg.dir, name), { recursive: true, force: true })
  }
  const { seedDemo } = await import('./demo-seed.js')
  seedDemo()
  setWorkspaceValue('demo_reset_at', String(Date.now()), 'demo')
  formsLog.info('demo.reset', {})
}

function lastReset(): number {
  try {
    const row = getDb().prepare(`SELECT value FROM forms_workspace WHERE key = 'demo_reset_at'`).get() as { value: string } | undefined
    return row ? Number(row.value) || 0 : 0
  } catch { return 0 }
}

let timer: NodeJS.Timeout | null = null

/** Resets now if the last reset was before this hour began (a machine that slept
 *  wakes up stale), then at the top of every hour. */
export async function startDemo(): Promise<void> {
  if (!isDemo() || timer) return
  const hourStart = nextResetAt() - DEMO_RESET_MS
  if (lastReset() < hourStart) await resetDemo()
  const schedule = () => {
    timer = setTimeout(() => { void resetDemo().catch(err => formsLog.error('demo.reset_failed', err)).finally(schedule) }, nextResetAt() - Date.now() + 1000)
    timer.unref()
  }
  schedule()
}
