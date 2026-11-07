// Forms — the tables, in their own module the way scout-inbox-schema.ts is.
// Called once from runMigrations(); every statement is IF NOT EXISTS so it is
// safe on every boot, and column additions are guarded by PRAGMA table_info.
//
// Shape:
//   forms                     one row per form; the DRAFT document lives here
//                             with a revision counter for optimistic concurrency
//   form_versions             immutable published documents, numbered per form
//   form_submissions          one row per respondent session: partial → completed
//   form_submission_answers   one row per answered block (search, filters, CSV)
//   form_submission_events    lifecycle log (started, autosaved, submitted…)
//   form_files                uploaded file metadata; bytes live in object storage
//   form_assets               builder-uploaded images/logos, public by design
//   form_folders              the sidebar's folders; a form sits in one or none
//   form_templates            forms saved as a starting point (built-ins are code)
//   forms_workspace           workspace settings: branding, defaults, the sender
//   form_workspace_assets     the workspace logo (not tied to a form)
//   form_notifications        every notification (Slack post or email) attempted, and why not

import type { Database } from 'better-sqlite3'

export function migrateForms(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS forms (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',        -- 'draft' | 'published' | 'closed'
      draft_definition TEXT NOT NULL,              -- JSON, current schema
      draft_revision INTEGER NOT NULL DEFAULT 1,
      draft_hash TEXT NOT NULL DEFAULT '',
      draft_updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      draft_updated_by TEXT,
      live_version_id TEXT,
      published_at TEXT,
      closed_at TEXT,
      closed_message TEXT NOT NULL DEFAULT '',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_forms_list ON forms(deleted_at, updated_at DESC);

    CREATE TABLE IF NOT EXISTS form_versions (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      schema_version INTEGER NOT NULL,
      definition TEXT NOT NULL,                    -- JSON, immutable
      definition_hash TEXT NOT NULL,
      published_by TEXT,
      published_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(form_id, number)
    );

    CREATE TABLE IF NOT EXISTS form_submissions (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      version_id TEXT NOT NULL REFERENCES form_versions(id),
      status TEXT NOT NULL DEFAULT 'partial',      -- 'partial' | 'completed' | 'spam'
      resume_token_hash TEXT NOT NULL UNIQUE,
      idempotency_key TEXT,
      answers TEXT NOT NULL DEFAULT '{}',          -- JSON block id → value (active answers)
      ending_id TEXT,
      ending_rule_id TEXT,
      current_page_id TEXT,
      furthest_page_id TEXT,
      furthest_page_index INTEGER NOT NULL DEFAULT 0,
      pages_visited TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',         -- ua, device, referrer, language, flags (never raw ip)
      search_text TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      last_activity_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      submitted_at TEXT,
      duration_ms INTEGER,
      deleted_at TEXT,
      UNIQUE(form_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_form_submissions_list ON form_submissions(form_id, deleted_at, status, submitted_at DESC, last_activity_at DESC);

    CREATE TABLE IF NOT EXISTS form_submission_answers (
      submission_id TEXT NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
      block_id TEXT NOT NULL,
      value TEXT NOT NULL,                         -- JSON
      text TEXT NOT NULL DEFAULT '',               -- rendered with the version's labels
      PRIMARY KEY (submission_id, block_id)
    );
    CREATE INDEX IF NOT EXISTS idx_form_submission_answers_block ON form_submission_answers(block_id, text);

    CREATE TABLE IF NOT EXISTS form_submission_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id TEXT NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      detail TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_form_submission_events_sub ON form_submission_events(submission_id, id);

    CREATE TABLE IF NOT EXISTS form_files (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      submission_id TEXT REFERENCES form_submissions(id) ON DELETE SET NULL,
      block_id TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',      -- 'pending' | 'uploaded' | 'failed' | 'deleted'
      upload_token_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      uploaded_at TEXT,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_form_files_submission ON form_files(submission_id);
    CREATE INDEX IF NOT EXISTS idx_form_files_pending ON form_files(status, created_at);

    CREATE TABLE IF NOT EXISTS form_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS form_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      definition TEXT NOT NULL,                    -- JSON, a draft to copy
      source_form_id TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS forms_workspace (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,                         -- JSON
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS form_workspace_assets (
      id TEXT PRIMARY KEY,
      storage_key TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS form_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      submission_id TEXT,
      kind TEXT NOT NULL,                          -- 'owner' | 'confirmation' | 'slack'
      recipient TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,                        -- 'sent' | 'failed' | 'skipped'
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_form_notifications_form ON form_notifications(form_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS form_assets (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      storage_key TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `)

  // Added for the Forms workspace (2026-09-25).
  addColumn(db, 'forms', 'name', `TEXT NOT NULL DEFAULT ''`)            // internal name; '' shows the title
  addColumn(db, 'forms', 'owner', 'TEXT')
  addColumn(db, 'forms', 'folder_id', 'TEXT')
  addColumn(db, 'forms', 'archived_at', 'TEXT')
  addColumn(db, 'forms', 'ops', `TEXT NOT NULL DEFAULT '{}'`)           // JSON FormOps: takes effect at once, not versioned
  const readAtAdded = addColumn(db, 'form_submissions', 'read_at', 'TEXT')
  addColumn(db, 'form_submissions', 'edit_token_hash', 'TEXT')
  addColumn(db, 'form_submissions', 'edited_at', 'TEXT')
  addColumn(db, 'form_submissions', 'respondent', 'TEXT')              // signed-in respondent (restricted forms)
  addColumn(db, 'form_submissions', 'device_hash', 'TEXT')
  addColumn(db, 'form_notifications', 'recipient_key', `TEXT NOT NULL DEFAULT ''`) // the inbox it reaches (ops.mailboxKey), for the per-address cap
  addColumn(db, 'form_folders', 'color', 'TEXT')                       // 2026-09-27: a palette name; NULL shows one picked from the id
  // Responses from before unread existed count as read, so the inbox doesn't open on a backlog.
  if (readAtAdded) db.exec(`UPDATE form_submissions SET read_at = COALESCE(submitted_at, last_activity_at) WHERE status = 'completed'`)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_forms_folder ON forms(folder_id);
    CREATE INDEX IF NOT EXISTS idx_form_submissions_inbox ON form_submissions(status, deleted_at, read_at, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_form_submissions_device ON form_submissions(form_id, device_hash);
    CREATE INDEX IF NOT EXISTS idx_form_submissions_respondent ON form_submissions(form_id, respondent);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_form_submissions_edit ON form_submissions(edit_token_hash) WHERE edit_token_hash IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_form_notifications_inbox ON form_notifications(kind, recipient_key, created_at);
  `)
}

/** Adds a column once. True when it was added by this call. */
function addColumn(db: Database, table: string, column: string, ddl: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (cols.some(c => c.name === column)) return false
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
  return true
}
