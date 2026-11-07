// The Flow view: a read-only graph generated from pages, endings and rules.
// Pages sit in a row in order; endings stack at the right. Default edges are
// ink, rule edges are gold and dashed and carry the rule number. Pure so the
// layout is testable; the component only draws what comes out of here.

import { answerPages, isConditionalPage, sourcePageOf, shortCondition, type FormDefinition, componentDef } from '@/lib/forms-core/index'

export interface FlowNode { id: string; kind: 'page' | 'ending'; name: string; sub: string; x: number; y: number; w: number; h: number; cond: boolean; redirect: boolean; n: number; tag: string }
export interface FlowEdge { id: string; d: string; lx: number; ly: number; label: string; cond: boolean; ruleId: string | null }
export interface FlowLayout { nodes: FlowNode[]; edges: FlowEdge[]; width: number; height: number }

const W = 188, H = 68, GX = 236, X0 = 32, Y0 = 130

function curve(a: FlowNode, b: FlowNode, lift = 0) {
  const x1 = a.x + a.w, y1 = a.y + a.h / 2 - lift * 0.15, x2 = b.x, y2 = b.y + b.h / 2
  const c = lift ? `C ${x1 + 60} ${y1 - lift}, ${x2 - 60} ${y2 - lift}, ${x2} ${y2}` : `C ${x1 + 50} ${y1}, ${x2 - 50} ${y2}, ${x2} ${y2}`
  return { d: `M ${x1} ${y1} ${c}`, lx: (x1 + x2) / 2, ly: (y1 + y2) / 2 - lift * 0.78 - 8 }
}

export function flowLayout(def: FormDefinition): FlowLayout {
  const pages = answerPages(def)
  const ends = def.endings
  const questions = (blocks: { type: string }[]) => blocks.filter(b => { try { return componentDef(b.type as never).kind === 'input' } catch { return false } }).length
  const nodes: FlowNode[] = pages.map((p, i) => ({
    id: p.id, kind: 'page', name: p.name, sub: `${questions(p.blocks)} question${questions(p.blocks) === 1 ? '' : 's'}`, x: X0 + i * GX, y: Y0, w: W, h: H,
    cond: isConditionalPage(def, p.id), redirect: false, n: i + 1, tag: `P${i + 1}`,
  }))
  const ex = X0 + pages.length * GX
  const endNodes: FlowNode[] = ends.map((e, j) => ({
    id: e.id, kind: 'ending', name: e.name, sub: e.kind === 'redirect' ? (e.redirectUrl || 'Redirect').replace(/^https?:\/\//, '') : e.kind === 'restart' ? 'Restart' : 'Message',
    x: ex, y: 36 + j * (H + 26), w: W, h: H, cond: false, redirect: e.kind === 'redirect', n: j + 1, tag: 'END',
  }))
  const all = [...nodes, ...endNodes]
  const at = (id: string) => all.find(n => n.id === id)
  const edges: FlowEdge[] = []
  const ruleNo = (id: string) => def.rules.findIndex(r => r.id === id) + 1

  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1]
    if (b.cond) {
      const rule = def.rules.find(r => (r.then.type === 'show_page' || r.then.type === 'skip_page') && r.then.target === b.id)
      edges.push({ id: `e${i}c`, ...curve(a, b), label: rule ? `${ruleNo(rule.id)} · ${shortCondition(def, rule)}` : 'conditional', cond: true, ruleId: rule?.id ?? null })
      const skip = nodes[i + 2] ?? endNodes[0]
      if (skip) edges.push({ id: `e${i}s`, ...curve(a, skip, 96), label: 'otherwise', cond: false, ruleId: null })
    } else edges.push({ id: `e${i}`, ...curve(a, b), label: '', cond: false, ruleId: null })
  }
  for (const r of def.rules) {
    if (r.then.type !== 'go_to_page' && r.then.type !== 'go_to_ending') continue
    const from = sourcePageOf(def, r)
    const a = from ? at(from.id) : nodes[nodes.length - 1]
    const b = at(r.then.target)
    if (!a || !b) continue
    if (r.then.type === 'go_to_ending' && a.id === nodes[nodes.length - 1]?.id) continue // drawn below with the default
    edges.push({ id: `r${r.id}`, ...curve(a, b, 72), label: `${ruleNo(r.id)} · ${shortCondition(def, r)}`, cond: true, ruleId: r.id })
  }
  const last = nodes[nodes.length - 1]
  if (last) {
    const targeted = new Set<string>()
    for (const r of def.rules.filter(x => x.then.type === 'go_to_ending')) {
      const t = at(r.then.target)
      if (!t) continue
      targeted.add(t.id)
      const from = sourcePageOf(def, r)
      if (from && from.id !== last.id) continue
      edges.push({ id: `x${r.id}`, ...curve(last, t), label: `${ruleNo(r.id)} · ${shortCondition(def, r)}`, cond: true, ruleId: r.id })
    }
    const def_ = endNodes.find(e => !targeted.has(e.id)) ?? endNodes[0]
    if (def_) edges.push({ id: 'xdef', ...curve(last, def_), label: def.rules.some(r => r.then.type === 'go_to_ending') ? 'otherwise' : '', cond: false, ruleId: null })
  }
  return { nodes: all, edges, width: ex + W + 40, height: Math.max(Y0 + H + 40, 36 + ends.length * (H + 26) + 20) }
}
