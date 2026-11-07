// A form's Slack post: one channel or one person hears about each new response,
// with the questions the form's Settings chose. It posts as the Slack app whose
// bot token is SLACK_BOT_TOKEN, so a private channel needs one invite.
// Answers are strangers' text: everything in a post is escaped, so nobody can
// type a mention (<!channel>) or a disguised link into the team's Slack.

import { listSlackChannels, listSlackUsers, postSlackMessage, slackToken } from '../integrations/slack.js'
import { allBlocks, componentDef, isInputBlock, renderTemplate, type AnswerMap, type FormDefinition } from './core/index'
import type { SlackSettings, SlackTarget } from './ops'
import { isDemo } from '../demo.js'

export function slackSender(): string {
  return 'forms'
}

/** Slack's three control characters; everything else is shown as typed. */
export const slackEscape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** The post: the message line, the chosen answers, and a link to the response. */
export function slackText(def: FormDefinition, answers: AnswerMap, settings: Pick<SlackSettings, 'message' | 'fields'>, link: string): string {
  const head = settings.message.trim()
    ? slackEscape(clip(renderTemplate(settings.message.trim(), def, answers), 1000))
    : `New response to *${slackEscape(clip(def.title, 200))}*`
  const chosen = settings.fields ? new Set(settings.fields) : null
  const lines: string[] = []
  for (const b of allBlocks(def)) {
    if (!isInputBlock(b) || (chosen && !chosen.has(b.id)) || answers[b.id] === undefined) continue
    const d = componentDef(b.type)
    if (d.isEmpty(answers[b.id])) continue
    const label = clip((renderTemplate(b.label, def, answers) || d.label).replace(/\s+/g, ' ').trim(), 150)
    lines.push(`*${slackEscape(/[?:.!]$/.test(label) ? label : `${label}:`)}* ${slackEscape(clip(d.display(b, answers[b.id]), 500))}`)
  }
  const body = clip([head, ...lines].join('\n'), 3500)
  return `${body}\n<${link}|Open the response>`
}

/** A test post: the form's chosen questions, with placeholders for the answers. */
export function slackTestText(def: FormDefinition, settings: Pick<SlackSettings, 'message' | 'fields'>, link: string): string {
  const chosen = settings.fields ? new Set(settings.fields) : null
  const sample: AnswerMap = {}
  for (const b of allBlocks(def)) if (isInputBlock(b) && (!chosen || chosen.has(b.id))) sample[b.id] = '…'
  const labels = allBlocks(def).filter(b => sample[b.id] !== undefined).map(b => {
    const label = clip((b.label || componentDef(b.type).label).replace(/\s+/g, ' ').trim(), 150)
    return `*${slackEscape(/[?:.!]$/.test(label) ? label : `${label}:`)}* _answer_`
  })
  const head = settings.message.trim() ? slackEscape(clip(settings.message.trim().replace(/\{\{\s*answer:[^}]*\}\}/g, '…'), 1000)) : `New response to *${slackEscape(clip(def.title, 200))}*`
  return `_Test from Forms: new responses will post here like this._\n${clip([head, ...labels].join('\n'), 3500)}\n<${link}|Open the form's responses>`
}

/** Slack's error codes, said the way a person fixes them. */
export function slackProblem(error: string, target: SlackTarget | null): string {
  const where = target?.label ?? 'that channel'
  if (error === 'no_slack_credential') return `Slack isn't connected, so nothing can post. Set SLACK_BOT_TOKEN (see the README) and restart.`
  if (error.startsWith('not_in_channel')) return `The Slack app isn't in ${where}. Invite it to the channel in Slack (/invite @YourApp), then try again.`
  if (error === 'channel_not_found') return `Slack can't find ${where}, or the Slack app can't see it. For a private channel, invite the app first.`
  if (error === 'is_archived') return `${where} is archived. Choose another channel.`
  if (error === 'user_not_found' || error === 'cannot_dm_bot' || error === 'user_disabled') return `Slack can't message ${where}.`
  if (error === 'ratelimited' || error === 'http_429') return 'Slack asked us to slow down. Try again in a minute.'
  return `Slack said: ${error}`
}

