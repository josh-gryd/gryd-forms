'use client'

// Responses › Summary: how the form is doing, then what people answered,
// question by question. The headline numbers are stat tiles (the number is
// the chart). Responses per day is one series of thin columns with a hover
// readout and a table view. Each choice question is a set of bars carrying its
// count and share at the tip. One validated series colour (--viz-1); every
// label and value stays in text tokens, and every value is readable as text,
// so nothing is only in a tooltip.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formsApi, type FormReport, type QuestionSummary } from '@/lib/forms/api'
import { Btn, Card, EmptyState, Skeleton, Tag, relativeTime, formatDuration } from '../ui'
import { Icon } from '../ui/icons'

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0)
const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function SummaryView({ formId, refreshKey = 0 }: { formId: string; refreshKey?: number }) {
  const [report, setReport] = useState<FormReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try { setReport(await formsApi.report(formId)); setError(null) } catch (err) { setError((err as Error).message) } finally { setLoading(false) }
  }, [formId])
  useEffect(() => { void load() }, [load, refreshKey])

  if (error) return <div role="alert" className="fb-banner fb-banner--coral fb-banner--inline"><Icon name="alert" size={15} /> {error} <Btn size="sm" onClick={() => void load()}>Retry</Btn></div>
  if (!report) return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }} aria-busy="true">{[0, 1, 2, 3].map(i => <Card key={i} style={{ padding: 16, height: 84 }}><Skeleton width="50%" /><Skeleton width="30%" height={24} style={{ marginTop: 10 }} /></Card>)}</div>
  if (report.completed === 0 && report.partial === 0) return <EmptyState title="Nothing to summarise yet." body="Once responses arrive, this shows how many finish, how long they take and what people chose." testId="summary-empty" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, opacity: loading ? .7 : 1, transition: 'opacity .12s' }} data-testid="summary-view">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }} role="list" aria-label="Headline numbers">
        <Stat label="Completed" value={report.completed.toLocaleString()} testId="stat-completed" />
        <Stat label="Completion rate" value={report.completionRate === null ? '—' : `${Math.round(report.completionRate * 100)}%`} sub={`${report.partial.toLocaleString()} left partway`} testId="stat-rate" />
        <Stat label="Median time" value={report.medianDurationMs ? formatDuration(report.medianDurationMs) : '—'} testId="stat-median" />
        <Stat label="Last response" value={report.lastResponseAt ? relativeTime(report.lastResponseAt) : '—'} sub={report.spam ? `${report.spam} marked spam` : undefined} testId="stat-last" />
      </div>
      <PerDay days={report.perDay} timezone={report.timezone} />
      {report.questions.map(q => <Question key={q.id} q={q} />)}
    </div>
  )
}

function Stat({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId?: string }) {
  return (
    <Card role="listitem" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }} data-testid={testId}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)' }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, color: 'var(--tx)' }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: 'var(--mut2)' }}>{sub}</span>}
    </Card>
  )
}

/** Completed responses per day: one series, so no legend — the title names it. A day is
 *  the calendar day in the form's time zone (Settings › Availability), and the title says which. */
