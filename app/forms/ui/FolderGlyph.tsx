// A folder in its color. The --folder-* tokens live in globals.css, not
// forms.css: the sidebar draws folders too, and they must match.

import type { FolderColor } from '@/lib/forms/api'

export const FOLDER_PALETTE: ReadonlyArray<{ id: FolderColor; label: string; paint: string }> = [
  { id: 'blue', label: 'Blue', paint: 'var(--folder-blue)' },
  { id: 'lime', label: 'Lime', paint: 'var(--folder-lime)' },
  { id: 'gold', label: 'Gold', paint: 'var(--folder-gold)' },
  { id: 'coral', label: 'Coral', paint: 'var(--folder-coral)' },
  { id: 'purple', label: 'Purple', paint: 'var(--folder-purple)' },
  { id: 'teal', label: 'Teal', paint: 'var(--folder-teal)' },
  { id: 'pink', label: 'Pink', paint: 'var(--folder-pink)' },
  { id: 'grey', label: 'Grey', paint: 'var(--folder-grey)' },
]

export const folderPaint = (color: FolderColor | null | undefined): string => FOLDER_PALETTE.find(p => p.id === color)?.paint ?? 'var(--folder-grey)'

export function FolderGlyph({ color, size = 16 }: { color: FolderColor | null | undefined; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" data-folder-color={color ?? undefined} style={{ flex: 'none', display: 'block' }}>
      <path d="M2.8 7V5.8a2 2 0 0 1 2-2h4.3a2 2 0 0 1 1.5.7l1.4 1.7h7.2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4.8a2 2 0 0 1-2-2z"
        fill={folderPaint(color)} stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M2.8 9.4h18.4" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round" opacity=".45" />
    </svg>
  )
}
