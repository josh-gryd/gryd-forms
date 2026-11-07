// Row grouping: consecutive blocks with the same width share a row until it
// holds 1 / 2 / 3 blocks (full / half / third). A block never spans rows and
// nothing is positioned absolutely, so a broken responsive form is hard to make.

import type { Block, BlockWidth, Page } from './schema'

export const WIDTH_CAP: Record<BlockWidth, number> = { full: 1, half: 2, third: 3 }

export interface Row { id: string; cap: number; blocks: Block[] }

export function rowsOf(blocks: Block[]): Row[] {
  const rows: Row[] = []
  let cur: Row | null = null
  for (const b of blocks) {
    const cap = WIDTH_CAP[b.width] ?? 1
    if (!cur || cur.cap !== cap || cur.blocks.length >= cap) {
      cur = { id: `row_${b.id}`, cap, blocks: [] }
      rows.push(cur)
    }
    cur.blocks.push(b)
  }
  return rows
}

/** The blocks a section "owns": everything after it up to the next section. */
export function sectionMembers(page: Page, sectionId: string): string[] {
  const i = page.blocks.findIndex(b => b.id === sectionId)
  if (i < 0) return []
  const out: string[] = []
  for (let j = i + 1; j < page.blocks.length; j++) {
    if (page.blocks[j].type === 'section') break
    out.push(page.blocks[j].id)
  }
  return out
}

/** Spacing per the handoff §2.3: gap between rows/columns and container padding. */
export function spacingFor(spacing: 'compact' | 'comfortable' | 'airy'): { gap: number; pad: number } {
  if (spacing === 'compact') return { gap: 16, pad: 28 }
  if (spacing === 'airy') return { gap: 34, pad: 56 }
  return { gap: 24, pad: 40 }
}
