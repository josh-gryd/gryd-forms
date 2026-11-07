import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export function POST() {
  const res = new NextResponse(null, { status: 303, headers: { location: '/auth/sign-in' } })
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
