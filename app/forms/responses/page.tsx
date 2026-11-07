import { Suspense } from 'react'
import ResponsesPage from './ResponsesPage'

export const dynamic = 'force-dynamic'

export default function FormsResponsesPage() {
  return <Suspense fallback={null}><ResponsesPage /></Suspense>
}
