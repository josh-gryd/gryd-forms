'use client'

// A record on the phone ("Stack + Bar": records push in full-screen and swipe
// back from the left edge). It takes Sheet's props, so a record that used to
// open as a sheet changes one tag: its own header sits under ‹ and the name of
// the place you came from (its × gives way to that), the body scrolls, and the
// action bar stays at the bottom. Detents don't apply to a full page.

import { usePathname } from 'next/navigation'
import { placeFor } from '@/lib/phone/place'
import PushView from './PushView'
import PushHeader from './PushHeader'
import type { Detent } from './Sheet'

interface Props {
  open: boolean
  onClose: () => void
  header?: React.ReactNode
  children: React.ReactNode
  actionBar?: React.ReactNode
  label: string
  flush?: boolean
  /** The place behind this record when it isn't the page (a record opened from a record). */
  back?: string
  detents?: Detent[]
  initial?: Detent
  want?: { detent: Detent; seq: number }
  surface?: string
}

export default function RecordView({ open, onClose, header, children, actionBar, label, flush, back }: Props) {
  const pathname = usePathname()
  return (
    <PushView open={open} onClose={onClose} label={label}>
      <div className="ph-push-page ph-rec">
        <PushHeader back={back ?? placeFor(pathname).page} onBack={onClose}>
          {header ? <div className="ph-rec-head">{header}</div> : null}
        </PushHeader>
        <div className="ph-rec-body" data-flush={flush || undefined}>{children}</div>
        {actionBar ? <div className="ph-rec-bar">{actionBar}</div> : null}
      </div>
    </PushView>
  )
}
