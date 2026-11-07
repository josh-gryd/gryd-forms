const MESSAGES: Record<string, string> = {
  wrong: 'That password is not right.',
  slow: 'Too many tries. Wait a few minutes and try again.',
  unset: 'No admin password is set. Set FORMS_ADMIN_PASSWORD and restart.',
}

export const dynamic = 'force-dynamic'

export default async function SignIn(props: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await props.searchParams
  const unset = !process.env.FORMS_ADMIN_PASSWORD
  const error = unset ? MESSAGES.unset : sp.error ? MESSAGES[sp.error] : null
  const brand = process.env.FORMS_BRAND_NAME || 'Forms'
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, fontFamily: 'var(--font-body)', color: 'var(--tx)' }}>
      <form action="/api/auth/sign-in" method="post"
        style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14, padding: 28, background: 'var(--card)', border: '2px solid var(--ink)', borderRadius: 'var(--r-card)', boxShadow: 'var(--el-2)' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-title)', fontSize: 26, fontWeight: 800 }}>📝 {brand}</h1>
        <p style={{ margin: 0, color: 'var(--tx2)', fontSize: 14, fontWeight: 600 }}>Sign in to build forms and read responses.</p>
        <input type="hidden" name="next" value={sp.next || '/forms'} />
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 800 }}>
          Password
          <input type="password" name="password" autoFocus required disabled={unset} autoComplete="current-password"
            style={{ height: 40, padding: '0 12px', border: '2px solid var(--ink)', borderRadius: 'var(--r-control)', background: 'var(--bg)', color: 'var(--tx)', font: 'inherit', fontSize: 15 }} />
        </label>
        {error ? <p role="alert" style={{ margin: 0, color: 'var(--coral-tx)', fontSize: 13, fontWeight: 700 }}>{error}</p> : null}
        <button type="submit" disabled={unset}
          style={{ height: 42, border: '2px solid var(--ink)', borderRadius: 'var(--r-control)', background: 'var(--lime)', color: 'var(--ink)', font: 'inherit', fontSize: 15, fontWeight: 800, cursor: 'pointer', boxShadow: 'var(--el-1)' }}>
          Sign in
        </button>
      </form>
    </main>
  )
}
