'use client'

// The canvas IS the form: it renders at the real theme, width and spacing,
// with editing chrome on top. Blocks edit inline; the ghost row, the insert
// "+" between rows and "/" are the three doors into the library.

import React, { useEffect, useRef, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { componentDef, isInputBlock, blockSettings, rowsOf, themeStyles, rulesUsingBlock, describeTemplate, answerPages, conversionTargets, type Block, type Page, type Ending } from '@/lib/forms-core/index'
import { INPUT_RENDERERS, DISPLAY_RENDERERS } from '../render/registry'
import { Icon } from '../ui/icons'
import { menuAnchor } from '../ui'
import { useBuilder } from './context'

function AutoGrow({ value, onChange, style, placeholder, ariaLabel, onKeyDown, testId }: { value: string; onChange: (v: string) => void; style: React.CSSProperties; placeholder: string; ariaLabel: string; onKeyDown?: (e: React.KeyboardEvent) => void; testId?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const el = ref.current; if (!el || 'fieldSizing' in el.style) return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }, [value])
  return <textarea ref={ref} aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)} rows={1} placeholder={placeholder} onKeyDown={onKeyDown} onClick={e => e.stopPropagation()} data-testid={testId}
    style={{ width: '100%', border: 0, background: 'transparent', padding: 0, margin: 0, resize: 'none', overflow: 'hidden', fieldSizing: 'content', textAlign: 'inherit', fontFamily: 'inherit', ...style } as React.CSSProperties} />
}

