'use client'

// The builder: one document, one history, one save loop. Panels are
// presentational; every rule about selection, undo, autosave, conflicts,
// recovery, drag-and-drop and publishing lives here. It renders inside the
// portal shell like every other app: the band and the canvas fill the main
// column, the panels portal into the app sidebar (SidebarPanel).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, pointerWithin, rectIntersection, type DragStartEvent, type DragMoveEvent, type DragEndEvent, type CollisionDetection } from '@dnd-kit/core'
import {
  definitionHash, checkRules, newBlock, evaluate, answerPages, componentDef, conversionTargets, planConversion,
  type ComponentType, type ConversionPlan,
  type FormDefinition, type Block, type BlockWidth, type Page, type Ending, type Rule, type Theme, type FormSettings, type LogicIssue,
} from '@/lib/forms-core/index'
import { formsApi, formsChanged, ApiError, publicFormUrl, type FormDetail } from '@/lib/forms/api'
import { Btn, IconBtn, Seg, Tag, SaveState, Menu, Confirm, Banner, Skeleton, EmptyState, Stamp, useToast, useAnnounce, useMediaQuery, type MenuItem, type MenuAt, type SaveStateValue } from '../ui'
import { Icon } from '../ui/icons'
import { FormRunner } from '../render/FormRunner'
import type { Device } from '../render/registry'
import { SaveLoop, initialHistory, pushHistory, undo as undoHistory, redo as redoHistory, readLocalDraft, writeLocalDraft, clearLocalDraft, decideRecovery, type HistoryState, type SaveOutcome } from './store'
import * as ops from './ops'
import { BuilderCtx, type BuilderApi, type Tab, type SideTab, type InsertTarget, type LibraryPick, type LibraryMenuState, type DndState, type MutateOpts } from './context'
import SidebarPanel from './SidebarPanel'
import SectionBar from './SectionBar'
import SlashMenu from './SlashMenu'
import Canvas from './Canvas'
import PageStrip from './PageStrip'
import LogicTab from './LogicTab'
import ShareTab from './ShareTab'
import SettingsTab from './SettingsTab'
import { useNewDeploy } from './useNewDeploy'
import { usePhone } from '@/lib/phone/use-phone'
import PhoneFormDesk from './PhoneFormDesk'

const TABS: Tab[] = ['build', 'logic', 'theme', 'share', 'settings']
/** What the URL calls each tab: the words on the section bar. */
const TAB_PARAM: Partial<Record<Tab, string>> = { theme: 'design' }
const STATE_TAG: Record<FormDetail['publishState'], { label: string; tone: 'neutral' | 'lime' | 'gold' | 'coral' }> = { draft: { label: 'Draft', tone: 'neutral' }, live: { label: 'Live', tone: 'lime' }, dirty: { label: 'Unpublished edits', tone: 'gold' }, closed: { label: 'Closed', tone: 'coral' } }

type Conflict = Extract<SaveOutcome, { kind: 'conflict' }>

function zoneFor(rect: { left: number; top: number; width: number; height: number }, x: number, y: number): ops.Zone {
  const rx = (x - rect.left) / Math.max(1, rect.width), ry = (y - rect.top) / Math.max(1, rect.height)
  return rx < 0.22 ? 'left' : rx > 0.78 ? 'right' : ry < 0.5 ? 'top' : 'bottom'
}

const collision: CollisionDetection = args => {
  const within = pointerWithin(args)
  return within.length ? within : rectIntersection(args)
}

