import './forms.css'
import './phone.css'
import { Toaster, LiveRegion } from './ui'

// Every Forms surface (home, builder, results) renders inside the v2 token
// scope; the public form does the same from its own route.
export default function FormsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-forms-root="" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%', background: 'var(--bg)' }}>
      <LiveRegion><Toaster>{children}</Toaster></LiveRegion>
    </div>
  )
}