function BlockView({ block, containerId }: { block: Block; containerId: string }) {
  const api = useBuilder()
  const theme = api.def.theme
  const T = themeStyles(theme)
  const selected = api.sel === block.id
  const d = componentDef(block.type)
  const input = isInputBlock(block)
  const { setNodeRef: setDrop } = useDroppable({ id: `block:${block.id}`, data: { kind: 'block', blockId: block.id } })
  const { attributes, listeners, setNodeRef: setDrag, setActivatorNodeRef, isDragging } = useDraggable({ id: `drag:${block.id}`, data: { kind: 'block', blockId: block.id, label: block.label || d.label }, disabled: block.type === 'slot' })
  const over = api.dnd.over && 'zone' in api.dnd.over && api.dnd.over.id === block.id ? api.dnd.over.zone : null
  const rules = rulesUsingBlock(api.def, block.id)
  const showDesc = d.hasDescription && (block.description !== '' || (selected && api.descOpen.has(block.id)))
  const labelRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  useEffect(() => { if (api.focusId === block.id && labelRef.current) { labelRef.current.focus(); labelRef.current.select() } }, [api.focusId, block.id])
  const ring = [selected ? '0 0 0 2px var(--ink)' : '', over === 'top' ? 'inset 0 3px 0 var(--lime)' : over === 'bottom' ? 'inset 0 -3px 0 var(--lime)' : over === 'left' ? 'inset 3px 0 0 var(--lime)' : over === 'right' ? 'inset -3px 0 0 var(--lime)' : ''].filter(Boolean).join(',') || undefined
  const basis = block.width === 'full' ? '100%' : block.width === 'half' ? `calc(50% - ${T.gap / 2}px)` : `calc(33.333% - ${(2 * T.gap) / 3}px)`
  const onLabelKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); api.openLibrary(e.currentTarget as HTMLElement, { kind: 'after', blockId: block.id }, { returnFocus: e.currentTarget as HTMLElement }) }
    else if (e.key === 'Escape') { (e.currentTarget as HTMLElement).blur() }
  }
  const openMenu = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); api.select(block.id); api.blockMenu(block.id, { x: e.clientX, y: e.clientY }) }

  let body: React.ReactNode
  if (block.type === 'slot') {
    body = <button type="button" onClick={e => { e.stopPropagation(); api.openLibrary(e.currentTarget, { kind: 'slot', slotId: block.id }, { returnFocus: e.currentTarget }) }} data-testid="slot-fill"
      style={{ height: 74, border: '2px dashed var(--ink)', borderRadius: theme.radius, background: 'transparent', color: 'var(--tx)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font-body)', width: '100%' }}><Icon name="plus" size={14} /> Add field to column</button>
  } else if (block.type === 'hidden') {
    const s = blockSettings<{ paramName: string; defaultValue: string }>(block)
    body = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1.5px dashed var(--line2)', borderRadius: 8, background: 'var(--inset)', color: 'var(--tx2)', fontFamily: 'var(--font-body)' }}>
        <Icon name="eye-off" size={15} />
        <input ref={labelRef as React.RefObject<HTMLInputElement>} aria-label="Hidden field name" value={block.label} onChange={e => api.updateBlock(block.id, { label: e.target.value }, true)} onKeyDown={onLabelKey} onClick={e => e.stopPropagation()} placeholder="Hidden field" style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', padding: 0, font: 'inherit', fontWeight: 800, color: 'var(--tx)' }} />
        <span className="fb-mono" style={{ fontSize: 11.5 }}>?{s.paramName || 'param'}=</span>
        <span style={{ fontSize: 11.5, fontWeight: 700 }}>Not shown to respondents</span>
      </div>
    )
  } else if (!input) {
    const D = DISPLAY_RENDERERS[block.type]
    body = D ? <D block={block} theme={theme} T={T} mode="edit" device="desktop" text={block.label} description={block.description} edit={{ onLabel: v => api.updateBlock(block.id, { label: v }, true), onDescription: v => api.updateBlock(block.id, { description: v }, true), selected, onKeyDown: onLabelKey }} /> : null
  } else {
    const R = INPUT_RENDERERS[block.type]
    body = (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* The label wraps like it does for respondents (QA 2026-10-15: long questions were cut off).
              A transparent mirror of the text sizes the grid cell, the textarea sits on top of it, and the
              mirror's visible star lands right after the last word, as the public form draws it. */}
          <div style={{ display: 'grid', minWidth: 0, fontSize: 15, fontWeight: 800, lineHeight: 1.4 }}>
            <span aria-hidden="true" style={{ gridArea: '1 / 1', color: 'transparent', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', pointerEvents: 'none' }}>
              {block.label || 'Question'}{block.required && <>{' '}<span title="Required" data-required-mark="" style={{ color: theme.star || theme.text }}>*</span></>}
            </span>
            <textarea ref={labelRef as React.RefObject<HTMLTextAreaElement>} aria-label="Question label" rows={1} value={block.label} data-value={block.label}
              onChange={e => api.updateBlock(block.id, { label: e.target.value.replace(/\s*\n\s*/g, ' ') }, true)}
              onKeyDown={e => { if (e.key === 'Enter' && e.shiftKey) e.preventDefault(); onLabelKey(e) }} onClick={e => e.stopPropagation()} placeholder="Question" data-testid="block-label"
              style={{ gridArea: '1 / 1', alignSelf: 'stretch', width: '100%', height: 'auto', minHeight: 0, minWidth: 0, border: 0, background: 'transparent', padding: 0, margin: 0, resize: 'none', overflow: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit', color: theme.text, textAlign: 'inherit', display: 'block' }} />
          </div>
          {showDesc && <input aria-label="Description" value={block.description} onChange={e => api.updateBlock(block.id, { description: e.target.value }, true)} onClick={e => e.stopPropagation()} placeholder="Add a description" data-testid="block-description"
            style={{ width: '100%', border: 0, background: 'transparent', padding: 0, margin: 0, fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.5, color: theme.muted, textAlign: 'inherit' }} />}
          {(block.label.includes('{{') || block.description.includes('{{')) && <span style={{ fontSize: 11.5, color: 'var(--mut2)', fontFamily: 'var(--font-body)' }}>Shows as: {describeTemplate(block.label, api.def)}{block.description.includes('{{') ? ` — ${describeTemplate(block.description, api.def)}` : ''}</span>}
        </div>
        {R && <R block={block} value={undefined} onChange={() => undefined} invalid={false} inputId={`in-${block.id}`} labelId={`lb-${block.id}`} theme={theme} T={T} mode="edit" device="desktop"
          edit={{ selected, onOptionLabel: (i, v) => api.optionLabel(block.id, i, v), onOptionAdd: i => api.optionAdd(block.id, i), onOptionRemove: i => api.optionRemove(block.id, i), onOptionImage: block.type === 'picture' ? i => api.optionImage(block.id, i) : undefined }} />}
      </>
    )
  }

  return (
    <div ref={el => { setDrop(el); setDrag(el) }} className={['fb-block', api.justAdded === block.id ? 'fb-rise' : ''].join(' ')} data-block={block.id} data-selected={selected} data-testid="block" data-type={block.type}
      onClick={e => { e.stopPropagation(); if (!selected) api.select(block.id) }} onFocusCapture={() => { if (!selected && block.type !== 'slot') api.select(block.id) }} onContextMenu={openMenu}
      style={{ flex: `1 1 ${basis}`, minWidth: block.width === 'full' ? '100%' : 160, boxShadow: ring, padding: 8, margin: -8, opacity: isDragging ? .4 : 1, cursor: 'pointer' }}>
      {selected && block.type !== 'slot' && (
        <>
          <span ref={setActivatorNodeRef} {...listeners} {...attributes} aria-label="Drag to move" title="Drag to move" data-testid="block-grip" role="button"
            style={{ position: 'absolute', left: -26, top: 6, width: 20, height: 28, display: 'grid', placeItems: 'center', color: 'var(--ink)', cursor: 'grab', borderRadius: 6, background: 'var(--card)', border: '1.5px solid var(--ink)', boxShadow: '1px 1px 0 var(--ink)', touchAction: 'none' }}><Icon name="grip" size={14} /></span>
          <div role="toolbar" aria-label="Field actions" className="fb-pop" data-testid="block-toolbar" onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', right: 0, top: -38, display: 'flex', alignItems: 'center', gap: 2, padding: 3, border: '2px solid var(--ink)', borderRadius: 9, background: 'var(--card)', boxShadow: 'var(--el-1)', fontFamily: 'var(--font-body)', color: 'var(--tx)', zIndex: 3 }}>
            {conversionTargets(block.type).length > 0
              ? <button type="button" className="fb-toolbtn" aria-haspopup="menu" aria-label={`Field type: ${d.label}. Change type`} title="Change type" onClick={e => api.typeMenu(block.id, menuAnchor(e.currentTarget), e.currentTarget)} data-testid="toolbar-type"
                  style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}><Icon name={d.icon} size={13} /> {d.label} <Icon name="chevron-down" size={12} /></button>
              : <span style={{ fontSize: 11, fontWeight: 700, padding: '0 8px 0 6px', color: 'var(--tx2)', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}><Icon name={d.icon} size={13} /> {d.label}</span>}
            {input && <button type="button" className="fb-toolbtn" aria-pressed={block.required} onClick={() => api.toggleRequired(block.id)} data-testid="toolbar-required">Required</button>}
            <button type="button" className="fb-toolbtn" aria-label="Duplicate" title="Duplicate ⌘D" onClick={() => api.duplicateBlock(block.id)} data-testid="toolbar-duplicate"><Icon name="copy" size={14} /></button>
            <button type="button" className="fb-toolbtn" aria-label="More" title="More" onClick={e => api.blockMenu(block.id, menuAnchor(e.currentTarget), e.currentTarget)} data-testid="toolbar-more"><Icon name="ellipsis" size={14} /></button>
            <button type="button" className="fb-toolbtn fb-toolbtn--danger" aria-label="Delete" title="Delete ⌫" onClick={() => api.deleteBlock(block.id)} data-testid="toolbar-delete"><Icon name="trash" size={14} /></button>
          </div>
        </>
      )}
      {body}
      {rules.length > 0 && input && (
        <button type="button" onClick={e => { e.stopPropagation(); api.setLogicFilter(block.id); api.setTab('logic') }} title={`${rules.length} rule${rules.length === 1 ? '' : 's'} use this field`} aria-label={`${rules.length} rule${rules.length === 1 ? '' : 's'} use this field`} data-testid="logic-badge"
          style={{ position: 'absolute', left: -26, bottom: 6, width: 20, height: 20, border: '1.5px solid var(--ink)', borderRadius: 6, background: 'var(--gold)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', cursor: 'pointer', opacity: selected ? 1 : .85 }}><Icon name="branch" size={12} /></button>
      )}
    </div>
  )
}

function InsertLine({ containerId, index, gap }: { containerId: string; index: number; gap: number }) {
  const api = useBuilder()
  const half = Math.round(gap / 2)
  return (
    <div role="button" tabIndex={0} aria-label="Add a field here" className="fb-insert" data-testid="insert-line" style={{ marginTop: -(half + 7), marginBottom: half - 7 }}
      onClick={e => { e.stopPropagation(); api.openLibrary(e.currentTarget, { kind: 'index', containerId, index }, { returnFocus: e.currentTarget, displayOnly: api.curKind === 'ending' }) }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); api.openLibrary(e.currentTarget, { kind: 'index', containerId, index }, { returnFocus: e.currentTarget, displayOnly: api.curKind === 'ending' }) } }}>
      <span className="fb-insert__dot" data-testid="insert-dot"><Icon name="plus" size={13} /></span>
    </div>
  )
}

