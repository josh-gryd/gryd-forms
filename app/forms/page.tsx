import { Suspense } from 'react'
import FormsHome from './FormsHome'

export const dynamic = 'force-dynamic'

export default function FormsPage() {
  return <Suspense fallback={null}><FormsHome /></Suspense>
}
