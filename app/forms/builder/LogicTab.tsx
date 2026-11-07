'use client'

// Logic: sentence rules with slots (Rules) and a generated graph (Flow).
// Pages run in order on their own; rules only describe the exceptions.
// A broken rule (deleted field or target) stays, marked coral, until fixed.

import React from 'react'
import { componentDef, ruleSentence, checkRules, OP_LABELS, ACTION_LABELS, isGroup, shortId, type Rule, type Condition, type ConditionGroup, type ConditionOp, type ActionType, type Block } from '@/lib/forms-core/index'
import { Btn, Seg, Tag, EmptyState, Banner } from '../ui'
import { Icon } from '../ui/icons'
import { useBuilder } from './context'
import { logicFields, targetsFor, defaultOp, defaultValueFor, editConditionItem, ACTION_TARGET_KIND } from './ops'
import { flowLayout } from './flow'

const sel: React.CSSProperties = { height: 36, border: '2px solid var(--ink)', borderRadius: 9, background: 'var(--input)', padding: '0 28px 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--tx)', minWidth: 0, width: '100%', appearance: 'none', backgroundImage: 'linear-gradient(45deg, transparent 50%, var(--tx) 50%), linear-gradient(135deg, var(--tx) 50%, transparent 50%)', backgroundPosition: 'calc(100% - 15px) 15px, calc(100% - 10px) 15px', backgroundSize: '5px 5px', backgroundRepeat: 'no-repeat' }
const inp: React.CSSProperties = { height: 36, border: '2px solid var(--ink)', borderRadius: 9, background: 'var(--input)', padding: '0 10px', fontSize: 13, fontWeight: 600, color: 'var(--tx)', minWidth: 0, width: '100%' }

