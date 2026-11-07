'use client'

// A folder's actions: Rename, Color, Delete folder. The ⋯ beside
// the folder's name on its page and a right-click on its row in the sidebar
// open this one menu, so the two can't drift apart. Its dialogs show their own
// errors: the sidebar sits outside the Forms toaster.

import { useCallback, useEffect, useState } from 'react'
import { formsApi, formsChanged, type Folder, type FolderColor } from '@/lib/forms/api'
import { Btn, Menu, Dialog, Confirm, Field, Input, type MenuAt } from './ui'
import { FolderGlyph, FOLDER_PALETTE } from './ui/FolderGlyph'

type Mode = 'menu' | 'rename' | 'color' | 'delete'
interface State { mode: Mode; folder: Folder; at?: MenuAt; el?: HTMLElement | null }

export function useFolderActions(onDeleted?: (folder: Folder) => void) {
  const [state, setState] = useState<State | null>(null)
  const open = useCallback((folder: Folder, at: MenuAt, el?: HTMLElement | null) => setState({ mode: 'menu', folder, at, el }), [])
  const rename = useCallback((folder: Folder) => setState({ mode: 'rename', folder }), [])
  const ui = <FolderActionsUI state={state} setState={setState} onDeleted={onDeleted} />
  return { open, rename, ui }
}

function FolderActionsUI({ state, setState, onDeleted }: { state: State | null; setState: React.Dispatch<React.SetStateAction<State | null>>; onDeleted?: (folder: Folder) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const mode = state?.mode
  const folder = state?.folder
  useEffect(() => { setError(null); if (mode === 'rename' && folder) setName(folder.name) }, [mode, folder])
  const close = () => setState(null)
  // The menu closes itself before running the pick, so the pick names its folder.
  const to = (m: Mode) => { const f = folder; return () => { if (f) setState({ mode: m, folder: f }) } }

  const run = async (work: () => Promise<unknown>, after?: () => void) => {
    setBusy(true); setError(null)
    try { await work(); formsChanged(); close(); after?.() }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }
  const saveName = () => {
    if (!folder) return
    const n = name.trim()
    if (!n || n === folder.name) { close(); return }
    void run(() => formsApi.renameFolder(folder.id, n))
  }
  const pick = (color: FolderColor) => {
    if (!folder) return
    if (color === folder.color) { close(); return }
    void run(() => formsApi.recolorFolder(folder.id, color))
  }

  if (!state || !folder) return null
  return (
    <>
      {mode === 'menu' && state.at && (
        <Menu at={state.at} label={`Folder ${folder.name}`} returnFocusTo={state.el} onClose={() => setState(s => (s?.mode === 'menu' ? null : s))} items={[
          { label: 'Rename', icon: 'pencil', shortcut: 'F2', run: to('rename'), testId: 'folder-menu-rename' },
          { label: 'Color', lead: <FolderGlyph color={folder.color} size={15} />, run: to('color'), testId: 'folder-menu-color' },
          { sep: true },
          { label: 'Delete folder', icon: 'trash', danger: true, run: to('delete'), testId: 'folder-menu-delete' },
        ]} />
      )}
      <Dialog open={mode === 'rename'} title="Rename folder" onClose={close} testId="folder-rename-dialog"
        actions={<><Btn onClick={close}>Cancel</Btn><Btn solid onClick={saveName} disabled={busy || !name.trim()} testId="folder-rename-save">Save</Btn></>}>
        <form onSubmit={e => { e.preventDefault(); saveName() }}>
          <Field label="Folder name" htmlFor="folder-rename-input" error={error}>
            <Input id="folder-rename-input" autoFocus value={name} onChange={e => setName(e.target.value)} onFocus={e => e.currentTarget.select()} maxLength={60} data-testid="folder-rename-input" />
          </Field>
        </form>
      </Dialog>
      <Dialog open={mode === 'color'} title="Folder color" onClose={close} testId="folder-color-dialog" width={380}>
        <div className="fb-swatch-grid" role="group" aria-label={`Color for ${folder.name}`} data-testid="folder-colors">
          {FOLDER_PALETTE.map(c => (
            <button key={c.id} type="button" className="fb-swatch-pick" aria-pressed={folder.color === c.id} disabled={busy}
              onClick={() => pick(c.id)} data-testid={`folder-color-${c.id}`}>
              <FolderGlyph color={c.id} size={26} />
              <span>{c.label}</span>
            </button>
          ))}
        </div>
        {error && <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--coral-tx)' }}>{error}</p>}
      </Dialog>
      <Confirm open={mode === 'delete'} title={`Delete the folder “${folder.name}”?`} confirmLabel="Delete folder" busy={busy} onCancel={close}
        onConfirm={() => void run(() => formsApi.deleteFolder(folder.id), () => onDeleted?.(folder))}
        body={error ? <span role="alert" style={{ color: 'var(--coral-tx)', fontWeight: 700 }}>{error}</span> : 'Its forms stay, in All forms, outside any folder.'} />
    </>
  )
}
