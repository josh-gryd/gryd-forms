// Document operations for the builder. Every function takes a definition and
// returns a new one (the input is never mutated), so the caller can push the
// previous document onto the undo stack and hand the new one to autosave.
// Identity rules from schema.ts hold throughout: a move or a width change
// never changes an id, and a duplicate always mints fresh ids.

import {
  cloneDefinition, cloneBlock, clonePage, cloneEnding, newBlock, newPage, newCoverPage, newEnding, shortId, componentDef, isGroup, answerPages,
  type FormDefinition, type Block, type BlockWidth, type Page, type Ending, type Rule, type Condition, type ConditionGroup, type ConditionOp, type ActionType, type ComponentType,
} from '@/lib/forms-core/index'

export type Zone = 'top' | 'bottom' | 'left' | 'right'

export interface BlockLoc { containerId: string; kind: 'page' | 'ending'; index: number; block: Block; blocks: Block[] }

function container(def: FormDefinition, containerId: string): { kind: 'page' | 'ending'; blocks: Block[] } | null {
  const page = def.pages.find(p => p.id === containerId)
  if (page) return { kind: 'page', blocks: page.blocks }
  const ending = def.endings.find(e => e.id === containerId)
  if (ending) return { kind: 'ending', blocks: ending.blocks }
  return null
}

export function containerBlocks(def: FormDefinition, containerId: string): Block[] | null {
  return container(def, containerId)?.blocks ?? null
}

export function locate(def: FormDefinition, blockId: string): BlockLoc | null {
  for (const p of def.pages) {
    const i = p.blocks.findIndex(b => b.id === blockId)
    if (i >= 0) return { containerId: p.id, kind: 'page', index: i, block: p.blocks[i], blocks: p.blocks }
  }
  for (const e of def.endings) {
    const i = e.blocks.findIndex(b => b.id === blockId)
    if (i >= 0) return { containerId: e.id, kind: 'ending', index: i, block: e.blocks[i], blocks: e.blocks }
  }
  return null
}

// ── Blocks ───────────────────────────────────────────────────────────────────

export function insertBlock(def: FormDefinition, containerId: string, index: number, block: Block): FormDefinition {
  const next = cloneDefinition(def)
  const c = container(next, containerId)
  if (!c) return def
  const i = Math.max(0, Math.min(index, c.blocks.length))
  c.blocks.splice(i, 0, block)
  return next
}

export function appendBlock(def: FormDefinition, containerId: string, block: Block): FormDefinition {
  const c = container(def, containerId)
  return c ? insertBlock(def, containerId, c.blocks.length, block) : def
}

export function updateBlock(def: FormDefinition, blockId: string, patch: Partial<Block> | ((b: Block) => void)): FormDefinition {
  const next = cloneDefinition(def)
  const loc = locate(next, blockId)
  if (!loc) return def
  if (typeof patch === 'function') patch(loc.block)
  else Object.assign(loc.block, patch)
  return next
}

export function removeBlock(def: FormDefinition, blockId: string): FormDefinition {
  const next = cloneDefinition(def)
  const loc = locate(next, blockId)
  if (!loc) return def
  loc.blocks.splice(loc.index, 1)
  return next
}

/** Put a block back exactly where it was (undo of a delete without a snapshot). */
export function restoreBlock(def: FormDefinition, containerId: string, index: number, block: Block): FormDefinition {
  return insertBlock(def, containerId, index, block)
}

export function duplicateBlock(def: FormDefinition, blockId: string): { def: FormDefinition; id: string } | null {
  const loc = locate(def, blockId)
  if (!loc) return null
  const copy = cloneBlock(loc.block)
  return { def: insertBlock(def, loc.containerId, loc.index + 1, copy), id: copy.id }
}

export function setBlockWidth(def: FormDefinition, blockId: string, width: BlockWidth): FormDefinition {
  return updateBlock(def, blockId, { width })
}

/** Move a block to `index` within `containerId` (index counted after the block is lifted out). */
export function moveBlock(def: FormDefinition, blockId: string, containerId: string, index: number, width?: BlockWidth): FormDefinition {
  const next = cloneDefinition(def)
  const loc = locate(next, blockId)
  if (!loc) return def
  const [moving] = loc.blocks.splice(loc.index, 1)
  const c = container(next, containerId)
  if (!c) return def
  if (width) moving.width = width
  c.blocks.splice(Math.max(0, Math.min(index, c.blocks.length)), 0, moving)
  return next
}

