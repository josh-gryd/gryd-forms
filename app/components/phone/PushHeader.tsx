'use client'

// The top of a pushed page ("Stack + Bar"): ‹ and the name of the place you
// came from, then the page's own title or controls. Its top padding clears the
// status bar.

import { PhoneIcon } from './icons'

export default function PushHeader({ back, onBack, title, right, children }: {
  /** The previous place: Home, Board, Inbox, or the record before this one. */
  back: string
  onBack: () => void
  title?: string
  right?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="ph-push-head">
      <div className="ph-push-head-row">
        <button type="button" className="ph-push-back" onClick={onBack} aria-label={`Back to ${back}`}>
          <PhoneIcon name="chevron-left" size={28} />{back}
        </button>
        {right ? <span className="ph-push-head-right">{right}</span> : null}
      </div>
      {title ? <h1 className="ph-push-title">{title}</h1> : null}
      {children}
    </div>
  )
}
