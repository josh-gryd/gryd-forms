// The Responses tab's Summary: how a form is doing and what people answered,
// question by question, from completed responses. Computed on request — a few
// thousand responses are a few milliseconds of JSON.

import * as repo from './repo'
import { ServiceError } from './errors'
import { loadDefinition } from './definitions'
import { parseOps } from './ops'
import { allBlocks, carryAnswer, componentDef, isInputBlock, type AnswerMap, type Block } from './core/index'

type Base = { id: string; label: string; type: string; answered: number }
export type QuestionSummary =
  | (Base & { kind: 'options'; multi: boolean; options: Array<{ id: string; label: string; count: number }> })
  | (Base & { kind: 'numbers'; min: number | null; max: number | null; average: number | null; distribution: Array<{ value: number; count: number }> | null })
  | (Base & { kind: 'text'; samples: string[] })
  | (Base & { kind: 'count' })

export interface FormReport {
  completed: number; partial: number; spam: number
  /** Completed out of everyone who started. Null before anyone has. */
  completionRate: number | null
  medianDurationMs: number | null
  lastResponseAt: string | null
  /** Completed responses per day for the last 30 days, oldest first, zeros included. A day is
   *  the calendar day in the form's time zone, the one its opening and closing times use. */
  perDay: Array<{ day: string; count: number }>
  timezone: string
  questions: QuestionSummary[]
}

const OPTION_TYPES = new Set(['choice', 'dropdown', 'checks', 'picture'])
const BOOL_TYPES = new Set(['yesno', 'switch'])
const NUMBER_TYPES = new Set(['number', 'rating', 'scale'])
const TEXT_TYPES = new Set(['short', 'long', 'email', 'url', 'phone'])
const DAYS = 30

export function formReport(formId: string, now = Date.now()): FormReport {
  const row = repo.getForm(formId)
  if (!row) throw new ServiceError(404, 'form not found')
  // Questions as the draft has them, then any only older versions had; option
  // labels from wherever an option was last seen, the draft winning.
  const blocks = new Map<string, Block>()
  const optionLabels = new Map<string, string>()
  const add = (json: string) => {
    for (const b of allBlocks(loadDefinition(json))) {
      if (!isInputBlock(b) || b.type === 'hidden') continue
      if (!blocks.has(b.id)) blocks.set(b.id, b)
      for (const o of b.options) if (!optionLabels.has(o.id)) optionLabels.set(o.id, o.label)
    }
  }
  add(row.draftDefinition)
  // Each response's own question, by version: a field whose type changed since
  // still counts older answers, carried across to the type it has now.
  const asked = new Map<string, Map<string, Block>>()
  for (const v of repo.listVersions(formId)) {
    add(v.definition)
    asked.set(v.id, new Map(allBlocks(loadDefinition(v.definition)).map(b => [b.id, b])))
  }

  const counts = repo.submissionCounts(formId)
  const subs = repo.iterateSubmissions(formId, { status: 'completed', sort: 'submitted_desc' })
  const answersOf = subs.map(s => ({ answers: JSON.parse(s.answers || '{}') as AnswerMap, blocks: asked.get(s.versionId) }))
  const answerFor = (sub: (typeof answersOf)[number], b: Block) => {
    const v = sub.answers[b.id]
    const then = sub.blocks?.get(b.id)
    return then && then.type !== b.type ? carryAnswer(then, b, v) : v
  }

  const questions: QuestionSummary[] = []
  for (const b of blocks.values()) {
    const d = componentDef(b.type)
    const values = answersOf.map(a => answerFor(a, b)).filter(v => v !== undefined && !d.isEmpty(v))
    const base: Base = { id: b.id, label: b.label || d.label, type: b.type, answered: values.length }
    if (OPTION_TYPES.has(b.type)) {
      const tally = new Map<string, number>(b.options.map(o => [o.id, 0]))
      for (const v of values) for (const id of Array.isArray(v) ? (v as string[]) : [String(v)]) tally.set(id, (tally.get(id) ?? 0) + 1)
      questions.push({ ...base, kind: 'options', multi: b.type === 'checks' || (b.type === 'picture' && Array.isArray(values[0])), options: [...tally].map(([id, count]) => ({ id, label: optionLabels.get(id) ?? 'Removed option', count })) })
    } else if (BOOL_TYPES.has(b.type)) {
      const yes = values.filter(v => v === true).length
      questions.push({ ...base, kind: 'options', multi: false, options: [{ id: 'true', label: d.display(b, true), count: yes }, { id: 'false', label: d.display(b, false), count: values.length - yes }] })
    } else if (NUMBER_TYPES.has(b.type)) {
      const nums = values.map(Number).filter(n => Number.isFinite(n))
      const s = b.settings as { min?: number; max?: number }
      let distribution: Array<{ value: number; count: number }> | null = null
      if (b.type === 'rating' || b.type === 'scale') {
        const lo = b.type === 'rating' ? 1 : Number(s.min ?? 1), hi = Number(s.max ?? (b.type === 'rating' ? 5 : 10))
        distribution = []
        for (let v = lo; v <= hi && distribution.length <= 11; v++) distribution.push({ value: v, count: nums.filter(n => n === v).length })
      }
      questions.push({ ...base, kind: 'numbers', min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null, average: nums.length ? Math.round((nums.reduce((x, y) => x + y, 0) / nums.length) * 100) / 100 : null, distribution })
    } else if (TEXT_TYPES.has(b.type)) {
      questions.push({ ...base, kind: 'text', samples: values.slice(0, 5).map(v => d.display(b, v).slice(0, 300)) })
    } else {
      questions.push({ ...base, kind: 'count' })
    }
  }

  // Days in the form's time zone, not UTC: a 7:34 pm response in New York is that evening's,
  // not tomorrow's (QA 09-25, round 3). Days step by calendar date, so DST can't skip or repeat one.
  const timezone = parseOps(row.ops).timezone
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const dayIn = (t: Date): string => { const p = Object.fromEntries(fmt.formatToParts(t).map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}` }
  const byDay = new Map<string, number>()
  for (const s of subs) if (s.submittedAt) { const d = dayIn(new Date(s.submittedAt)); byDay.set(d, (byDay.get(d) ?? 0) + 1) }
  const [ty, tm, td] = dayIn(new Date(now)).split('-').map(Number)
  const perDay: FormReport['perDay'] = []
  for (let i = DAYS - 1; i >= 0; i--) {
    const day = new Date(Date.UTC(ty, tm - 1, td - i)).toISOString().slice(0, 10)
    perDay.push({ day, count: byDay.get(day) ?? 0 })
  }
  const started = counts.completed + counts.partial
  return {
    completed: counts.completed, partial: counts.partial, spam: counts.spam,
    completionRate: started ? Math.round((counts.completed / started) * 1000) / 1000 : null,
    medianDurationMs: counts.medianDurationMs,
    lastResponseAt: subs[0]?.submittedAt ?? null,
    perDay, timezone, questions,
  }
}
