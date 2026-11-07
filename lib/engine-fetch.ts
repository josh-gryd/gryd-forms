// The web app's line to the forms engine. Both run in one process (server.ts):
// the engine listens on 127.0.0.1 only, behind a secret made at boot.

const BASE = () => `http://127.0.0.1:${process.env.FORMS_ENGINE_PORT || '3101'}`

/** fetch() for an engine path (`/api/forms/...`), with the internal secret attached. */
export function engineFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/')) throw new Error('engineFetch takes an engine path')
  const headers = new Headers(init.headers)
  headers.set('x-forms-secret', process.env.FORMS_INTERNAL_SECRET || '')
  return fetch(BASE() + path, { ...init, headers })
}
