import { NextResponse } from 'next/server'
import { currentEmail } from './session'

/** Route backstop (middleware is the first gate): null when signed in, else a 401. */
export async function requireSession(): Promise<NextResponse | null> {
  return (await currentEmail()) ? null : NextResponse.json({ error: 'not signed in' }, { status: 401 })
}
