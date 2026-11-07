// One structured line per meaningful forms event, so a production failure
// can be traced by form, version, submission or file id without ever logging
// an answer. Values are key=value pairs; strings are quoted when they have
// spaces so the line stays grep- and awk-friendly.

type Fields = Record<string, string | number | boolean | null | undefined>

function fmt(fields: Fields): string {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      const s = String(v)
      return /[\s"=]/.test(s) ? `${k}=${JSON.stringify(s)}` : `${k}=${s}`
    })
    .join(' ')
}

export const formsLog = {
  info(event: string, fields: Fields = {}) { console.log(`[forms] event=${event} ${fmt(fields)}`.trim()) },
  warn(event: string, fields: Fields = {}) { console.warn(`[forms] event=${event} ${fmt(fields)}`.trim()) },
  error(event: string, err: unknown, fields: Fields = {}) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[forms] event=${event} ${fmt({ ...fields, error: message })}`.trim())
    if (err instanceof Error && err.stack && process.env.NODE_ENV !== 'production') console.error(err.stack)
  },
}