export function moveBlockBy(def: FormDefinition, blockId: string, dir: -1 | 1): FormDefinition {
  const loc = locate(def, blockId)
  if (!loc) return def
  const to = loc.index + dir
  if (to < 0 || to >= loc.blocks.length) return def
  return moveBlock(def, blockId, loc.containerId, to)
}

export function moveBlockToContainer(def: FormDefinition, blockId: string, containerId: string): FormDefinition {
  const c = container(def, containerId)
  if (!c) return def
  const loc = locate(def, blockId)
  if (!loc) return def
  const end = loc.containerId === containerId ? c.blocks.length - 1 : c.blocks.length
  return moveBlock(def, blockId, containerId, end)
}

/**
 * Drop an existing block (or a new one) on a target block. Side drops build
 * columns: a full-width target becomes half and the moved block takes the
 * target's width. Top/bottom drops place before/after at the target's width.
 */
export function dropBlock(def: FormDefinition, moving: { blockId: string } | { block: Block }, targetId: string, zone: Zone): { def: FormDefinition; id: string } | null {
  const next = cloneDefinition(def)
  let block: Block
  if ('blockId' in moving) {
    if (moving.blockId === targetId) return null
    const loc = locate(next, moving.blockId)
    if (!loc) return null
    block = loc.blocks.splice(loc.index, 1)[0]
  } else block = moving.block
  const t = locate(next, targetId)
  if (!t) return null
  if (zone === 'left' || zone === 'right') {
    if (t.block.width === 'full') t.block.width = 'half'
    block.width = t.block.width
    t.blocks.splice(zone === 'left' ? t.index : t.index + 1, 0, block)
  } else {
    block.width = t.block.width
    t.blocks.splice(zone === 'top' ? t.index : t.index + 1, 0, block)
  }
  return { def: next, id: block.id }
}

/** Two / three empty column slots the author fills from the menu. */
export function insertColumns(def: FormDefinition, containerId: string, index: number, n: 2 | 3): { def: FormDefinition; ids: string[] } {
  const width: BlockWidth = n === 2 ? 'half' : 'third'
  const slots = Array.from({ length: n }, () => newBlock('slot', { width }))
  let next = def
  slots.forEach((s, i) => { next = insertBlock(next, containerId, index + i, s) })
  return { def: next, ids: slots.map(s => s.id) }
}

/** Fill a column slot: the new block takes the slot's place and width. */
export function fillSlot(def: FormDefinition, slotId: string, block: Block): FormDefinition {
  const next = cloneDefinition(def)
  const loc = locate(next, slotId)
  if (!loc || loc.block.type !== 'slot') return def
  block.width = loc.block.width
  loc.blocks.splice(loc.index, 1, block)
  return next
}

/** Options edited as text (one per line). Ids survive renames and reorders
 *  where the label still matches, so answers and rules keep pointing at the
 *  same option; genuinely new lines get new ids. */
export function setOptionsFromText(def: FormDefinition, blockId: string, text: string): FormDefinition {
  return updateBlock(def, blockId, b => {
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean)
    const unused = b.options.slice()
    const out: Block['options'] = []
    lines.forEach((label, i) => {
      const byLabel = unused.findIndex(o => o.label === label)
      if (byLabel >= 0) { out.push({ ...unused[byLabel], label }); unused.splice(byLabel, 1); return }
      const same = b.options[i]
      if (same && unused.includes(same)) { out.push({ ...same, label }); unused.splice(unused.indexOf(same), 1); return }
      out.push({ id: shortId('o'), label })
    })
    b.options = out
  })
}

export function setOptionLabel(def: FormDefinition, blockId: string, index: number, label: string): FormDefinition {
  return updateBlock(def, blockId, b => { if (b.options[index]) b.options[index] = { ...b.options[index], label } })
}

export function addOption(def: FormDefinition, blockId: string, afterIndex?: number): { def: FormDefinition; id: string } {
  const id = shortId('o')
  return { id, def: updateBlock(def, blockId, b => {
    const at = afterIndex === undefined ? b.options.length : afterIndex + 1
    b.options.splice(at, 0, { id, label: '' })
  }) }
}

export function removeOption(def: FormDefinition, blockId: string, index: number): FormDefinition {
  return updateBlock(def, blockId, b => { if (b.options.length > 1) b.options.splice(index, 1) })
}

// ── Pages ────────────────────────────────────────────────────────────────────

export function addPage(def: FormDefinition): { def: FormDefinition; id: string } {
  const next = cloneDefinition(def)
  const page = newPage(next.pages.filter(p => p.kind === 'page').length + 1)
  next.pages.push(page)
  return { def: next, id: page.id }
}