export default function Builder({ id, initialTab, initialPreview = false, build }: { id: string; initialTab?: Tab; initialPreview?: boolean; build?: string }) {
  const newDeploy = useNewDeploy(build)
  const [reloading, setReloading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const announce = useAnnounce()
  const [detail, setDetail] = useState<FormDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [def, setDefState] = useState<FormDefinition | null>(null)
  const defRef = useRef<FormDefinition | null>(null)
  const historyRef = useRef<HistoryState>(initialHistory())
  const [histTick, setHistTick] = useState(0)
  const loopRef = useRef<SaveLoop | null>(null)
  const [saveState, setSaveState] = useState<SaveStateValue>('saved')
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [recovery, setRecovery] = useState<{ def: FormDefinition; at: number } | null>(null)
  const [offline, setOffline] = useState(false)
  const [cur, setCur] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [tab, setTabState] = useState<Tab>(initialTab && TABS.includes(initialTab) ? initialTab : 'build')
  const [logicFilter, setLogicFilter] = useState<string | null>(null)
  const [lastRuleId, setLastRuleId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [library, setLibrary] = useState<LibraryMenuState | null>(null)
  const [menu, setMenu] = useState<{ at: MenuAt; items: MenuItem[]; returnFocusTo: HTMLElement | null } | null>(null)
  const [typeConfirm, setTypeConfirm] = useState<{ plan: ConversionPlan; from: string; to: string } | null>(null)
  const [dnd, setDnd] = useState<DndState>({ activeId: null, activeLabel: '', over: null })
  const [preview, setPreview] = useState(initialPreview)
  // ?preview=1 (Preview in the list's menu) opens once; leaving the preview drops it from the URL.
  useEffect(() => {
    if (preview) return
    const url = new URL(window.location.href)
    if (!url.searchParams.has('preview')) return
    url.searchParams.delete('preview')
    window.history.replaceState(null, '', url.toString())
  }, [preview])
  const [previewDevice, setPreviewDevice] = useState<Device>('desktop')
  const [previewRestart, setPreviewRestart] = useState(0)
  const [descOpen, setDescOpenState] = useState<Set<string>>(new Set())
  const [ghostFocusTick, setGhostFocusTick] = useState(0)
  const [stamp, setStamp] = useState(false)
  const [publishing, setPublishing] = useState(false)
  // The shell hides the app sidebar — and with it every builder panel — at
  // ≤999, so that is where the builder hands over to its read-only fallback.
  const narrow = useMediaQuery('(max-width: 1279px)')
  // The builder is desktop work (phone handoff §6); a phone gets the form's
  // status, link, responses and a preview instead (PhoneFormDesk).
  const phone = usePhone()
  const fallback = useMediaQuery('(max-width: 999px)')
  const [sideTab, setSideTabState] = useState<SideTab>('fields')
  const holdSideTab = useRef(false)
  const pointer = useRef({ x: 0, y: 0 })
  const dragData = useRef<{ kind: 'lib'; pick: LibraryPick; label: string } | { kind: 'block'; blockId: string; label: string } | { kind: 'pagetab'; pageId: string; index: number; label: string } | null>(null)

  // Selection drives the sidebar: pick a field and Field opens; deselect and
  // Fields is back. Page stays put until a field is picked.
  useEffect(() => {
    if (sel) { if (holdSideTab.current) holdSideTab.current = false; else setSideTabState('field') }
    else setSideTabState(t => (t === 'field' ? 'fields' : t))
  }, [sel])

  // ── Load ──────────────────────────────────────────────────────────────
  const applyDef = useCallback((next: FormDefinition) => { defRef.current = next; setDefState(next) }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const d = await formsApi.get(id)
        if (cancelled) return
        setDetail(d)
        const doc = { def: d.draft, revision: d.revision, savedHash: definitionHash(d.draft) }
        const loop = new SaveLoop(async (def, baseRevision) => {
          try {
            const r = await formsApi.saveDraft(id, def, baseRevision)
            // The list (All forms) shows publish state; it refreshes on this event.
            if (r.ok) formsChanged()
            if (r.ok) { setDetail(prev => (prev ? { ...prev, publishState: r.publishState, unpublishedChanges: r.unpublishedChanges, revision: r.revision, draftUpdatedAt: r.updatedAt, slug: r.slug ?? prev.slug } : prev)); return { kind: 'saved', revision: r.revision } }
            return { kind: 'conflict', revision: r.revision, def: r.definition, updatedBy: r.updatedBy, updatedAt: r.updatedAt }
          } catch (err) {
            const status = err instanceof ApiError ? err.status : 0
            return { kind: 'failed', message: (err as Error).message, offline: status === 0 || status === 502 || status === 503 || (typeof navigator !== 'undefined' && navigator.onLine === false) }
          }
        }, doc, l => {
          setSaveState(l.state)
          if (l.state === 'saved' && defRef.current && definitionHash(defRef.current) === l.savedHash) clearLocalDraft(localStorage, id)
        }, c => setConflict(c))
        loopRef.current = loop
        applyDef(d.draft)
        setCur(d.draft.pages[0]?.id ?? d.draft.endings[0]?.id ?? '')
        const decision = decideRecovery(readLocalDraft(localStorage, id), { revision: d.revision, def: d.draft })
        if (decision.kind === 'restore') {
          historyRef.current = pushHistory(historyRef.current, d.draft, false)
          applyDef(decision.def)
          loop.schedule(decision.def, 50)
          toast({ msg: 'Restored edits you made before the last save.' })
        } else if (decision.kind === 'conflict') setRecovery({ def: decision.local, at: decision.localAt })
      } catch (err) { if (!cancelled) setLoadError((err as Error).message) }
    })()
    // Leaving inside the app (no page hide) still saves what's pending, then stops.
    return () => { cancelled = true; const l = loopRef.current; void l?.flush(); l?.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => { if (def) document.title = `${def.title || 'Untitled form'} · Forms` }, [def])

  // Offline / flush on hide / warn on unload
  useEffect(() => {
    const on = () => { setOffline(false); loopRef.current?.retryNow() }
    const off = () => setOffline(true)
    setOffline(navigator.onLine === false)
    const hide = () => { if (document.visibilityState === 'hidden') void loopRef.current?.flush() }
    const unload = (e: BeforeUnloadEvent) => { if (loopRef.current?.hasPending()) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('online', on); window.addEventListener('offline', off); document.addEventListener('visibilitychange', hide); window.addEventListener('pagehide', hide); window.addEventListener('beforeunload', unload)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', hide); window.removeEventListener('beforeunload', unload) }
  }, [])

  // ── Mutation, undo/redo ────────────────────────────────────────────────
  const mutate = useCallback((fn: (d: FormDefinition) => FormDefinition, opts: MutateOpts = {}) => {
    const before = defRef.current
    if (!before) return
    const next = fn(before)
    if (next === before) return
    historyRef.current = pushHistory(historyRef.current, before, !!opts.typing)
    setHistTick(t => t + 1)
    applyDef(next)
    loopRef.current?.schedule(next)
    writeLocalDraft(localStorage, { formId: id, baseRevision: loopRef.current?.revision ?? 0, def: next, at: Date.now() })
    if (opts.announce) announce(opts.announce)
  }, [applyDef, id, announce])

  const undo = useCallback(() => {
    const cur_ = defRef.current; if (!cur_) return
    const r = undoHistory(historyRef.current, cur_); if (!r) return
    historyRef.current = r.history; setHistTick(t => t + 1); applyDef(r.def); loopRef.current?.schedule(r.def)
    writeLocalDraft(localStorage, { formId: id, baseRevision: loopRef.current?.revision ?? 0, def: r.def, at: Date.now() })
    announce('Undone')
  }, [applyDef, id, announce])
  const redo = useCallback(() => {
    const cur_ = defRef.current; if (!cur_) return
    const r = redoHistory(historyRef.current, cur_); if (!r) return
    historyRef.current = r.history; setHistTick(t => t + 1); applyDef(r.def); loopRef.current?.schedule(r.def)
    writeLocalDraft(localStorage, { formId: id, baseRevision: loopRef.current?.revision ?? 0, def: r.def, at: Date.now() })
    announce('Redone')
  }, [applyDef, id, announce])

  // Keep selection and current container valid after any change.
  useEffect(() => {
    if (!def) return
    if (!def.pages.some(p => p.id === cur) && !def.endings.some(e => e.id === cur)) setCur(def.pages[0]?.id ?? def.endings[0]?.id ?? '')
    if (sel && !ops.locate(def, sel)) setSel(null)
  }, [def, cur, sel])

  const setTab = useCallback((t: Tab) => {
    setTabState(t)
    const url = new URL(window.location.href)
    if (t === 'build') url.searchParams.delete('tab'); else url.searchParams.set('tab', TAB_PARAM[t] ?? t)
    url.searchParams.delete('new')
    url.searchParams.delete('preview')
    window.history.replaceState(null, '', url.toString())
  }, [])

  const goTo = useCallback((containerId: string, opts: { select?: string | null; focusGhost?: boolean } = {}) => {
    setCur(containerId); setSel(opts.select ?? null); setTabState('build')
    if (opts.focusGhost) setGhostFocusTick(t => t + 1)
  }, [])

  // ── Blocks ─────────────────────────────────────────────────────────────
  const flash = (blockId: string, focus = false) => { setJustAdded(blockId); if (focus) setFocusId(blockId); window.setTimeout(() => { setJustAdded(v => (v === blockId ? null : v)); setFocusId(v => (v === blockId ? null : v)) }, 500) }

  const addBlock = useCallback((pick: LibraryPick, target: InsertTarget, opts: { label?: string; focus?: boolean; keepSidebar?: boolean } = {}): string | null => {
    const d = defRef.current; if (!d) return null
    holdSideTab.current = !!opts.keepSidebar
    const containerOf = (): string | null => target.kind === 'end' || target.kind === 'index' ? target.containerId : target.kind === 'after' ? ops.locate(d, target.blockId)?.containerId ?? null : target.kind === 'slot' ? ops.locate(d, target.slotId)?.containerId ?? null : ops.locate(d, target.targetId)?.containerId ?? null
    const containerId = containerOf(); if (!containerId) return null
    const isEnding = d.endings.some(e => e.id === containerId)
    if ('columns' in pick) {
      if (isEnding) { holdSideTab.current = false; toast({ msg: 'Endings take display content only.' }); return null }
      const index = target.kind === 'index' ? target.index : target.kind === 'after' ? (ops.locate(d, target.blockId)?.index ?? 0) + 1 : (ops.containerBlocks(d, containerId)?.length ?? 0)
      let ids: string[] = []
      mutate(x => { const r = ops.insertColumns(x, containerId, index, pick.columns); ids = r.ids; return r.def }, { announce: 'Columns added' })
      if (ids[0]) { setSel(ids[0]); flash(ids[0]) }
      return ids[0] ?? null
    }
    if (isEnding && componentDef(pick.type).kind !== 'display') { holdSideTab.current = false; toast({ msg: 'Endings take display content only.' }); return null }
    const block = newBlock(pick.type, { ...(pick.preset?.block ?? {}), ...(opts.label !== undefined ? { label: opts.label } : {}) })
    let newId: string | null = block.id
    mutate(x => {
      if (target.kind === 'end') return ops.appendBlock(x, containerId, block)
      if (target.kind === 'index') return ops.insertBlock(x, containerId, target.index, block)
      if (target.kind === 'after') { const loc = ops.locate(x, target.blockId); if (!loc) return x; block.width = loc.block.width === 'full' ? 'full' : 'full'; return ops.insertBlock(x, loc.containerId, loc.index + 1, block) }
      if (target.kind === 'slot') return ops.fillSlot(x, target.slotId, block)
      const r = ops.dropBlock(x, { block }, target.targetId, target.zone); if (!r) { newId = null; return x } return r.def
    }, { announce: 'Field added' })
    if (newId) { setSel(newId); flash(newId, opts.focus === true) } else holdSideTab.current = false
    return newId
  }, [mutate, toast])

  const openLibrary = useCallback((anchor: HTMLElement | DOMRect, target: InsertTarget, opts: { initialQuery?: string; displayOnly?: boolean; returnFocus?: HTMLElement | null } = {}) => {
    const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : anchor
    const maxH = Math.min(420, window.innerHeight - 24)
    let y = rect.bottom + 6
    if (y + maxH > window.innerHeight - 12) y = Math.max(12, rect.top - 6 - maxH)
    const x = Math.max(8, Math.min(rect.left, window.innerWidth - 340 - 12))
    const d = defRef.current
    const containerId = target.kind === 'end' || target.kind === 'index' ? target.containerId : null
    const displayOnly = opts.displayOnly ?? (!!d && !!containerId && d.endings.some(e => e.id === containerId))
    setLibrary({ x, y, maxH, target, displayOnly, initialQuery: opts.initialQuery ?? '', returnFocus: opts.returnFocus ?? (anchor instanceof HTMLElement ? anchor : null) })
  }, [])
  const closeLibrary = useCallback(() => setLibrary(null), [])

  const deleteBlock = useCallback((blockId: string) => {
    const d = defRef.current; if (!d) return
    const loc = ops.locate(d, blockId); if (!loc) return
    const before = d
    mutate(x => ops.removeBlock(x, blockId), { announce: 'Deleted, Undo available' })
    setSel(null)
    const label = loc.block.label || componentDef(loc.block.type).label
    toast({ msg: `Deleted “${label}”`, action: 'Undo', onAction: () => mutate(() => before, { announce: 'Restored' }), testId: 'toast-deleted' })
  }, [mutate, toast])

  const duplicateBlock = useCallback((blockId: string) => {
    let newId: string | null = null
    mutate(x => { const r = ops.duplicateBlock(x, blockId); if (!r) return x; newId = r.id; return r.def }, { announce: 'Duplicated' })
    if (newId) { setSel(newId); flash(newId) }
  }, [mutate])

  const moveBlockTo = useCallback((blockId: string, containerId: string) => {
    const d = defRef.current; if (!d) return
    const page = d.pages.find(p => p.id === containerId) ?? null
    const ending = d.endings.find(e => e.id === containerId) ?? null
    const name = page?.name ?? ending?.name ?? 'page'
    mutate(x => ops.moveBlockToContainer(x, blockId, containerId))
    goTo(containerId, { select: blockId })
    toast({ msg: `Moved to ${name}` }); announce(`Moved to ${name}`)
  }, [mutate, goTo, toast, announce])

  const blockMenu = useCallback((blockId: string, at: MenuAt, returnFocusTo: HTMLElement | null = null) => {
    const d = defRef.current; if (!d) return
    const loc = ops.locate(d, blockId); if (!loc) return
    const others = [...d.pages.filter(p => p.id !== loc.containerId).map(p => ({ id: p.id, name: p.name }))]
    const width = (w: BlockWidth, label: string): MenuItem => ({ label: (loc.block.width === w ? '✓ ' : '') + label, run: () => mutate(x => ops.setBlockWidth(x, blockId, w)) })
    const items: MenuItem[] = [
      { label: 'Duplicate', icon: 'copy', shortcut: '⌘D', run: () => duplicateBlock(blockId) },
      { label: 'Move up', icon: 'arrow-up', disabled: loc.index === 0, run: () => mutate(x => ops.moveBlockBy(x, blockId, -1), { announce: 'Moved up' }) },
      { label: 'Move down', icon: 'arrow-down', disabled: loc.index >= loc.blocks.length - 1, run: () => mutate(x => ops.moveBlockBy(x, blockId, 1), { announce: 'Moved down' }) },
      ...others.map(p => ({ label: `Move to ${p.name}`, icon: 'file-text', run: () => moveBlockTo(blockId, p.id) })),
      { sep: true },
      width('full', 'Full width'), width('half', 'Half width'), width('third', 'Third width'),
      { sep: true },
      { label: 'Delete', icon: 'trash', shortcut: '⌫', danger: true, run: () => deleteBlock(blockId) },
    ]
    setMenu({ at, items, returnFocusTo })
  }, [mutate, duplicateBlock, moveBlockTo, deleteBlock])

  // A field changes type in place: same id, label, description and required flag,
  // so rules, integrations and past responses keep pointing at it (core convert.ts).
  // Anything the change would drop is spelled out first.
  const applyConversion = useCallback((plan: ConversionPlan, from: string) => {
    const before = defRef.current
    const to = componentDef(plan.block.type).label
    mutate(() => plan.def, { announce: `Changed to ${to}, Undo available` })
    toast({ msg: `Changed ${from} to ${to}`, action: 'Undo', onAction: () => { if (before) mutate(() => before, { announce: `Changed back to ${from}` }) } })
  }, [mutate, toast])
  const changeType = useCallback((blockId: string, to: ComponentType) => {
    const d = defRef.current; if (!d) return
    const loc = ops.locate(d, blockId); if (!loc || loc.block.type === to) return
    const plan = planConversion(d, blockId, to); if (!plan) return
    const from = componentDef(loc.block.type).label
    if (plan.losses.length) setTypeConfirm({ plan, from, to: componentDef(to).label })
    else applyConversion(plan, from)
  }, [applyConversion])
  const typeMenu = useCallback((blockId: string, at: MenuAt, returnFocusTo: HTMLElement | null = null) => {
    const d = defRef.current; if (!d) return
    const loc = ops.locate(d, blockId); if (!loc) return
    const cur = componentDef(loc.block.type)
    const items: MenuItem[] = [
      { label: cur.label, icon: cur.icon, checked: true, run: () => undefined, testId: `type-option-${loc.block.type}` },
      { sep: true },
      ...conversionTargets(loc.block.type).map(t => { const c = componentDef(t); return { label: c.label, icon: c.icon, run: () => changeType(blockId, t), testId: `type-option-${t}` } }),
    ]
    setMenu({ at, items, returnFocusTo })
  }, [changeType])

  // ── Pages & endings ────────────────────────────────────────────────────
  const addPage = useCallback(() => {
    let newId = ''
    mutate(x => { const r = ops.addPage(x); newId = r.id; return r.def }, { announce: 'Page added' })
    if (newId) goTo(newId, { focusGhost: true })
  }, [mutate, goTo])
  const addCover = useCallback(() => {
    let newId = ''
    mutate(x => { const r = ops.addCoverPage(x); if (!r) return x; newId = r.id; return r.def }, { announce: 'Cover page added' })
    if (newId) goTo(newId)
  }, [mutate, goTo])
  const deletePage = useCallback((pageId: string) => {
    const d = defRef.current; if (!d) return
    const r = ops.deletePage(d, pageId)
    if (!r) { toast({ msg: 'A form needs at least one page.' }); return }
    const before = d
    mutate(() => r.def, { announce: 'Page deleted, Undo available' })
    if (cur === pageId) setCur(r.def.pages[Math.max(0, r.index - 1)]?.id ?? r.def.pages[0].id)
    toast({ msg: `Deleted page “${r.removed.name}” and its fields`, action: 'Undo', onAction: () => mutate(() => before, { announce: 'Page restored' }) })
  }, [mutate, toast, cur])
  const deleteEnding = useCallback((endingId: string) => {
    const d = defRef.current; if (!d) return
    const r = ops.deleteEnding(d, endingId)
    if (!r) { toast({ msg: 'A form needs at least one ending.' }); return }
    const before = d
    mutate(() => r.def, { announce: 'Ending deleted, Undo available' })
    if (cur === endingId) setCur(r.def.endings[Math.max(0, r.index - 1)]?.id ?? r.def.pages[0].id)
    toast({ msg: r.rulesRemoved.length ? `Deleted ending “${r.removed.name}” and ${r.rulesRemoved.length} rule${r.rulesRemoved.length === 1 ? '' : 's'} that used it` : `Deleted ending “${r.removed.name}”`, action: 'Undo', onAction: () => mutate(() => before, { announce: 'Ending restored' }) })
  }, [mutate, toast, cur])
  const pageMenu = useCallback((pageId: string, at: MenuAt) => {
    const d = defRef.current; if (!d) return
    const i = d.pages.findIndex(p => p.id === pageId)
    setMenu({ at, returnFocusTo: null, items: [
      { label: 'Page settings', icon: 'sliders', run: () => { goTo(pageId); setSideTabState('page') } },
      { label: 'Rename', icon: 'pencil', run: () => { setCur(pageId); setRenaming(pageId) } },
      { label: 'Duplicate page', icon: 'copy', run: () => { let nid = ''; mutate(x => { const r = ops.duplicatePage(x, pageId); if (!r) return x; nid = r.id; return r.def }, { announce: 'Page duplicated' }); if (nid) goTo(nid) } },
      { label: 'Move left', icon: 'arrow-left', disabled: i <= 0, run: () => mutate(x => ops.movePageBy(x, pageId, -1)) },
      { label: 'Move right', icon: 'arrow-right', disabled: i >= d.pages.length - 1, run: () => mutate(x => ops.movePageBy(x, pageId, 1)) },
      { sep: true },
      { label: 'Delete page', icon: 'trash', danger: true, run: () => deletePage(pageId) },
    ] })
  }, [mutate, goTo, deletePage])
  const endingMenu = useCallback((endingId: string, at: MenuAt) => {
    setMenu({ at, returnFocusTo: null, items: [
      { label: 'Ending settings', icon: 'sliders', run: () => { goTo(endingId); setSideTabState('page') } },
      { label: 'Duplicate ending', icon: 'copy', run: () => { let nid = ''; mutate(x => { const r = ops.duplicateEnding(x, endingId); if (!r) return x; nid = r.id; return r.def }, { announce: 'Ending duplicated' }); if (nid) goTo(nid) } },
      { sep: true },
      { label: 'Delete ending', icon: 'trash', danger: true, run: () => deleteEnding(endingId) },
    ] })
  }, [mutate, goTo, deleteEnding])

  // ── Server meta: publish, close, patch ─────────────────────────────────
  const refreshDetail = useCallback(async () => { try { const d = await formsApi.get(id); setDetail(prev => (prev ? { ...d, draft: prev.draft } : d)) } catch { /* keep what we have */ } }, [id])

  const flushSave = useCallback(async (): Promise<boolean> => {
    const loop = loopRef.current; if (!loop) return false
    await loop.flush()
    for (let i = 0; i < 40 && loop.hasPending(); i++) await new Promise(r => setTimeout(r, 100))
    return !loop.hasPending()
  }, [])
  // Save first, then load the new deploy: nothing typed is lost to the reload.
  const reloadForUpdate = useCallback(async () => {
    setReloading(true)
    if (await flushSave()) window.location.reload()
    else { setReloading(false); toast({ msg: 'Couldn’t save your latest change. Check your connection, then reload.' }) }
  }, [flushSave, toast])

  const brokenRules: LogicIssue[] = useMemo(() => (def ? checkRules(def) : []), [def])

  const publish = useCallback(async () => {
    if (!def || !detail || publishing) return
    if (brokenRules.length) { toast({ msg: `${brokenRules.length} rule${brokenRules.length === 1 ? '' : 's'} need attention before publishing.`, tone: 'coral' }); setTab('logic'); return }
    if (detail.publishState === 'live') { toast({ msg: 'Already live — nothing new to publish.' }); return }
    if (detail.publishState === 'closed' && !detail.unpublishedChanges && !loopRef.current?.hasPending()) { toast({ msg: 'Nothing new to publish. The form is closed to responses.' }); return }
    setPublishing(true)
    try {
      const ok = await flushSave()
      if (!ok) { toast({ msg: 'Couldn’t save the latest changes. Check your connection and try again.', tone: 'coral' }); return }
      const r = await formsApi.publish(id, loopRef.current?.revision)
      setStamp(true); window.setTimeout(() => setStamp(false), 1800)
      const url = publicFormUrl(r.slug)
      // Publishing never reopens a closed form (QA 2026-09-24 P1) — and says so.
      if (r.publishState === 'closed') toast({ msg: `Published version ${r.version.number}. The form is still closed to new responses — turn on Accept responses in Share to reopen it.`, action: 'Open Share', onAction: () => setTab('share'), stamp: 'CLOSED', tone: 'neutral', testId: 'toast-published', duration: 8000 })
      else toast({ msg: `Live at ${url.replace(/^https?:\/\//, '')}`, action: 'Copy link', onAction: () => { void navigator.clipboard.writeText(url) }, stamp: 'LIVE', tone: 'lime', testId: 'toast-published' })
      announce(r.publishState === 'closed' ? 'Published. Still closed to responses.' : 'Published')
      await refreshDetail()
    } catch (err) {
      const e = err as ApiError
      const issues = (e.body?.issues as Array<{ message: string }> | undefined) ?? []
      toast({ msg: issues.length ? `Can’t publish: ${issues[0].message}` : `Couldn’t publish: ${e.message}`, tone: 'coral' })
      if (issues.length) setTab('logic')
    } finally { setPublishing(false) }
  }, [def, detail, publishing, brokenRules, toast, setTab, flushSave, id, announce, refreshDetail])

  const patchMeta = useCallback(async (patch: { title?: string; slug?: string; closedMessage?: string }): Promise<boolean> => {
    try { const d = await formsApi.patch(id, patch); setDetail(prev => (prev ? { ...d, draft: prev.draft } : d)); if (patch.slug) toast({ msg: 'Link updated.' }); return true }
    catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }); return false }
  }, [id, toast])
  const setClosed = useCallback(async (closed: boolean) => {
    try { const d = closed ? await formsApi.close(id) : await formsApi.reopen(id); setDetail(prev => (prev ? { ...d, draft: prev.draft } : d)); toast({ msg: closed ? 'Closed to new responses.' : 'Accepting responses again.' }) }
    catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }) }
  }, [id, toast])
  const unpublish = useCallback(async () => {
    try { const d = await formsApi.unpublish(id); setDetail(prev => (prev ? { ...d, draft: prev.draft } : d)); toast({ msg: 'Unpublished. The link no longer serves the form.' }) }
    catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }) }
  }, [id, toast])
  const uploadAsset = useCallback(async (file: File): Promise<string | null> => {
    try { const r = await formsApi.uploadAsset(id, file); return r.url } catch (err) { toast({ msg: (err as Error).message, tone: 'coral' }); return null }
  }, [id, toast])

  // ── Keyboard map ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!def) return
      const t = e.target as HTMLElement
      const typing = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)
      const mod = e.metaKey || e.ctrlKey
      if (e.key === 'Escape') {
        if (library) { setLibrary(null); return }
        if (menu) { setMenu(null); return }
        if (preview) { e.preventDefault(); setPreview(false); return }
        if (sel) { setSel(null); return }
        if (typing) t.blur()
        return
      }
      if (mod && e.key === 'Enter') { e.preventDefault(); setPreview(p => !p); return }
      if (preview) return
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { if (typing) return; e.preventDefault(); undo(); return }
      if ((mod && e.shiftKey && e.key.toLowerCase() === 'z') || (e.ctrlKey && e.key.toLowerCase() === 'y')) { if (typing) return; e.preventDefault(); redo(); return }
      if (mod && e.key.toLowerCase() === 'd' && sel) { e.preventDefault(); duplicateBlock(sel); return }
      if ((e.key === 'Backspace' || e.key === 'Delete') && sel && !typing && tab === 'build') { e.preventDefault(); deleteBlock(sel); return }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [def, library, menu, preview, sel, tab, undo, redo, duplicateBlock, deleteBlock])

  // ── Drag and drop ──────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  useEffect(() => {
    if (!dnd.activeId) return
    const move = (e: PointerEvent) => { pointer.current = { x: e.clientX, y: e.clientY } }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [dnd.activeId])
  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as typeof dragData.current
    dragData.current = data
    const ae = e.activatorEvent as PointerEvent
    if (ae && 'clientX' in ae) pointer.current = { x: ae.clientX, y: ae.clientY }
    setDnd({ activeId: String(e.active.id), activeLabel: data?.label ?? '', over: null })
    setLibrary(null); setMenu(null)
  }
  const onDragMove = (e: DragMoveEvent) => {
    const over = e.over
    if (!over) { setDnd(s => (s.over ? { ...s, over: null } : s)); return }
    const oid = String(over.id)
    const data = dragData.current
    let next: DndState['over'] = null
    if (oid.startsWith('block:')) {
      const blockId = oid.slice(6)
      if (data?.kind === 'block' && data.blockId === blockId) next = null
      else if (data?.kind === 'pagetab') next = null
      else next = { id: blockId, zone: zoneFor(over.rect, pointer.current.x, pointer.current.y) }
    } else if (oid.startsWith('ghost:')) next = data?.kind === 'pagetab' ? null : { id: 'ghost', targetId: oid.slice(6) }
    else if (oid.startsWith('page:')) next = { id: 'page', targetId: oid.slice(5) }
    setDnd(s => (JSON.stringify(s.over) === JSON.stringify(next) ? s : { ...s, over: next }))
  }
  const onDragEnd = (e: DragEndEvent) => {
    const data = dragData.current
    const over = dnd.over
    setDnd({ activeId: null, activeLabel: '', over: null })
    dragData.current = null
    if (!data || !over) return
    if (data.kind === 'pagetab') {
      if (over.id === 'page' && 'targetId' in over) {
        const d = defRef.current; if (!d) return
        const to = d.pages.findIndex(p => p.id === over.targetId)
        const rect = e.over?.rect
        const after = rect ? pointer.current.x > rect.left + rect.width / 2 : false
        const from = d.pages.findIndex(p => p.id === data.pageId)
        let toIndex = after ? to + 1 : to
        if (from < toIndex) toIndex -= 1
        if (toIndex !== from) mutate(x => ops.movePage(x, data.pageId, toIndex), { announce: 'Page moved' })
      }
      return
    }
    if ('zone' in over) {
      const d = defRef.current; if (!d) return
      const targetLoc = ops.locate(d, over.id)
      if (targetLoc?.block.type === 'slot' && data.kind === 'lib' && !('columns' in data.pick)) { addBlock(data.pick, { kind: 'slot', slotId: over.id }, { keepSidebar: true }); return }
      if (data.kind === 'lib') { addBlock(data.pick, { kind: 'drop', targetId: over.id, zone: over.zone }, { keepSidebar: true }); return }
      mutate(x => { const r = ops.dropBlock(x, { blockId: data.blockId }, over.id, over.zone); return r ? r.def : x }, { announce: 'Moved' })
      setSel(data.blockId); flash(data.blockId)
      return
    }
    if (over.id === 'ghost') {
      if (data.kind === 'lib') { addBlock(data.pick, { kind: 'end', containerId: over.targetId }, { keepSidebar: true }); return }
      mutate(x => ops.moveBlockToContainer(x, data.blockId, over.targetId), { announce: 'Moved to the end' })
      setSel(data.blockId); flash(data.blockId)
      return
    }
    if (over.id === 'page') {
      if (data.kind === 'lib') { const nid = addBlock(data.pick, { kind: 'end', containerId: over.targetId }, { keepSidebar: true }); if (nid) goTo(over.targetId, { select: nid }); return }
      moveBlockTo(data.blockId, over.targetId)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────
  const curPage = def?.pages.find(p => p.id === cur) ?? null
  const curEnding = def?.endings.find(e => e.id === cur) ?? null
  const history = historyRef.current
  void histTick

  const api: BuilderApi | null = useMemo(() => {
    if (!def || !detail) return null
    return {
      formId: id, def, detail, cur, curKind: curEnding ? 'ending' : 'page', curPage, curEnding, sel, tab, saveState, canUndo: history.past.length > 0, canRedo: history.future.length > 0, brokenRules,
      layout: { narrow, fallback }, sideTab, logicFilter, lastRuleId, renaming, justAdded, focusId, library, dnd, device: 'desktop', previewDevice, preview, descOpen, ghostFocusTick,
      mutate, select: setSel, goTo, setTab, setSideTab: setSideTabState, setLogicFilter, setRenaming, setPreviewDevice,
      setDescOpen: (bid, on) => setDescOpenState(s => { const n = new Set(s); if (on) n.add(bid); else n.delete(bid); return n }),
      openPreview: () => setPreview(true), closePreview: () => setPreview(false),
      addBlock, openLibrary, closeLibrary,
      updateBlock: (bid, patch, typing) => mutate(x => ops.updateBlock(x, bid, patch), { typing }),
      deleteBlock, duplicateBlock,
      moveBlockBy: (bid, dir) => mutate(x => ops.moveBlockBy(x, bid, dir), { announce: dir < 0 ? 'Moved up' : 'Moved down' }),
      moveBlockTo, setWidth: (bid, w) => mutate(x => ops.setBlockWidth(x, bid, w)),
      toggleRequired: bid => mutate(x => ops.updateBlock(x, bid, b => { b.required = !b.required })),
      blockMenu, typeMenu, changeType,
      optionLabel: (bid, i, label) => mutate(x => ops.setOptionLabel(x, bid, i, label), { typing: true }),
      optionAdd: (bid, after) => { let oid = ''; mutate(x => { const r = ops.addOption(x, bid, after); oid = r.id; return r.def }); window.setTimeout(() => { const inputs = document.querySelectorAll<HTMLInputElement>(`[data-block="${bid}"] [data-testid="option-label"]`); const idx = after === undefined ? inputs.length - 1 : after + 1; inputs[idx]?.focus() }, 0); void oid },
      optionRemove: (bid, i) => { mutate(x => ops.removeOption(x, bid, i)); window.setTimeout(() => { const inputs = document.querySelectorAll<HTMLInputElement>(`[data-block="${bid}"] [data-testid="option-label"]`); inputs[Math.max(0, i - 1)]?.focus() }, 0) },
      optionImage: (bid, i) => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/gif'; input.onchange = async () => { const f = input.files?.[0]; if (!f) return; const url = await uploadAsset(f); if (url) mutate(x => ops.updateBlock(x, bid, b => { if (b.options[i]) b.options[i] = { ...b.options[i], imageUrl: url } })) }; input.click() },
      addPage, addCover,
      updatePage: (pid, patch, typing) => mutate(x => ops.updatePage(x, pid, patch), { typing }),
      deletePage,
      duplicatePage: pid => { let nid = ''; mutate(x => { const r = ops.duplicatePage(x, pid); if (!r) return x; nid = r.id; return r.def }); if (nid) goTo(nid) },
      movePageBy: (pid, dir) => mutate(x => ops.movePageBy(x, pid, dir)),
      reorderPage: (pid, to) => mutate(x => ops.movePage(x, pid, to)),
      pageMenu,
      addEnding: () => { let nid = ''; mutate(x => { const r = ops.addEnding(x); nid = r.id; return r.def }, { announce: 'Ending added' }); if (nid) goTo(nid) },
      updateEnding: (eid, patch, typing) => mutate(x => ops.updateEnding(x, eid, patch), { typing }),
      deleteEnding,
      duplicateEnding: eid => { let nid = ''; mutate(x => { const r = ops.duplicateEnding(x, eid); if (!r) return x; nid = r.id; return r.def }); if (nid) goTo(nid) },
      endingMenu,
      updateSettings: patch => mutate(x => ({ ...x, settings: { ...x.settings, ...patch } })),
      updateTheme: (patch, typing) => mutate(x => ({ ...x, theme: { ...x.theme, ...patch } }), { typing }),
      uploadAsset,
      addRule: opts => { const rule = ops.newRule(defRef.current!, opts); setLastRuleId(rule.id); mutate(x => ops.addRule(x, rule), { announce: 'Rule added' }) },
      updateRule: (rid, fn, typing) => mutate(x => ops.updateRule(x, rid, fn), { typing }),
      deleteRule: rid => { const before = defRef.current!; mutate(x => ops.deleteRule(x, rid), { announce: 'Rule deleted, Undo available' }); toast({ msg: 'Rule deleted', action: 'Undo', onAction: () => mutate(() => before) }) },
      moveRule: (rid, dir) => mutate(x => ops.moveRule(x, rid, dir)),
      undo, redo, publish, refreshDetail, patchMeta, setClosed, unpublish, announce, toast,
    }
  }, [def, detail, id, cur, curPage, curEnding, sel, tab, saveState, history, brokenRules, narrow, fallback, sideTab, logicFilter, lastRuleId, renaming, justAdded, focusId, library, dnd, previewDevice, preview, descOpen, ghostFocusTick, mutate, goTo, setTab, addBlock, openLibrary, closeLibrary, deleteBlock, duplicateBlock, moveBlockTo, blockMenu, typeMenu, changeType, addPage, addCover, deletePage, pageMenu, deleteEnding, endingMenu, uploadAsset, undo, redo, publish, refreshDetail, patchMeta, setClosed, unpublish, announce, toast])

  // ── Render ─────────────────────────────────────────────────────────────
  if (loadError) return <div style={{ padding: 32 }}><EmptyState title="Couldn’t open this form." body={loadError} action={<Btn onClick={() => router.push('/forms')}>Back to Forms</Btn>} /></div>
  if (!api || !def || !detail) return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }} aria-busy="true" aria-label="Loading form">
      <Skeleton width={260} height={20} /><Skeleton width="100%" height={52} /><Skeleton width="60%" height={300} />
    </div>
  )

  if (phone) return <PhoneFormDesk detail={detail} def={def} initialPreview={initialPreview} />

  const state = STATE_TAG[detail.publishState]
  const publishLabel = detail.publishState === 'dirty' ? 'Publish changes' : detail.publishState === 'live' ? 'Published' : detail.publishState === 'closed' ? (detail.unpublishedChanges ? 'Publish changes' : 'Published') : 'Publish'
  const previewTransport = { submit: async (p: { answers: Record<string, unknown> }) => ({ submissionId: 'preview', endingId: evaluate(def, p.answers as never).endingId }), uploads: null }
  const frameW = previewDevice === 'tablet' ? 820 : previewDevice === 'phone' ? 392 : '100%'
  const showStrip = tab === 'build' || tab === 'theme'
  const sectionBar = <SectionBar tab={tab} onChange={setTab} rules={def.rules.length} broken={brokenRules.length} />

  return (
    <BuilderCtx.Provider value={api}>
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => { setDnd({ activeId: null, activeLabel: '', over: null }); dragData.current = null }}>
        <div data-builder="" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%', background: 'var(--bg)' }}>
          {/* The band: name, state, and the only two actions. Sections live on
              the floating bar over the canvas; undo/redo are ⌘Z / ⇧⌘Z only. */}
          <header className="fb-band" data-testid="builder-band">
            <IconBtn icon="arrow-left" label="Back to Forms" onClick={() => router.push('/forms')} data-testid="back" />
            <span className="fb-band__name" data-value={def.title || 'Untitled form'}>
              <input aria-label="Form name" title="Click to rename" size={1} value={def.title} placeholder="Untitled form" onChange={e => mutate(x => ({ ...x, title: e.target.value }), { typing: true })} onBlur={e => { if (!e.target.value.trim()) mutate(x => ({ ...x, title: 'Untitled form' })) }} data-testid="form-title" />
            </span>
            <Tag tone={state.tone} testId="publish-state">{state.label}</Tag>
            <SaveState onBand state={offline && saveState !== 'saved' ? 'offline' : saveState} onRetry={() => loopRef.current?.retryNow()} />
            <div style={{ flex: 1 }} />
            {/* Responses live on the Forms app's Responses page; this is the form's door to its own. */}
            <Link href={`/forms/responses?form=${encodeURIComponent(id)}`} className="fb-btn" aria-label={`Responses${detail.unreadCount ? `, ${detail.unreadCount} new` : ''}`} data-testid="band-responses">
              <Icon name="inbox" size={15} />Responses{detail.unreadCount > 0 && <span className="fb-badge" data-testid="responses-unread">{detail.unreadCount}</span>}
            </Link>
            <Btn icon="eye" onClick={() => setPreview(true)} testId="preview">Preview</Btn>
            <div style={{ position: 'relative' }}>
              <Btn solid onClick={() => void publish()} disabled={publishing || brokenRules.length > 0} title={brokenRules.length ? `${brokenRules.length} rule${brokenRules.length === 1 ? '' : 's'} need attention` : undefined} testId="publish">{publishing ? 'Publishing…' : publishLabel}</Btn>
              {stamp && <Stamp className="fb-slam" style={{ position: 'absolute', right: -10, top: -14 }}>PUBLISHED</Stamp>}
            </div>
          </header>
          {offline && <Banner tone="gold" icon="wifi-off" role="alert">You&apos;re offline. Changes are kept on this device and sync when you&apos;re back.</Banner>}
          {newDeploy && (
            <div data-testid="update-banner">
              <Banner tone="gold" icon="refresh" role="status" action={<Btn size="sm" solid disabled={reloading} onClick={() => void reloadForUpdate()} testId="update-reload">{reloading ? 'Saving…' : 'Reload'}</Btn>}>
                Forms was updated since you opened this tab. Reload to use the latest version; your work is saved first.
              </Banner>
            </div>
          )}
          {conflict && (
            <Banner tone="coral" icon="alert" role="alert" action={<>
              <Btn size="sm" onClick={() => { historyRef.current = initialHistory(); applyDef(conflict.def); loopRef.current?.resume(conflict.revision, { keepPending: false }); clearLocalDraft(localStorage, id); setConflict(null); toast({ msg: 'Loaded the latest version.' }) }} testId="conflict-theirs">Load their version</Btn>
              <Btn size="sm" solid onClick={() => { loopRef.current?.resume(conflict.revision, { keepPending: true }); setConflict(null) }} testId="conflict-mine">Keep mine</Btn>
            </>}>This form was changed elsewhere{conflict.updatedBy ? ` by ${conflict.updatedBy}` : ''} while you were editing. Load their version, or keep yours and overwrite it.</Banner>
          )}
          {recovery && (
            <Banner tone="gold" icon="refresh" role="status" action={<>
              <Btn size="sm" onClick={() => { clearLocalDraft(localStorage, id); setRecovery(null) }}>Discard</Btn>
              <Btn size="sm" solid onClick={() => { mutate(() => recovery.def, { announce: 'Edits restored' }); setRecovery(null) }} testId="recovery-restore">Restore my edits</Btn>
            </>}>Unsaved edits from this device were found, made before the form changed elsewhere.</Banner>
          )}
          {brokenRules.length > 0 && tab !== 'logic' && <Banner tone="coral" icon="branch" role="status" action={<Btn size="sm" onClick={() => setTab('logic')}>Open Logic</Btn>}>{brokenRules.length === 1 ? '1 rule needs attention' : `${brokenRules.length} rules need attention`}. Publishing is blocked until they are fixed.</Banner>}

          {preview ? (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} data-testid="preview-mode">
              <div style={{ height: 44, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', borderBottom: '1.5px solid var(--line2)', background: 'var(--paper)' }} className="fb-rise">
                <span className="fb-caps">Preview</span>
                <Seg<Device> value={previewDevice} onChange={setPreviewDevice} label="Preview device" options={[{ value: 'desktop', label: 'Desktop', icon: 'monitor', testId: 'device-desktop' }, { value: 'tablet', label: 'Tablet 820', icon: 'tablet', testId: 'device-tablet' }, { value: 'phone', label: 'Phone 392', icon: 'phone2', testId: 'device-phone' }]} />
                <span style={{ fontSize: 12, color: 'var(--mut2)' }}>Exactly what respondents see. Answers here aren&apos;t saved.</span>
                <div style={{ flex: 1 }} />
                <Btn size="sm" icon="refresh" onClick={() => setPreviewRestart(k => k + 1)} testId="preview-restart">Restart</Btn>
                <Btn size="sm" onClick={() => setPreview(false)} testId="preview-exit">Exit preview <span className="fb-kbd">esc</span></Btn>
              </div>
              <div className="fb-scroll" data-runner-scroll="" style={{ flex: 1, minHeight: 0, background: 'var(--inset)', padding: previewDevice === 'desktop' ? 0 : '28px 20px 48px' }}>
                <div style={{ margin: '0 auto', width: frameW, maxWidth: '100%', minHeight: previewDevice === 'desktop' ? '100%' : 640, border: previewDevice === 'desktop' ? 0 : '3px solid var(--ink)', borderRadius: previewDevice === 'desktop' ? 0 : 28, overflow: 'hidden', background: def.theme.bg, transition: 'width .36s var(--ease-spring)', boxShadow: previewDevice === 'desktop' ? 'none' : 'var(--el-4)' }} data-testid={`preview-frame-${previewDevice}`}>
                  <FormRunner key={`${previewDevice}-${previewRestart}`} def={def} mode="preview" device={previewDevice} transport={previewTransport} restartKey={previewRestart} />
                </div>
              </div>
            </div>
          ) : fallback ? (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} data-testid="builder-fallback">
              {(tab === 'build' || tab === 'theme') && <Banner tone="gold" icon="monitor">Open on a larger screen to build. This is a read-only preview.</Banner>}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {sectionBar}
                {tab === 'logic' ? <LogicTab /> : tab === 'share' ? <ShareTab /> : tab === 'settings' ? <SettingsTab /> : (
                  <div className="fb-scroll" data-runner-scroll="" style={{ flex: 1, minHeight: 0, paddingTop: 60 }}><FormRunner def={def} mode="preview" device="tablet" transport={previewTransport} /></div>
                )}
              </div>
            </div>
          ) : (
            <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }} data-testid="builder-main">
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }} data-testid="builder-region">
                {sectionBar}
                {(tab === 'build' || tab === 'theme') && <Canvas />}
                {tab === 'logic' && <LogicTab />}
                {tab === 'share' && <ShareTab />}
                {tab === 'settings' && <SettingsTab />}
              </div>
              {showStrip && <PageStrip />}
            </main>
          )}
          {!fallback && <SidebarPanel />}
          {menu && <Menu at={menu.at} items={menu.items} onClose={() => setMenu(null)} returnFocusTo={menu.returnFocusTo} />}
          <Confirm open={!!typeConfirm} title={typeConfirm ? `Change ${typeConfirm.from} to ${typeConfirm.to}?` : ''} confirmLabel={typeConfirm ? `Change to ${typeConfirm.to}` : 'Change'}
            body={typeConfirm && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span>The field keeps its question, description, required setting and every past response. This change:</span>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="type-change-losses">{typeConfirm.plan.losses.map(l => <li key={l}>{l}</li>)}</ul>
                <span>You can undo it straight after.</span>
              </div>
            )}
            onCancel={() => setTypeConfirm(null)} onConfirm={() => { const c = typeConfirm; setTypeConfirm(null); if (c) applyConversion(c.plan, c.from) }} />
          <SlashMenu />
          <DragOverlay dropAnimation={null}>
            {dnd.activeId && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 12px', border: '2px solid var(--ink)', borderRadius: 9, background: 'var(--card)', boxShadow: 'var(--el-2)', fontSize: 13, fontWeight: 800, color: 'var(--tx)', fontFamily: 'var(--font-body)', cursor: 'grabbing' }}><Icon name="grip" size={14} /> {dnd.activeLabel}</div>}
          </DragOverlay>
        </div>
      </DndContext>
    </BuilderCtx.Provider>
  )
}
