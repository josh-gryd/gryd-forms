// Where the forms engine keeps its data. Everything lives under one folder
// (FORMS_DATA_DIR, default ./data): the SQLite database and uploaded files.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const dataDir = path.resolve(process.env.FORMS_DATA_DIR || path.join(process.cwd(), 'data'))

export const config = {
  dataDir,
  dbPath: process.env.DB_PATH || path.join(dataDir, 'forms.db'),
}

let cachedSecret: string | null = null

/** A long-lived secret for signing (password-unlock tokens). FORMS_SECRET when
 *  set; otherwise made once and kept in the data folder. */
export function appSecret(): string {
  if (cachedSecret) return cachedSecret
  const env = process.env.FORMS_SECRET
  if (env && env.length >= 16) return (cachedSecret = env)
  if (config.dbPath === ':memory:') return (cachedSecret = 'test-secret-not-for-production')
  const file = path.join(dataDir, '.secret')
  try { cachedSecret = fs.readFileSync(file, 'utf8').trim() } catch { /* first boot */ }
  if (!cachedSecret) {
    fs.mkdirSync(dataDir, { recursive: true })
    cachedSecret = crypto.randomBytes(32).toString('hex')
    fs.writeFileSync(file, cachedSecret, { mode: 0o600 })
  }
  return cachedSecret
}