export function addCoverPage(def: FormDefinition): { def: FormDefinition; id: string } | null {
  if (def.pages.some(p => p.kind === 'cover')) return null
  const next = cloneDefinition(def)
  const page = newCoverPage()
  next.pages.unshift(page)
  return { def: next, id: page.id }
}

export function updatePage(def: FormDefinition, pageId: string, patch: Partial<Page>): FormDefinition {
  const next = cloneDefinition(def)
  const p = next.pages.find(x => x.id === pageId)
  if (!p) return def
  Object.assign(p, patch)
  return next
}

export function duplicatePage(def: FormDefinition, pageId: string): { def: FormDefinition; id: string } | null {
  const i = def.pages.findIndex(p => p.id === pageId)
  if (i < 0) return null
  const next = cloneDefinition(def)
  const copy = clonePage(next.pages[i])
  next.pages.splice(i + 1, 0, copy)
  return { def: next, id: copy.id }
}

export function movePage(def: FormDefinition, pageId: string, toIndex: number): FormDefinition {
  const i = def.pages.findIndex(p => p.id === pageId)
  if (i < 0) return def
  const next = cloneDefinition(def)
  const [p] = next.pages.splice(i, 1)
  next.pages.splice(Math.max(0, Math.min(toIndex, next.pages.length)), 0, p)
  return next
}

export function movePageBy(def: FormDefinition, pageId: string, dir: -1 | 1): FormDefinition {
  const i = def.pages.findIndex(p => p.id === pageId)
  if (i < 0) return def
  const to = i + dir
  if (to < 0 || to >= def.pages.length) return def
  return movePage(def, pageId, to)
}

/** Null when it is the last answer page: a form needs at least one. */
export function deletePage(def: FormDefinition, pageId: string): { def: FormDefinition; removed: Page; index: number } | null {
  const i = def.pages.findIndex(p => p.id === pageId)
  if (i < 0) return null
  if (def.pages[i].kind === 'page' && answerPages(def).length <= 1) return null
  const next = cloneDefinition(def)
  const [removed] = next.pages.splice(i, 1)
  return { def: next, removed, index: i }
}

export function restorePage(def: FormDefinition, page: Page, index: number): FormDefinition {
  const next = cloneDefinition(def)
  next.pages.splice(Math.max(0, Math.min(index, next.pages.length)), 0, page)
  return next
}

// ── Endings ──────────────────────────────────────────────────────────────────

export function addEnding(def: FormDefinition): { def: FormDefinition; id: string } {
  const next = cloneDefinition(def)
  const e = newEnding(next.endings.length + 1)
  next.endings.push(e)
  return { def: next, id: e.id }
}

export function updateEnding(def: FormDefinition, endingId: string, patch: Partial<Ending>): FormDefinition {
  const next = cloneDefinition(def)
  const e = next.endings.find(x => x.id === endingId)
  if (!e) return def
  Object.assign(e, patch)
  return next
}

export function duplicateEnding(def: FormDefinition, endingId: string): { def: FormDefinition; id: string } | null {
  const i = def.endings.findIndex(e => e.id === endingId)
  if (i < 0) return null
  const next = cloneDefinition(def)
  const copy = cloneEnding(next.endings[i])
  next.endings.splice(i + 1, 0, copy)
  return { def: next, id: copy.id }
}

/** Removes the ending and every rule that targets it. Null for the last ending. */
export function deleteEnding(def: FormDefinition, endingId: string): { def: FormDefinition; removed: Ending; index: number; rulesRemoved: Rule[] } | null {
  const i = def.endings.findIndex(e => e.id === endingId)
  if (i < 0 || def.endings.length <= 1) return null
  const next = cloneDefinition(def)
  const [removed] = next.endings.splice(i, 1)
  const rulesRemoved = next.rules.filter(r => r.then.type === 'go_to_ending' && r.then.target === endingId)
  next.rules = next.rules.filter(r => !(r.then.type === 'go_to_ending' && r.then.target === endingId))
  return { def: next, removed, index: i, rulesRemoved }
}

// ── Rules ────────────────────────────────────────────────────────────────────

export const ACTION_TARGET_KIND: Record<ActionType, 'field' | 'section' | 'page' | 'ending'> = {
  show_field: 'field', hide_field: 'field', require_field: 'field', optional_field: 'field', set_value: 'field',
  show_section: 'section', hide_section: 'section',
  show_page: 'page', skip_page: 'page', go_to_page: 'page', go_to_ending: 'ending',
}