function GhostRow({ containerId, empty, displayOnly }: { containerId: string; empty: boolean; displayOnly: boolean }) {
  const api = useBuilder()
  const theme = api.def.theme
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { setNodeRef, isOver } = useDroppable({ id: `ghost:${containerId}`, data: { kind: 'ghost', containerId } })
  useEffect(() => { if (api.ghostFocusTick) inputRef.current?.focus() }, [api.ghostFocusTick])
  const over = isOver || (api.dnd.over && 'targetId' in api.dnd.over && api.dnd.over.id === 'ghost' && api.dnd.over.targetId === containerId)
  const commit = () => {
    const label = text.trim()
    if (!label) return
    api.addBlock(displayOnly ? { type: 'paragraph' } : { type: 'short' }, { kind: 'end', containerId }, { label })
    setText('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }
  return (
    <div ref={setNodeRef} style={{ display: 'flex', flexDirection: 'column', gap: 10 }} onClick={e => e.stopPropagation()}>
      <div className="fb-ghost" style={{ boxShadow: over ? 'inset 0 0 0 2px var(--lime)' : 'none' }} data-testid="ghost-row">
        <button type="button" className="fb-ghost__plus" aria-label="Add a field" data-testid="ghost-plus" onClick={e => api.openLibrary(e.currentTarget, { kind: 'end', containerId }, { returnFocus: inputRef.current, displayOnly })}><Icon name="plus" size={14} /></button>
        <input ref={inputRef} aria-label={displayOnly ? 'Add text' : 'Add a question'} value={text} data-testid="ghost-input"
          onChange={e => { const v = e.target.value; if (v === '/') { api.openLibrary(e.currentTarget, { kind: 'end', containerId }, { returnFocus: e.currentTarget, displayOnly }); setText(''); return } setText(v) }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } else if (e.key === 'Escape') { setText(''); (e.currentTarget as HTMLElement).blur() } }}
          placeholder={displayOnly ? 'Add a line of text, or type / for content' : empty ? 'Ask a question…' : 'Ask another question, or type / for fields'}
          style={{ flex: 1, minWidth: 0, height: 40, border: 0, background: 'transparent', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, color: theme.text, padding: 0 }} />
        {text.trim() && <span style={{ fontSize: 12, color: theme.muted, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>Enter adds {displayOnly ? 'a paragraph' : 'a short answer'} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '0 5px', border: `1.5px solid ${theme.line}`, borderRadius: 4 }}>↵</span></span>}
      </div>
      {empty && !displayOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingLeft: 38 }} data-testid="quick-add">
          {([['short', 'Short answer', 'type'], ['email', 'Email', 'mail'], ['choice', 'Multiple choice', 'circle-dot'], ['heading', 'Heading', 'heading']] as const).map(([type, label, icon]) => (
            <button key={type} type="button" className="fb-quick" onClick={() => api.addBlock({ type }, { kind: 'end', containerId }, { focus: true })} data-testid={`quick-${type}`}><Icon name={icon} size={14} /> {label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// The selected field's toolbar floats 38px above its 8px hover box. Where the gap to the
// field above is narrower than that, the selected row is pushed down just enough that the
// toolbar sits in clear space instead of covering the field above (QA 2026-10-15).
const TOOLBAR_CLEARANCE = 48

function Rows({ blocks, containerId, reserveFirst = false }: { blocks: Block[]; containerId: string; reserveFirst?: boolean }) {
  const api = useBuilder()
  const T = themeStyles(api.def.theme)
  const rows = rowsOf(blocks)
  const lift = Math.max(0, TOOLBAR_CLEARANCE - T.gap)
  let index = 0
  return (
    <>
      {rows.map((row, r) => {
        const start = index
        index += row.blocks.length
        return (
          <div key={row.id} style={{ display: 'flex', flexDirection: 'column' }}>
            <InsertLine containerId={containerId} index={start} gap={T.gap} />
            <div style={{ display: 'flex', gap: T.gap, flexWrap: 'wrap', paddingTop: (r > 0 || reserveFirst) && row.blocks.some(b => b.id === api.sel && b.type !== 'slot') ? lift : 0, transition: 'padding-top var(--dur-fast)' }}>
              {row.blocks.map(b => <BlockView key={b.id} block={b} containerId={containerId} />)}
            </div>
          </div>
        )
      })}
    </>
  )
}

function PageCanvas({ page }: { page: Page }) {
  const api = useBuilder()
  const theme = api.def.theme
  const T = themeStyles(theme)
  const pages = answerPages(api.def)
  const idx = pages.findIndex(p => p.id === page.id)
  const isLast = idx === pages.length - 1
  const empty = page.blocks.length === 0
  const cover = page.kind === 'cover'
  const label = page.buttonLabel || (cover ? 'Start' : isLast ? 'Submit' : 'Continue')
  const next = cover ? pages[0] : pages[idx + 1]
  const target = next ?? api.def.endings[0]
  return (
    <section key={page.id} className="fb-page-fwd" aria-label={page.name} data-testid="canvas-page" style={{ ...T.container, padding: T.pad, display: 'flex', flexDirection: 'column', gap: T.gap, textAlign: theme.align }}>
      {empty && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 0 4px' }}>
          <h2 style={{ margin: 0, fontFamily: T.headFont, fontSize: 26, fontWeight: 800, letterSpacing: '-.01em', color: theme.text }}>{cover ? 'A cover page.' : 'Your form starts here.'}</h2>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: theme.muted }}>{cover ? 'Say what this form is for. Respondents press Start to begin.' : <>Ask a question below and press Enter. Type <span style={{ fontFamily: 'var(--font-mono)', padding: '0 5px', border: `1.5px solid ${theme.line}`, borderRadius: 4 }}>/</span> for every field type, or drag one in from the left.</>}</p>
        </div>
      )}
      <Rows blocks={page.blocks} containerId={page.id} />
      <GhostRow containerId={page.id} empty={empty} displayOnly={cover} />
      {(!empty || cover) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 6, justifyContent: theme.align === 'center' ? 'center' : 'flex-start' }} onClick={e => e.stopPropagation()}>
          {!cover && idx > 0 && <button type="button" onClick={() => api.goTo(pages[idx - 1].id)} style={{ height: 44, padding: '0 14px', border: '2px solid transparent', borderRadius: theme.radius, background: 'transparent', color: theme.muted, fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="arrow-left" size={15} /> Back</button>}
          <button type="button" onClick={() => target && api.goTo(target.id)} data-testid="canvas-continue" style={{ height: 44, padding: '0 22px', fontFamily: 'inherit', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, ...T.button }}>{label} <Icon name="arrow-right" size={16} /></button>
        </div>
      )}
    </section>
  )
}

function EndingCanvas({ ending }: { ending: Ending }) {
  const api = useBuilder()
  const theme = api.def.theme
  const T = themeStyles(theme)
  const align = theme.align === 'center' ? 'center' : 'flex-start'
  return (
    <section key={ending.id} className="fb-page-fwd" aria-label={ending.name} data-testid="canvas-ending" style={{ ...T.container, padding: T.pad, display: 'flex', flexDirection: 'column', gap: 16, textAlign: theme.align }}>
      {ending.kind === 'redirect' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: align }} onClick={e => e.stopPropagation()}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 28, padding: '0 10px', border: '2px solid var(--ink)', borderRadius: 8, background: 'var(--gold-bg)', color: 'var(--gold-tx)', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 800 }}><Icon name="external" size={13} /> Redirect ending</span>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: theme.muted }}>Respondents who reach this ending are sent straight to:</p>
          <input aria-label="Redirect URL" value={ending.redirectUrl} onChange={e => api.updateEnding(ending.id, { redirectUrl: e.target.value }, true)} placeholder="https://" data-testid="ending-redirect-url" style={{ height: 44, width: '100%', padding: '0 14px', fontFamily: 'var(--font-mono)', fontSize: 14, ...T.input }} />
          <p style={{ margin: 0, fontSize: 12.5, color: theme.muted }}>Answers are saved before the redirect. Respondents see &quot;Taking you to {(() => { try { return new URL(ending.redirectUrl).host } catch { return 'your site' } })()}…&quot; for a moment first.</p>
        </div>
      ) : (
        <>
          <span aria-hidden="true" className="fb-pop" style={{ width: 56, height: 56, border: `2px solid ${theme.line}`, borderRadius: 16, background: theme.primary, color: T.onPrimary, display: 'grid', placeItems: 'center', alignSelf: align }}><Icon name="check" size={28} /></span>
          <AutoGrow ariaLabel="Ending title" value={ending.title} onChange={v => api.updateEnding(ending.id, { title: v }, true)} placeholder="Thanks, we got it." testId="ending-title" style={{ fontFamily: T.headFont, fontSize: 30, fontWeight: 800, letterSpacing: '-.015em', lineHeight: 1.15, color: theme.text }} />
          <AutoGrow ariaLabel="Ending message" value={ending.body} onChange={v => api.updateEnding(ending.id, { body: v }, true)} placeholder="Tell people what happens next." testId="ending-body" style={{ fontSize: 15, lineHeight: 1.6, color: theme.muted }} />
          {(ending.title.includes('{{') || ending.body.includes('{{')) && <span style={{ fontSize: 11.5, color: 'var(--mut2)', fontFamily: 'var(--font-body)' }}>Shows as: {describeTemplate(ending.title, api.def)}{ending.body.includes('{{') ? ` — ${describeTemplate(ending.body, api.def)}` : ''}</span>}
          {ending.blocks.length > 0 && <Rows blocks={ending.blocks} containerId={ending.id} reserveFirst />}
          <GhostRow containerId={ending.id} empty={false} displayOnly />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: theme.align === 'center' ? 'center' : 'flex-start' }} onClick={e => e.stopPropagation()}>
            {ending.kind === 'restart'
              ? <span style={{ height: 44, padding: '0 22px', fontFamily: 'inherit', fontSize: 15, fontWeight: 800, display: 'inline-flex', alignItems: 'center', ...T.button }}>{ending.buttonLabel || 'Start again'}</span>
              : <input aria-label="Button label" value={ending.buttonLabel} onChange={e => api.updateEnding(ending.id, { buttonLabel: e.target.value }, true)} placeholder="Button label (optional)" data-testid="ending-button-label" style={{ height: 44, padding: '0 22px', fontFamily: 'inherit', fontSize: 15, fontWeight: 800, width: 240, textAlign: 'inherit', ...T.button }} />}
            {ending.kind === 'message' && ending.buttonLabel && !ending.buttonUrl && <span style={{ fontSize: 12, color: 'var(--mut2)', fontFamily: 'var(--font-body)' }}>Add the button&apos;s link in the settings panel.</span>}
          </div>
        </>
      )}
    </section>
  )
}

