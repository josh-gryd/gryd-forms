// On every public form in the demo: nobody should type anything real here.
export default function PublicDemoNotice() {
  return (
    <div role="note" data-testid="demo-public-notice"
      style={{ position: 'sticky', top: 0, zIndex: 50, padding: '8px 16px', background: '#ffd23f', color: '#141414', borderBottom: '2px solid #141414', font: '700 13.5px/1.4 system-ui, -apple-system, sans-serif', textAlign: 'center' }}>
      Demo form. Don’t enter passwords, payment details or real personal information. Everything here is deleted every hour.
    </div>
  )
}