export interface SlackPostDeps { post: (target: SlackTarget, text: string) => Promise<{ ok: true } | { ok: false; error: string }> }

const realPost: SlackPostDeps['post'] = async (target, text) => {
  const r = await postSlackMessage(target.id, text)
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}
let post: SlackPostDeps['post'] = realPost

/** Test injection only. Null restores the real Slack post. */
export function setSlackPostForForms(next: SlackPostDeps['post'] | null): void { post = next ?? realPost }

export function postToSlack(target: SlackTarget, text: string): Promise<{ ok: true } | { ok: false; error: string }> { return post(target, text) }

// ── The picker ──────────────────────────────────────────────────────────────

export interface SlackOption { kind: 'channel' | 'user'; id: string; label: string; sub?: string }

const TTL_MS = 60_000
let channelCache: { at: number; token: string; list: Array<{ id: string; name: string }> } | null = null

export interface SlackDirectory {
  token: (agentId: string) => Promise<string>
  channels: (agentId: string, token: string) => Promise<Array<{ id: string; name: string }>>
  users: (agentId: string, token: string) => Promise<Array<{ id: string; name: string; email?: string }>>
}
const realDirectory: SlackDirectory = { token: async () => slackToken(), channels: (_agent, token) => listSlackChannels(token), users: (_agent, token) => listSlackUsers(token) }
let directory: SlackDirectory = realDirectory

/** Test injection only. Null restores the real Slack directory. */
export function setSlackDirectory(next: Partial<SlackDirectory> | null): void { directory = { ...realDirectory, ...(next ?? {}) }; channelCache = null }

function rank(label: string, q: string): number {
  const l = label.toLowerCase().replace(/^#/, '')
  return !q ? 2 : l.startsWith(q) ? 0 : l.includes(q) ? 1 : 3
}

/** Channels the Slack app can see and people in the workspace, matching `query`. */
export async function slackTargets(query: string): Promise<{ options: SlackOption[]; unavailable?: string }> {
  if (isDemo()) return { options: [], unavailable: 'Slack is turned off in the demo. Run your own copy to post responses to Slack.' }
  const agent = slackSender()
  const token = await directory.token(agent)
  if (!token) return { options: [], unavailable: `Slack isn't connected. Set SLACK_BOT_TOKEN (see the README) and restart.` }
  const q = query.trim().toLowerCase().replace(/^[#@]/, '')
  let channels: Array<{ id: string; name: string }> = []
  let users: Array<{ id: string; name: string; email?: string }> = []
  const problems: string[] = []
  try {
    if (channelCache && channelCache.token === token && Date.now() - channelCache.at < TTL_MS) channels = channelCache.list
    else { channels = await directory.channels(agent, token); channelCache = { at: Date.now(), token, list: channels } }
  } catch (err) { problems.push(`channels: ${(err as Error).message}`) }
  try { users = await directory.users(agent, token) } catch (err) { problems.push(`people: ${(err as Error).message}`) }
  const pick = <T extends SlackOption>(list: T[]): T[] => list
    .map(o => ({ o, r: Math.min(rank(o.label, q), o.sub ? rank(o.sub, q) + 1 : 3) }))
    .filter(x => x.r < 3)
    .sort((a, b) => a.r - b.r || a.o.label.localeCompare(b.o.label))
    .slice(0, 25).map(x => x.o)
  const options = [
    ...pick(channels.map(c => ({ kind: 'channel' as const, id: c.id, label: `#${c.name}` }))),
    ...pick(users.map(u => ({ kind: 'user' as const, id: u.id, label: u.name, ...(u.email ? { sub: u.email } : {}) }))),
  ]
  return problems.length && !options.length ? { options, unavailable: `Slack didn't list ${problems.join('; ')}` } : { options }
}
