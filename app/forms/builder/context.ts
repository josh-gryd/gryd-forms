// What every builder panel can see and do. The Builder owns the state and
// hands this down through context, so Canvas, the sidebar panels, PageStrip
// and the sections stay presentational and the rules (undo, autosave,
// selection) live in one place.

import { createContext, useContext } from 'react'
import type { FormDefinition, Block, BlockWidth, ComponentType, Page, Ending, LibraryPreset, LogicIssue, Rule, Theme, FormSettings } from '@/lib/forms-core/index'
import type { FormDetail } from '@/lib/forms/api'
import type { MenuAt, SaveStateValue } from '../ui'
import type { Device } from '../render/registry'
import type { Zone } from './ops'

export type Tab = 'build' | 'logic' | 'theme' | 'share' | 'settings'
/** The app sidebar's panels while building: the field library, the current
 *  page's (or ending's) settings, the selected field's settings. */
export type SideTab = 'fields' | 'page' | 'field'

export type InsertTarget =
  | { kind: 'end'; containerId: string }
  | { kind: 'index'; containerId: string; index: number }
  | { kind: 'after'; blockId: string }
  | { kind: 'slot'; slotId: string }
  | { kind: 'drop'; targetId: string; zone: Zone }

export type LibraryPick = { type: ComponentType; preset?: LibraryPreset } | { columns: 2 | 3 }

export interface LibraryMenuState { x: number; y: number; maxH: number; target: InsertTarget; displayOnly: boolean; initialQuery: string; returnFocus: HTMLElement | null }

export interface DndState { activeId: string | null; activeLabel: string; over: { id: string; zone: Zone } | { id: 'ghost' | 'page' | 'slot'; targetId: string } | null }

export interface MutateOpts { typing?: boolean; announce?: string }

export interface BuilderApi {
  formId: string
  def: FormDefinition
  detail: FormDetail
  cur: string
  curKind: 'page' | 'ending'
  curPage: Page | null
  curEnding: Ending | null
  sel: string | null
  tab: Tab
  saveState: SaveStateValue
  canUndo: boolean
  canRedo: boolean
  brokenRules: LogicIssue[]
  /** narrow: the floating section bar shows icons (≤1279). fallback: the
   *  shell has hidden the app sidebar (≤999) — read-only preview + Results. */
  layout: { narrow: boolean; fallback: boolean }
  sideTab: SideTab
  logicFilter: string | null
  /** The rule added most recently: stays visible under a field filter while it is being shaped. */
  lastRuleId: string | null
  renaming: string | null
  justAdded: string | null
  focusId: string | null
  library: LibraryMenuState | null
  dnd: DndState
  device: Device
  previewDevice: Device
  preview: boolean
  descOpen: Set<string>
  ghostFocusTick: number

  mutate(fn: (def: FormDefinition) => FormDefinition, opts?: MutateOpts): void
  select(id: string | null): void
  goTo(containerId: string, opts?: { select?: string | null; focusGhost?: boolean }): void
  setTab(tab: Tab): void
  setSideTab(tab: SideTab): void
  setLogicFilter(id: string | null): void
  setRenaming(id: string | null): void
  setPreviewDevice(d: Device): void
  setDescOpen(id: string, on: boolean): void
  openPreview(): void
  closePreview(): void

  /** keepSidebar: the sidebar stays on Fields (a library tile was clicked — the
   *  next click is likely another tile); otherwise the new field opens Field. */
  addBlock(pick: LibraryPick, target: InsertTarget, opts?: { label?: string; focus?: boolean; keepSidebar?: boolean }): string | null
  openLibrary(anchor: HTMLElement | DOMRect, target: InsertTarget, opts?: { initialQuery?: string; displayOnly?: boolean; returnFocus?: HTMLElement | null }): void
  closeLibrary(): void
  updateBlock(id: string, patch: Partial<Block> | ((b: Block) => void), typing?: boolean): void
  deleteBlock(id: string): void
  duplicateBlock(id: string): void
  moveBlockBy(id: string, dir: -1 | 1): void
  moveBlockTo(id: string, containerId: string): void
  setWidth(id: string, w: BlockWidth): void
  toggleRequired(id: string): void
  blockMenu(id: string, at: MenuAt, returnFocusTo?: HTMLElement | null): void
  /** The types this field can switch to in place (core convert.ts). */
  typeMenu(id: string, at: MenuAt, returnFocusTo?: HTMLElement | null): void
  /** Switch a field's type, keeping its id; asks first when the change drops something. */
  changeType(id: string, to: ComponentType): void
  optionLabel(id: string, index: number, label: string): void
  optionAdd(id: string, afterIndex?: number): void
  optionRemove(id: string, index: number): void
  optionImage(id: string, index: number): void

  addPage(): void
  addCover(): void
  updatePage(id: string, patch: Partial<Page>, typing?: boolean): void
  deletePage(id: string): void
  duplicatePage(id: string): void
  movePageBy(id: string, dir: -1 | 1): void
  reorderPage(id: string, toIndex: number): void
  pageMenu(id: string, at: MenuAt): void
  addEnding(): void
  updateEnding(id: string, patch: Partial<Ending>, typing?: boolean): void
  deleteEnding(id: string): void
  duplicateEnding(id: string): void
  endingMenu(id: string, at: MenuAt): void
  updateSettings(patch: Partial<FormSettings>): void
  updateTheme(patch: Partial<Theme>, typing?: boolean): void
  uploadAsset(file: File): Promise<string | null>

  addRule(opts?: { fieldId?: string; action?: Rule['then']['type']; target?: string }): void
  updateRule(id: string, fn: (r: Rule) => void, typing?: boolean): void
  deleteRule(id: string): void
  moveRule(id: string, dir: -1 | 1): void

  undo(): void
  redo(): void
  publish(): Promise<void>
  refreshDetail(): Promise<void>
  patchMeta(patch: { title?: string; slug?: string; closedMessage?: string }): Promise<boolean>
  setClosed(closed: boolean): Promise<void>
  unpublish(): Promise<void>
  announce(msg: string): void
  toast(input: { msg: React.ReactNode; action?: string; onAction?: () => void; stamp?: string; tone?: 'neutral' | 'lime' | 'coral'; duration?: number }): void
}

export const BuilderCtx = createContext<BuilderApi | null>(null)
export function useBuilder(): BuilderApi {
  const api = useContext(BuilderCtx)
  if (!api) throw new Error('useBuilder outside <Builder>')
  return api
}
