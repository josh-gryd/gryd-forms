// Every user-facing validation string, by language, lives in i18n.ts; ERR
// reads whichever catalog `withLanguage` made active (English by default).
import { errorsFor, type ErrorCatalog } from './i18n'

export const ERR: ErrorCatalog = new Proxy({} as ErrorCatalog, {
  // Reads the catalog of the language validation is running in (i18n.ts).
  get: (_target, key) => (errorsFor() as unknown as Record<string | symbol, unknown>)[key],
})