function PerDay({ days, timezone }: { days: FormReport['perDay']; timezone: string }) {
  const [asTable, setAsTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...days.map(d => d.count))
  const total = days.reduce((n, d) => n + d.count, 0)
  const tick = max <= 4 ? max : Math.ceil(max / 2) * 2
  const PLOT = 120
  return (
    <Card style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="summary-per-day">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, flex: 1 }}>Completed responses per day <span style={{ fontWeight: 600, color: 'var(--tx2)' }}>· last 30 days · {total.toLocaleString()} in all</span></h3>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)' }} data-testid="per-day-zone">Days in {timezone.replace(/_/g, ' ')} time</span>
        <Btn size="sm" ghost onClick={() => setAsTable(t => !t)} testId="per-day-table">{asTable ? 'Show chart' : 'Show as table'}</Btn>
      </div>
      {asTable ? (
        <div className="fb-scroll" style={{ maxHeight: 260 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr><th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--tx2)' }}>Day</th><th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--tx2)' }}>Completed</th></tr></thead>
            <tbody>{[...days].reverse().map(d => <tr key={d.day} style={{ borderTop: '1px solid var(--line)' }}><td style={{ padding: '4px 8px' }}>{dayLabel(d.day)}</td><td style={{ padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.count}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 8 }}>
          <div style={{ position: 'relative', height: PLOT, fontSize: 11, color: 'var(--mut2)', fontVariantNumeric: 'tabular-nums' }} aria-hidden="true">
            <span style={{ position: 'absolute', right: 0, top: PLOT - (tick / Math.max(max, tick)) * PLOT - 7 }}>{tick}</span>
            <span style={{ position: 'absolute', right: 0, bottom: -7 }}>0</span>
          </div>
          <div style={{ position: 'relative' }}>
            <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: PLOT - (tick / Math.max(max, tick)) * PLOT, borderTop: '1px solid var(--line)' }} />
            <div className="fb-viz-cols" role="list" aria-label="Completed responses per day" style={{ position: 'relative', height: PLOT, display: 'grid', gridTemplateColumns: `repeat(${days.length}, 1fr)`, gap: 2, borderBottom: '1px solid var(--line2)' }} onPointerLeave={() => setHover(null)}>
              {days.map((d, i) => (
                <div key={d.day} role="listitem" tabIndex={0} className="fb-viz-col" data-zero={d.count === 0 ? 'true' : undefined} aria-label={`${dayLabel(d.day)}: ${d.count} completed`}
                  onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} data-testid="per-day-col">
                  <span className="fb-viz-mark" style={{ height: d.count ? Math.max(3, (d.count / Math.max(max, tick)) * PLOT) : 0 }} />
                </div>
              ))}
            </div>
            {hover !== null && days[hover] && (
              <div role="status" style={{ position: 'absolute', top: -6, left: `${((hover + .5) / days.length) * 100}%`, transform: `translate(${hover > days.length * .7 ? '-100%' : hover < days.length * .3 ? '0' : '-50%'}, -100%)`, padding: '6px 9px', border: '1.5px solid var(--ink)', borderRadius: 8, background: 'var(--card)', boxShadow: 'var(--el-2)', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 2 }} data-testid="per-day-tooltip">
                <strong style={{ fontSize: 14 }}>{days[hover].count}</strong> <span style={{ fontSize: 12, color: 'var(--tx2)' }}>completed · {dayLabel(days[hover].day)}</span>
              </div>
            )}
            <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--mut2)', marginTop: 6 }}>
              <span>{dayLabel(days[0]?.day ?? '')}</span><span>{dayLabel(days[Math.floor(days.length / 2)]?.day ?? '')}</span><span>{dayLabel(days[days.length - 1]?.day ?? '')}</span>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

function Question({ q }: { q: QuestionSummary }) {
  const header = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, flex: 1, textWrap: 'pretty' } as React.CSSProperties}>{q.label}</h3>
      <span style={{ fontSize: 12.5, color: 'var(--tx2)', whiteSpace: 'nowrap' }}>{q.answered.toLocaleString()} answered</span>
    </div>
  )
  return (
    <Card style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="summary-question" data-kind={q.kind}>
      {header}
      {q.kind === 'options' && <Options q={q} />}
      {q.kind === 'numbers' && <Numbers q={q} />}
      {q.kind === 'text' && (q.samples.length ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }} aria-label="Latest answers">
          {q.samples.map((s, i) => <li key={i} style={{ padding: '7px 10px', borderRadius: 8, background: 'var(--inset)', fontSize: 13, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{s}</li>)}
          {q.answered > q.samples.length && <li style={{ fontSize: 12, color: 'var(--mut2)' }}>The latest {q.samples.length} of {q.answered.toLocaleString()}. Every answer is in the table.</li>}
        </ul>
      ) : <span style={{ fontSize: 13, color: 'var(--mut2)' }}>No answers yet.</span>)}
      {q.kind === 'count' && <span style={{ fontSize: 13, color: 'var(--tx2)' }}>Read these answers in the table — they don’t add up into a chart.</span>}
    </Card>
  )
}

