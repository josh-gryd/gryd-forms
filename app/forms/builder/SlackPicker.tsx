'use client'

// Where a form posts in Slack: a channel the Slack app can see, or a person (a direct
// message). The list comes from the connected workspace; typing narrows it.

import { useEffect, useId, useRef, useState } from 'react'
import { formsApi, type SlackOption, type SlackTarget } from '@/lib/forms/api'
import { Btn, Input } from '../ui'
import { Icon } from '../ui/icons'

export default function SlackPicker({ value, onPick }: { value: SlackTarget | null; onPick: (t: SlackTarget) => void }) {
  const [changing, setChanging] = useState(false)
  const searching = changing || !value
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ options: SlackOption[]; unavailable?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!searching) return
    let cancelled = false
    setLoading(true)
    const t = window.setTimeout(() => {
      formsApi.slackTargets(q)
        .then(r => { if (!cancelled) { setFound(r); setActive(0) } })
        .catch((err: Error) => { if (!cancelled) setFound({ options: [], unavailable: err.message }) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, q ? 180 : 0)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [q, searching])

  const pick = (o: SlackOption) => { onPick({ kind: o.kind, id: o.id, label: o.label }); setChanging(false); setQ('') }

  if (!searching && value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} data-testid="slack-target">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', border: '2px solid var(--ink)', borderRadius: 9, background: 'var(--input)', fontSize: 13.5, fontWeight: 700 }}>
          <Icon name={value.kind === 'channel' ? 'hash' : 'users'} size={14} />
          <span data-testid="slack-target-label">{value.kind === 'channel' ? value.label.replace(/^#/, '') : value.label}</span>
        </span>
        <Btn size="sm" onClick={() => { setChanging(true); window.setTimeout(() => input.current?.focus(), 0) }} testId="slack-target-change">Change</Btn>
      </div>
    )
  }

  const options = found?.options ?? []
  const channels = options.filter(o => o.kind === 'channel')
  const people = options.filter(o => o.kind === 'user')
  const ordered = [...channels, ...people]
  const row = (o: SlackOption) => {
    const i = ordered.indexOf(o)
    return (
      <li key={o.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} onMouseDown={e => e.preventDefault()} onClick={() => pick(o)} onMouseEnter={() => setActive(i)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: i === active ? 'var(--inset)' : 'transparent' }} data-testid="slack-option">
        <Icon name={o.kind === 'channel' ? 'hash' : 'users'} size={13} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.kind === 'channel' ? o.label.replace(/^#/, '') : o.label}</span>
        {o.sub && <span style={{ fontWeight: 600, color: 'var(--mut2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.sub}</span>}
      </li>
    )
  }
  const group = (title: string, list: SlackOption[]) => list.length > 0 && (
    <>
      <li role="presentation" className="fb-caps fb-caps--tx2" style={{ padding: '8px 10px 4px' }}>{title}</li>
      {list.map(row)}
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Search channels and people" aria-label="Slack channel or person"
          role="combobox" aria-expanded aria-controls={listId} aria-autocomplete="list" aria-activedescendant={ordered.length ? `${listId}-${active}` : undefined}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, ordered.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
            else if (e.key === 'Enter') { e.preventDefault(); if (ordered[active]) pick(ordered[active]) }
            else if (e.key === 'Escape' && value) { e.preventDefault(); setChanging(false); setQ('') }
          }} data-testid="slack-search" />
        {value && <Btn ghost onClick={() => { setChanging(false); setQ('') }}>Cancel</Btn>}
      </div>
      <ul id={listId} role="listbox" aria-label="Channels and people" style={{ listStyle: 'none', margin: 0, padding: 4, maxHeight: 240, overflow: 'auto', border: '2px solid var(--ink)', borderRadius: 9, background: 'var(--card)' }} data-testid="slack-options">
        {found?.unavailable && !options.length
          ? <li role="presentation" style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--tx2)' }} data-testid="slack-unavailable">{found.unavailable}</li>
          : !found || (loading && !options.length)
            ? <li role="presentation" style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--mut2)' }}>Loading Slack…</li>
            : !options.length
              ? <li role="presentation" style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--mut2)' }}>Nothing in Slack matches “{q}”. A private channel shows up once the Slack app is in it.</li>
              : <>{group('Channels', channels)}{group('People', people)}</>}
      </ul>
    </div>
  )
}
