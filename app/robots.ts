import type { MetadataRoute } from 'next'
import { isDemo } from '@/lib/demo'

export const dynamic = 'force-dynamic'

// Forms are linked to, not searched for; the demo is kept out of search entirely.
export default function robots(): MetadataRoute.Robots {
  return isDemo() ? { rules: { userAgent: '*', disallow: '/' } } : { rules: { userAgent: '*', disallow: ['/forms', '/api'] } }
}
