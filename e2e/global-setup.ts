// Signs in once with the admin password and saves the cookie for every test.
// Against a dev server with no password set, sign-in is off and this is a no-op.
import { request, type FullConfig } from '@playwright/test'

export default async function globalSetup(config: FullConfig) {
  const base = config.projects[0].use.baseURL!
  const password = process.env.FORMS_ADMIN_PASSWORD
  const ctx = await request.newContext({ baseURL: base })
  if (password) {
    const res = await ctx.post('/api/auth/sign-in', { form: { password, next: '/forms' }, maxRedirects: 0 })
    if (res.status() !== 303 || !(res.headers().location || '').startsWith('/forms')) throw new Error(`sign-in failed: ${res.status()} ${res.headers().location}`)
  }
  await ctx.storageState({ path: 'test-results/.auth.json' })
  await ctx.dispose()
}