function ValueSlot({ block, cond, onChange }: { block: Block | null; cond: Condition; onChange: (v: Condition['value']) => void }) {
  if (!block || cond.op === 'empty' || cond.op === 'not_empty' || cond.op === 'is_true' || cond.op === 'is_false') return <span style={{ fontSize: 12, color: 'var(--mut2)', alignSelf: 'center' }}>—</span>
  const kind = componentDef(block.type).logic.valueKind
  if (cond.op === 'in' || cond.op === 'not_in') {
    const arr = Array.isArray(cond.value) ? cond.value : []
    if (kind === 'option' || kind === 'options') return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', minHeight: 36, padding: '4px 6px', border: '2px solid var(--ink)', borderRadius: 9, background: 'var(--input)' }} role="group" aria-label="Values">
        {block.options.map(o => { const on = arr.includes(o.id); return <button key={o.id} type="button" aria-pressed={on} onClick={() => onChange(on ? arr.filter(x => x !== o.id) : [...arr, o.id])} style={{ height: 24, padding: '0 8px', border: `1.5px solid ${on ? 'var(--ink)' : 'var(--line2)'}`, borderRadius: 6, background: on ? 'var(--gold)' : 'transparent', color: 'var(--tx)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{o.label || 'Untitled'}</button> })}
      </div>
    )
    return <input aria-label="Values" value={arr.join(', ')} onChange={e => onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="a, b, c" style={inp} />
  }
  if (kind === 'option' || kind === 'options') return <select aria-label="Value" value={typeof cond.value === 'string' ? cond.value : ''} onChange={e => onChange(e.target.value)} style={sel}>{!block.options.some(o => o.id === cond.value) && <option value="">Choose…</option>}{block.options.map(o => <option key={o.id} value={o.id}>{o.label || 'Untitled'}</option>)}</select>
  if (kind === 'number') return <input aria-label="Value" type="number" value={typeof cond.value === 'number' ? cond.value : ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} style={inp} />
  if (kind === 'date') return <input aria-label="Value" type="date" value={typeof cond.value === 'string' ? cond.value : ''} onChange={e => onChange(e.target.value)} style={inp} />
  if (kind === 'boolean') return <select aria-label="Value" value={cond.value === false ? 'false' : 'true'} onChange={e => onChange(e.target.value === 'true')} style={sel}><option value="true">Yes</option><option value="false">No</option></select>
  return <input aria-label="Value" value={typeof cond.value === 'string' ? cond.value : cond.value == null ? '' : String(cond.value)} onChange={e => onChange(e.target.value)} style={inp} />
}

function ConditionRow({ cond, rule, fields, issueFor }: { cond: Condition; rule: Rule; fields: Block[]; issueFor: (id: string) => string | null }) {
  const api = useBuilder()
  const block = fields.find(f => f.id === cond.field) ?? null
  const broken = !block
  const ops = block ? componentDef(block.type).logic.ops : (['eq', 'neq', 'empty', 'not_empty'] as ConditionOp[])
  const issue = issueFor(cond.id)
  const edit = (fn: (c: Condition) => void, typing = false) => api.updateRule(rule.id, r => { editConditionItem(r.when, cond.id, it => { if (!isGroup(it)) fn(it) }) }, typing)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) 28px', gap: 8 }}>
        <select aria-label="Field" value={broken ? '' : cond.field} data-testid="cond-field" onChange={e => edit(c => { const b = fields.find(f => f.id === e.target.value) ?? null; c.field = e.target.value; const op = componentDef(b!.type).logic.ops.includes(c.op) ? c.op : defaultOp(b); c.op = op; c.value = defaultValueFor(b, op) })}
          style={{ ...sel, borderColor: broken ? 'var(--coral)' : 'var(--ink)', background: broken ? 'var(--coral-bg)' : 'var(--input)', color: broken ? 'var(--coral-tx)' : 'var(--tx)' }}>
          {broken && <option value="">Field deleted</option>}
          {fields.map(f => <option key={f.id} value={f.id}>{f.label || componentDef(f.type).label}</option>)}
        </select>
        <select aria-label="Operator" value={cond.op} onChange={e => edit(c => { c.op = e.target.value as ConditionOp; c.value = defaultValueFor(block, c.op) })} style={sel} data-testid="cond-op">{ops.map(op => <option key={op} value={op}>{OP_LABELS[op]}</option>)}</select>
        <ValueSlot block={block} cond={cond} onChange={v => edit(c => { c.value = v }, true)} />
        <button type="button" aria-label="Remove condition" onClick={() => api.updateRule(rule.id, r => { editConditionItem(r.when, cond.id, (_it, parent, i) => parent.items.splice(i, 1)) })} className="fb-iconbtn fb-iconbtn--sm" style={{ width: 28, height: 36, color: 'var(--mut2)' }}><Icon name="x" size={14} /></button>
      </div>
      {issue && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral-tx)', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="alert" size={12} /> {issue}</span>}
    </div>
  )
}

function GroupRows({ group, rule, fields, depth, issueFor }: { group: ConditionGroup; rule: Rule; fields: Block[]; depth: number; issueFor: (id: string) => string | null }) {
  const api = useBuilder()
  const toggleJoin = () => api.updateRule(rule.id, r => { if (r.when.id === group.id) r.when.join = r.when.join === 'and' ? 'or' : 'and'; else editConditionItem(r.when, group.id, it => { if (isGroup(it)) it.join = it.join === 'and' ? 'or' : 'and' }) })
  const addCond = () => api.updateRule(rule.id, r => { const target = r.when.id === group.id ? r.when : null; const c = { id: shortId('c'), field: fields[0]?.id ?? '', op: defaultOp(fields[0] ?? null), value: defaultValueFor(fields[0] ?? null, defaultOp(fields[0] ?? null)) }; if (target) target.items.push(c); else editConditionItem(r.when, group.id, it => { if (isGroup(it)) it.items.push(c) }) })
  const addGroup = () => api.updateRule(rule.id, r => { r.when.items.push({ id: shortId('c'), join: r.when.join === 'and' ? 'or' : 'and', items: [{ id: shortId('c'), field: fields[0]?.id ?? '', op: defaultOp(fields[0] ?? null), value: defaultValueFor(fields[0] ?? null, defaultOp(fields[0] ?? null)) }] }) })
  const joinLabel = group.join === 'and' ? 'AND' : 'OR'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {group.items.map((it, i) => (
        <div key={it.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {i > 0 && <button type="button" onClick={toggleJoin} title="Click to switch" data-testid="join-toggle" style={{ alignSelf: 'flex-start', height: 24, padding: '0 10px', border: '1.5px solid var(--ink)', borderRadius: 6, background: 'var(--paper)', fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', cursor: 'pointer', color: 'var(--tx)' }}>{joinLabel}</button>}
          {isGroup(it) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', border: '1.5px dashed var(--ink)', borderRadius: 10, background: 'var(--inset)' }} data-testid="cond-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="fb-caps" style={{ fontSize: 11, letterSpacing: '.08em' }}>{it.join === 'or' ? 'any of these' : 'all of these'}</span><span style={{ flex: 1 }} /><button type="button" aria-label="Remove group" className="fb-iconbtn fb-iconbtn--xs" onClick={() => api.updateRule(rule.id, r => { editConditionItem(r.when, it.id, (_x, parent, idx) => parent.items.splice(idx, 1)) })}><Icon name="x" size={13} /></button></div>
              {depth < 1 ? <GroupRows group={it} rule={rule} fields={fields} depth={depth + 1} issueFor={issueFor} /> : null}
            </div>
          ) : <ConditionRow cond={it} rule={rule} fields={fields} issueFor={issueFor} />}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <Btn dashed size="sm" icon="plus" onClick={addCond} testId="add-condition">{group.join} condition</Btn>
        {depth === 0 && <Btn dashed size="sm" icon="plus" onClick={addGroup} style={{ borderColor: 'var(--line2)', color: 'var(--tx2)' }} testId="add-group">group</Btn>}
      </div>
    </div>
  )
}

function RuleCard({ rule, n }: { rule: Rule; n: number }) {
  const api = useBuilder()
  const fields = logicFields(api.def)
  const issues = checkRules(api.def).filter(i => i.ruleId === rule.id)
  const issueFor = (id: string) => issues.find(i => i.conditionId === id)?.message ?? null
  const ruleIssues = issues.filter(i => !i.conditionId)
  const targets = targetsFor(api.def, rule.then.type)
  const targetMissing = !targets.some(t => t.value === rule.then.target)
  const broken = issues.length > 0
  return (
    <article data-testid="rule-card" data-rule-id={rule.id} data-broken={broken || undefined} style={{ border: `2px solid ${broken ? 'var(--coral)' : 'var(--ink)'}`, borderRadius: 14, background: 'var(--card)', boxShadow: broken ? '4px 5px 0 var(--coral)' : 'var(--el-3)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <p style={{ margin: 0, flex: 1, fontSize: 14, lineHeight: 1.5, color: 'var(--tx2)' }} data-testid="rule-sentence"><span className="fb-mono" style={{ fontSize: 10.5, color: 'var(--mut2)', marginRight: 8 }}>{n}</span>{ruleSentence(api.def, rule)}</p>
        {broken && <Tag tone="coral">Needs attention</Tag>}
        <button type="button" className="fb-iconbtn fb-iconbtn--sm" aria-label="Move rule up" onClick={() => api.moveRule(rule.id, -1)}><Icon name="arrow-up" size={14} /></button>
        <button type="button" className="fb-iconbtn fb-iconbtn--sm" aria-label="Move rule down" onClick={() => api.moveRule(rule.id, 1)}><Icon name="arrow-down" size={14} /></button>
        <button type="button" className="fb-iconbtn fb-iconbtn--sm fb-iconbtn--danger" aria-label="Delete rule" onClick={() => api.deleteRule(rule.id)} data-testid="rule-delete"><Icon name="trash" size={14} /></button>
      </div>
      {ruleIssues.map(i => <span key={i.kind} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--coral-tx)', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="alert" size={13} /> {i.message}</span>)}
      <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: '10px 12px', alignItems: 'start' }}>
        <span style={{ height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--ink)', borderRadius: 8, background: 'var(--gold)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 800, letterSpacing: '.1em' }}>WHEN</span>
        <GroupRows group={rule.when} rule={rule} fields={fields} depth={0} issueFor={issueFor} />
        <span style={{ height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--ink)', borderRadius: 8, background: 'var(--lime)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 800, letterSpacing: '.1em' }}>THEN</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.8fr)', gap: 8, maxWidth: 520 }}>
          <select aria-label="Action" value={rule.then.type} data-testid="rule-action" onChange={e => api.updateRule(rule.id, r => { const type = e.target.value as ActionType; const sameKind = ACTION_TARGET_KIND[type] === ACTION_TARGET_KIND[r.then.type]; r.then.type = type; if (!sameKind) r.then.target = targetsFor(api.def, type)[0]?.value ?? '' })} style={sel}>
            {(Object.keys(ACTION_LABELS) as ActionType[]).map(a => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
          </select>
          <select aria-label="Target" value={targetMissing ? '' : rule.then.target} data-testid="rule-target" onChange={e => api.updateRule(rule.id, r => { r.then.target = e.target.value })} style={{ ...sel, borderColor: targetMissing ? 'var(--coral)' : 'var(--ink)', background: targetMissing ? 'var(--coral-bg)' : 'var(--input)', color: targetMissing ? 'var(--coral-tx)' : 'var(--tx)' }}>
            {targetMissing && <option value="">{ACTION_TARGET_KIND[rule.then.type] === 'ending' ? 'Ending deleted' : ACTION_TARGET_KIND[rule.then.type] === 'page' ? 'Page deleted' : 'Field deleted'}</option>}
            {targets.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {rule.then.type === 'set_value' && <input aria-label="Value to set" value={typeof rule.then.value === 'string' || typeof rule.then.value === 'number' ? String(rule.then.value) : ''} onChange={e => api.updateRule(rule.id, r => { r.then.value = e.target.value }, true)} placeholder="Value" style={{ ...inp, gridColumn: '1 / -1' }} />}
        </div>
      </div>
    </article>
  )
}

function FlowView() {
  const api = useBuilder()
  const flow = flowLayout(api.def)
  return (
    <>
      <div style={{ border: '2px solid var(--ink)', borderRadius: 14, background: 'var(--card)', boxShadow: 'var(--el-3)', overflow: 'auto', position: 'relative', backgroundImage: 'radial-gradient(var(--line2) 1px, transparent 1px)', backgroundSize: '18px 18px', maxHeight: 'calc(100vh - 260px)' }} data-testid="flow-view">
        <div style={{ position: 'relative', width: flow.width, height: flow.height, margin: '0 auto' }}>
          <svg aria-hidden="true" width={flow.width} height={flow.height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            {flow.edges.map(e => <path key={e.id} d={e.d} fill="none" stroke={e.cond ? 'var(--gold)' : 'var(--ink)'} strokeWidth={3} strokeLinecap="round" strokeDasharray={e.cond ? '6 6' : undefined} />)}
          </svg>
          {flow.edges.filter(e => e.label).map(e => <span key={`l${e.id}`} style={{ position: 'absolute', left: e.lx, top: e.ly, transform: 'translate(-50%, -50%)', padding: '2px 8px', border: '1.5px solid var(--ink)', borderRadius: 6, background: e.cond ? 'var(--gold)' : 'var(--card)', color: e.cond ? 'var(--on-accent)' : 'var(--tx)', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', boxShadow: '1.5px 1.5px 0 var(--ink)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.label}</span>)}
          {flow.nodes.map(n => (
            <button key={n.id} type="button" className="fb-flow-node" onClick={() => api.goTo(n.id)} data-testid={`flow-node-${n.kind}`}
              style={{ position: 'absolute', left: n.x, top: n.y, width: n.w, height: n.h, border: '2px solid var(--ink)', borderRadius: 11, background: n.kind === 'ending' ? (n.redirect ? 'var(--gold-bg)' : 'var(--lime-bg)') : 'var(--card)', boxShadow: 'var(--el-2)', padding: '10px 12px', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 3, color: 'var(--tx)', transition: 'transform .12s, box-shadow .12s' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, lineHeight: 1.2 }}><span className="fb-mono" style={{ fontSize: 10, color: 'var(--mut2)' }}>{n.tag}</span><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</span>{n.cond && <span style={{ color: 'var(--gold-tx)', display: 'grid', placeItems: 'center' }}><Icon name="branch" size={13} /></span>}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.sub}</span>
            </button>
          ))}
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--tx2)', maxWidth: 720 }}>Solid lines are the default path. Gold labels are rules; “otherwise” shows where people go when a rule doesn&apos;t match. Click any page to edit it.</p>
    </>
  )
}

export default function LogicTab() {
  const api = useBuilder()
  const [view, setView] = React.useState<'rules' | 'flow'>('rules')
  const rules = api.def.rules
  const filterBlock = api.logicFilter ? api.def.pages.flatMap(p => p.blocks).find(b => b.id === api.logicFilter) ?? null : null
  const shown = filterBlock ? rules.filter(r => r.id === api.lastRuleId || JSON.stringify(r.when).includes(`"${filterBlock.id}"`) || r.then.target === filterBlock.id) : rules
  return (
    <div className="fb-scroll fb-rise" style={{ flex: 1, minHeight: 0, padding: '66px 32px 48px', display: 'flex', justifyContent: 'center' }} data-testid="logic-tab">
      <div style={{ width: '100%', maxWidth: 880, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <h1 className="fb-h1">Logic</h1>
          <Seg value={view} options={[{ value: 'rules', label: 'Rules' }, { value: 'flow', label: 'Flow' }]} onChange={setView} label="Logic view" role="tablist" />
          <div style={{ flex: 1 }} />
          <Btn icon="plus" onClick={() => api.addRule(filterBlock ? { fieldId: filterBlock.id } : undefined)} testId="add-rule">Add rule</Btn>
        </div>
        <span style={{ fontSize: 13, color: 'var(--tx2)' }}>Pages run in order on their own. Rules only describe the exceptions.</span>
      </div>
      {view === 'rules' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {api.brokenRules.length > 0 && <Banner tone="coral" inline icon="alert" role="alert">{api.brokenRules.length === 1 ? '1 rule needs attention' : `${api.brokenRules.length} rules need attention`} before this form can be published.</Banner>}
          {filterBlock && <Banner tone="gold" inline icon="branch" action={<Btn size="sm" onClick={() => api.setLogicFilter(null)}>Show all</Btn>}>Showing rules that use “{filterBlock.label || componentDef(filterBlock.type).label}”.</Banner>}
          {shown.map(r => <RuleCard key={r.id} rule={r} n={rules.indexOf(r) + 1} />)}
          {rules.length === 0 && <EmptyState title="No rules. Every respondent sees every page in order and reaches the default ending." body="Add a rule to skip a page, show a field, or send some people to a different ending." action={<Btn icon="plus" onClick={() => api.addRule()}>Add rule</Btn>} testId="logic-empty" />}
          {rules.length > 0 && shown.length === 0 && <EmptyState title="No rules use this field yet." action={<Btn icon="plus" onClick={() => api.addRule({ fieldId: filterBlock?.id })}>Add rule</Btn>} />}
        </div>
      ) : <FlowView />}
      </div>
    </div>
  )
}
