// The Slack Web API calls Forms needs, with one bot token (SLACK_BOT_TOKEN).
// No token: nothing posts, and the form's Slack picker says how to connect.

const API = 'https://slack.com/api/'

export function slackToken(): string {
  return (process.env.SLACK_BOT_TOKEN || '').trim()
}

async function call(method: string, token: string, body: Record<string, unknown> | null, query: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(query).toString()
  const res = await fetch(API + method + (qs ? `?${qs}` : ''), {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json; charset=utf-8' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  if (res.status === 429) return { ok: false, error: 'ratelimited' }
  if (!res.ok) return { ok: false, error: `http_${res.status}` }
  return (await res.json()) as Record<string, unknown>
}

export async function listSlackChannels(token: string): Promise<Array<{ id: string; name: string }>> {
  const out: Array<{ id: string; name: string }> = []
  let cursor = ''
  for (let page = 0; page < 20; page++) {
    const r = await call('conversations.list', token, null, { types: 'public_channel,private_channel', exclude_archived: 'true', limit: '1000', ...(cursor ? { cursor } : {}) })
    if (!r.ok) throw new Error(String(r.error || 'conversations.list failed'))
    for (const c of (r.channels as Array<{ id: string; name: string }>) ?? []) out.push({ id: c.id, name: c.name })
    cursor = ((r.response_metadata as { next_cursor?: string } | undefined)?.next_cursor) || ''
    if (!cursor) break
  }
  return out
}

let usersCache: { at: number; token: string; users: Array<{ id: string; name: string; email?: string }> } | null = null

export async function listSlackUsers(token: string): Promise<Array<{ id: string; name: string; email?: string }>> {
  if (usersCache && usersCache.token === token && Date.now() - usersCache.at < 5 * 60_000) return usersCache.users
  const out: Array<{ id: string; name: string; email?: string }> = []
  let cursor = ''
  for (let page = 0; page < 20; page++) {
    const r = await call('users.list', token, null, { limit: '1000', ...(cursor ? { cursor } : {}) })
    if (!r.ok) throw new Error(String(r.error || 'users.list failed'))
    type U = { id: string; deleted?: boolean; is_bot?: boolean; name: string; real_name?: string; profile?: { display_name?: string; real_name?: string; email?: string } }
    for (const u of (r.members as U[]) ?? []) {
      if (u.deleted || u.is_bot || u.id === 'USLACKBOT') continue
      const name = u.profile?.real_name || u.real_name || u.profile?.display_name || u.name
      out.push({ id: u.id, name, ...(u.profile?.email ? { email: u.profile.email } : {}) })
    }
    cursor = ((r.response_metadata as { next_cursor?: string } | undefined)?.next_cursor) || ''
    if (!cursor) break
  }
  usersCache = { at: Date.now(), token, users: out }
  return out
}

/** Posts to a channel id, or to a person (a user id opens the bot's DM with them). */
export async function postSlackMessage(channel: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = slackToken()
  if (!token) return { ok: false, error: 'no_slack_credential' }
  let target = channel
  if (/^[UW]/.test(channel)) {
    const open = await call('conversations.open', token, { users: channel })
    if (!open.ok) return { ok: false, error: String(open.error || 'conversations.open failed') }
    target = (open.channel as { id: string }).id
  }
  const r = await call('chat.postMessage', token, { channel: target, text, unfurl_links: false, unfurl_media: false })
  return r.ok ? { ok: true } : { ok: false, error: String(r.error || 'post failed') }
}