/** One bar per option, in the form's own order; count and share at the tip. */
function Options({ q }: { q: Extract<QuestionSummary, { kind: 'options' }> }) {
  const max = Math.max(1, ...q.options.map(o => o.count))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} role="list" aria-label={`${q.label}: answers`}>
      {q.options.map(o => {
        const share = pct(o.count, q.answered)
        return (
          <div key={o.id} role="listitem" style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 32%) 1fr', gap: 12, alignItems: 'center' }} data-testid="summary-option">
            <span style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{o.label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {o.count > 0 && <span className="fb-viz-bar" style={{ width: `calc((100% - 96px) * ${(o.count / max).toFixed(4)})`, flex: 'none' }} aria-hidden="true" />}
              <span style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{o.count.toLocaleString()} <span style={{ fontWeight: 600, color: 'var(--tx2)' }}>· {share}%</span></span>
            </span>
          </div>
        )
      })}
      {q.multi && <span style={{ fontSize: 12, color: 'var(--mut2)' }}>People could pick several, so the shares add up to more than 100%.</span>}
    </div>
  )
}

function Numbers({ q }: { q: Extract<QuestionSummary, { kind: 'numbers' }> }) {
  const dist = q.distribution
  const max = dist ? Math.max(1, ...dist.map(d => d.count)) : 1
  const [hover, setHover] = useState<number | null>(null)
  const avgText = useMemo(() => (q.average === null ? '—' : q.average.toLocaleString(undefined, { maximumFractionDigits: 2 })), [q.average])
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 12, color: 'var(--tx2)', fontWeight: 700 }}>Average</span><span style={{ fontSize: 24, fontWeight: 800 }} data-testid="summary-average">{avgText}</span></div>
        {!dist && <>
          <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 12, color: 'var(--tx2)', fontWeight: 700 }}>Lowest</span><span style={{ fontSize: 24, fontWeight: 800 }}>{q.min ?? '—'}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 12, color: 'var(--tx2)', fontWeight: 700 }}>Highest</span><span style={{ fontSize: 24, fontWeight: 800 }}>{q.max ?? '—'}</span></div>
        </>}
      </div>
      {dist && (
        <div style={{ flex: 1, minWidth: 220, maxWidth: 420 }}>
          <div className="fb-viz-cols" role="list" aria-label={`${q.label}: how many chose each value`} style={{ height: 80, display: 'grid', gridTemplateColumns: `repeat(${dist.length}, 1fr)`, gap: 2, borderBottom: '1px solid var(--line2)', position: 'relative' }} onPointerLeave={() => setHover(null)}>
            {dist.map((d, i) => (
              <div key={d.value} role="listitem" tabIndex={0} className="fb-viz-col" data-zero={d.count === 0 ? 'true' : undefined} aria-label={`${d.value}: ${d.count}`} onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} style={{ position: 'relative' }}>
                <span className="fb-viz-mark" style={{ height: d.count ? Math.max(3, (d.count / max) * 64) : 0, maxWidth: 24 }} />
                {hover === i && <span role="status" style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translate(-50%, -4px)', padding: '4px 8px', border: '1.5px solid var(--ink)', borderRadius: 7, background: 'var(--card)', boxShadow: 'var(--el-1)', fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2 }}><strong>{d.count}</strong> <span style={{ color: 'var(--tx2)' }}>chose {d.value}</span></span>}
              </div>
            ))}
          </div>
          <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: `repeat(${dist.length}, 1fr)`, gap: 2, fontSize: 11, color: 'var(--mut2)', textAlign: 'center', marginTop: 4 }}>
            {dist.map(d => <span key={d.value}>{d.value}</span>)}
          </div>
        </div>
      )}
      {dist && <Tag tone="plain">{q.answered} rated</Tag>}
    </div>
  )
}
