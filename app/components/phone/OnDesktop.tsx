'use client'

// The phone's "open on desktop" state (handoff §6): builders and editors are
// desktop work, so on a phone the page says so plainly instead of squeezing an
// editor into 390px. It names what can still be done here, links to it, and
// copies the page's link for the computer.

import { useState } from 'react'
import { PhoneIcon } from './icons'

export default function OnDesktop({ what, here, children }: {
  /** The work this page is for: "Building and editing flows". */
  what: string
  /** What the phone can still do, each a link: [label, href]. */
  here?: [string, string][]
  /** A read-only summary to show under the note (the flow's steps, the form's fields). */
  children?: React.ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2200) } catch { /* no clipboard: the button stays as it was */ }
  }
  return (
    <div className="ph-page" data-testid="on-desktop">
      <div className="ph-desk">
        <span className="ph-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><PhoneIcon name="monitor" size={14} />Open on desktop</span>
        <p>{what} needs a bigger screen. Everything here is as you left it.</p>
        <button type="button" className="ph-btn" onClick={copy}><PhoneIcon name={copied ? 'check' : 'copy'} size={17} />{copied ? 'Link copied' : 'Copy the link for your computer'}</button>
        {here?.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {here.map(([label, href]) => <a key={href} className="ph-btn" data-flat="" href={href}>{label}</a>)}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  )
}
