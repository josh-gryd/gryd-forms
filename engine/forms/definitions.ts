// Stored and incoming form documents → the current runtime shape. Old
// versions are migrated on read and never rewritten; a document the API is
// handed is migrated if it can be and refused if it can't.

import { SCHEMA_VERSION, parseDefinition, migrateDefinition, type FormDefinition } from './core/index'
import { ServiceError } from './errors'

/** Any stored document → the current runtime shape. Old versions are migrated on read, never rewritten. */
export function loadDefinition(json: string): FormDefinition {
  let raw: unknown
  try { raw = JSON.parse(json) } catch { throw new ServiceError(500, 'stored definition is not JSON') }
  const migrated = migrateDefinition(raw).definition
  const parsed = parseDefinition(migrated)
  if (!parsed.ok || !parsed.definition) throw new ServiceError(500, 'stored definition failed validation', { issues: parsed.issues })
  return parsed.definition
}

export function acceptDefinition(input: unknown): FormDefinition {
  if (!input || typeof input !== 'object') throw new ServiceError(400, 'definition required')
  let doc = input as Record<string, unknown>
  if (doc.schemaVersion !== SCHEMA_VERSION) {
    try { doc = migrateDefinition(doc).definition as Record<string, unknown> } catch (err) { throw new ServiceError(400, (err as Error).message) }
  }
  const parsed = parseDefinition(doc)
  if (!parsed.ok || !parsed.definition) throw new ServiceError(400, 'definition is invalid', { issues: parsed.issues })
  return parsed.definition
}

