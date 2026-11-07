import PublicDemoNotice from '@/app/components/demo/PublicDemoNotice'
import { isDemo } from '@/lib/demo'

export default function PublicFormLayout({ children }: { children: React.ReactNode }) {
  return <>{isDemo() ? <PublicDemoNotice /> : null}{children}</>
}