export default function Canvas() {
  const api = useBuilder()
  const theme = api.def.theme
  const T = themeStyles(theme)
  const pages = answerPages(api.def)
  const idx = api.curPage ? pages.findIndex(p => p.id === api.curPage!.id) : -1
  const showProgress = api.def.settings.progress !== 'none' && pages.length > 1 && api.curKind === 'page' && api.curPage?.kind !== 'cover'
  const pct = pages.length ? Math.round(((Math.max(0, idx) + 1) / (pages.length + 1)) * 100) : 0
  // A press that starts on a field never deselects, even when selecting it moves the field
  // (the toolbar clearance above) and the release lands just outside it.
  const downOnBlock = useRef(false)
  return (
    <div data-canvas="" data-runner-scroll="" className="fb-scroll" onPointerDown={e => { downOnBlock.current = !!(e.target as HTMLElement).closest('.fb-block') }} onClick={() => { if (downOnBlock.current) { downOnBlock.current = false; return } api.select(null) }} style={{ flex: 1, minHeight: 0, background: theme.bg, backgroundImage: T.bgImage, backgroundSize: '22px 22px', padding: '60px 24px 64px' }}>
      <div style={{ margin: '0 auto', maxWidth: theme.width, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: T.font, color: theme.text }}>
        {(showProgress || (theme.logo && api.curKind === 'page')) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px' }}>
            {theme.logo && (theme.logoUrl ? <img src={theme.logoUrl} alt="" style={{ height: 28, maxWidth: 120, objectFit: 'contain' }} /> : <span aria-label="Logo placeholder" style={{ width: 28, height: 28, borderRadius: 8, background: theme.line, color: theme.bg, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15 }}>+</span>)}
            {showProgress && api.def.settings.progress === 'stages' ? (
              <span style={{ fontSize: 12, fontWeight: 700, color: theme.muted }}>{api.curPage?.stage.trim() ? `Stage: ${api.curPage.stage}` : 'Name each page’s stage in the settings panel'}</span>
            ) : showProgress ? (
              <>
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.muted }}>Page {Math.max(0, idx) + 1} of {pages.length}</span>
                {api.def.settings.progress === 'bar' && <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Form progress" style={{ flex: 1, height: 8, border: `1.5px solid ${theme.line}`, borderRadius: 6, background: theme.content, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: theme.primary, transition: 'width .36s cubic-bezier(.32,.72,0,1)' }} /></div>}
              </>
            ) : null}
          </div>
        )}
        {api.curPage && <PageCanvas page={api.curPage} />}
        {api.curEnding && <EndingCanvas ending={api.curEnding} />}
        {/* Sits on the form background, so it takes the theme's muted text (as the public footer does), not portal grey. */}
        <p style={{ margin: 0, textAlign: 'center', fontSize: 12, fontWeight: 600, color: theme.muted, fontFamily: 'var(--font-body)' }}>Made with GRYD Forms</p>
      </div>
    </div>
  )
}