export function logicFields(def: FormDefinition): Block[] {
  return def.pages.flatMap(p => p.blocks).filter(b => componentDef(b.type).kind === 'input' && componentDef(b.type).logic.ops.length > 0)
}

export function defaultOp(block: Block | null): ConditionOp {
  if (!block) return 'eq'
  const ops = componentDef(block.type).logic.ops
  return ops.includes('eq') ? 'eq' : ops.includes('contains') ? 'contains' : ops.includes('is_true') ? 'is_true' : ops[0] ?? 'not_empty'
}

export function defaultValueFor(block: Block | null, op: ConditionOp): Condition['value'] {
  if (!block) return ''
  if (op === 'empty' || op === 'not_empty' || op === 'is_true' || op === 'is_false') return null
  const kind = componentDef(block.type).logic.valueKind
  if (op === 'in' || op === 'not_in') return []
  if (kind === 'option' || kind === 'options') return block.options[0]?.id ?? ''
  if (kind === 'number') return 0
  if (kind === 'boolean') return true
  return ''
}

export function newCondition(def: FormDefinition, fieldId?: string): Condition {
  const fields = logicFields(def)
  const block = (fieldId && fields.find(b => b.id === fieldId)) || fields[0] || null
  const op = defaultOp(block)
  return { id: shortId('c'), field: block?.id ?? '', op, value: defaultValueFor(block, op) }
}

export function newRule(def: FormDefinition, opts: { fieldId?: string; action?: ActionType; target?: string } = {}): Rule {
  // A one-page form has nothing to show or skip, so its natural first rule picks an ending.
  const action = opts.action ?? (answerPages(def).length > 1 ? 'show_page' : 'go_to_ending')
  const kind = ACTION_TARGET_KIND[action]
  const target = opts.target ?? (kind === 'page' ? (answerPages(def)[1] ?? answerPages(def)[0])?.id ?? '' : kind === 'ending' ? def.endings[0]?.id ?? '' : kind === 'section' ? def.pages.flatMap(p => p.blocks).find(b => b.type === 'section')?.id ?? '' : logicFields(def)[0]?.id ?? '')
  return { id: shortId('r'), when: { id: shortId('c'), join: 'and', items: [newCondition(def, opts.fieldId)] }, then: { type: action, target } }
}

export function addRule(def: FormDefinition, rule: Rule): FormDefinition {
  const next = cloneDefinition(def)
  next.rules.push(rule)
  return next
}

export function updateRule(def: FormDefinition, ruleId: string, fn: (r: Rule) => void): FormDefinition {
  const next = cloneDefinition(def)
  const r = next.rules.find(x => x.id === ruleId)
  if (!r) return def
  fn(r)
  return next
}

export function deleteRule(def: FormDefinition, ruleId: string): FormDefinition {
  const next = cloneDefinition(def)
  next.rules = next.rules.filter(r => r.id !== ruleId)
  return next
}

export function moveRule(def: FormDefinition, ruleId: string, dir: -1 | 1): FormDefinition {
  const i = def.rules.findIndex(r => r.id === ruleId)
  const to = i + dir
  if (i < 0 || to < 0 || to >= def.rules.length) return def
  const next = cloneDefinition(def)
  const [r] = next.rules.splice(i, 1)
  next.rules.splice(to, 0, r)
  return next
}

/** Walk a condition tree and apply `fn` to the item with `id`. */
export function editConditionItem(group: ConditionGroup, id: string, fn: (item: Condition | ConditionGroup, parent: ConditionGroup, index: number) => void): boolean {
  for (let i = 0; i < group.items.length; i++) {
    const it = group.items[i]
    if (it.id === id) { fn(it, group, i); return true }
    if (isGroup(it) && editConditionItem(it, id, fn)) return true
  }
  return false
}

export function targetsFor(def: FormDefinition, action: ActionType): Array<{ value: string; label: string }> {
  const kind = ACTION_TARGET_KIND[action]
  if (kind === 'page') return answerPages(def).map(p => ({ value: p.id, label: p.name }))
  if (kind === 'ending') return def.endings.map(e => ({ value: e.id, label: e.name }))
  if (kind === 'section') return def.pages.flatMap(p => p.blocks.filter(b => b.type === 'section')).map(b => ({ value: b.id, label: b.label || 'Section' }))
  return def.pages.flatMap(p => p.blocks.filter(b => componentDef(b.type).kind === 'input')).map(b => ({ value: b.id, label: b.label || componentDef(b.type).label }))
}

export const COMPONENT_LABEL = (type: ComponentType) => componentDef(type).label
