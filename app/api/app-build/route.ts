// The deploy now serving the portal. A page compares it with the deploy that
// served it, so a tab left open across a deploy can say it is out of date
// instead of quietly running old code (QA retest 2026-09-25: a builder tab
// opened before a deploy kept showing the pre-fix Preview).

import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/require-session'
import { currentBuild } from '@/lib/build-id'

export const dynamic = 'force-dynamic'

export async function GET() {
  const __auth = await requireSession(); if (__auth) return __auth
  return NextResponse.json({ build: currentBuild() }, { headers: { 'cache-control': 'no-store' } })
}
