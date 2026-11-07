'use client'

// The phone toast: 50px of ink above the command bar, with Undo in gold when the
// action can be taken back. Raised from anywhere with phoneToast().

import { dismissToast, usePhoneUI } from '@/lib/phone/ui-store'

export default function PhoneToast() {
  const toast = usePhoneUI(s => s.toast)
  return (
    <div className="ph-toast" data-open={toast ? '' : undefined} role="status" aria-live="polite">
      <span className="ph-toast-text">{toast?.text}</span>
      {toast?.undo ? (
        <button type="button" className="ph-toast-undo" onClick={() => { const u = toast.undo; dismissToast(); u?.() }}>Undo</button>
      ) : null}
    </div>
  )
}
