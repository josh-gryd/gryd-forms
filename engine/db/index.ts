import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { config } from '../config.js'
import { migrateForms } from '../forms/schema-db.js'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    // Read at first call, not import, so a test's DB_PATH=':memory:' wins.
    const file = process.env.DB_PATH || config.dbPath
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
    _db = new Database(file)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    _db.pragma('busy_timeout = 5000')
    migrateForms(_db)
  }
  return _db
}

/** Tests only: drop the connection so the next getDb() opens a fresh one. */
export function resetDbForTests(): void {
  _db?.close()
  _db = null
}

export { Database }
