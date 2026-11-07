// EmojiTile — the v2 icon language for places: apps, pages, folders. Sizes,
// borders, radii, shadows and the optical nudges are the design system's own
// (GRYD2.EmojiTile). The shadow is the bare hard offset in both themes, never
// --el-1, whose dark gold glow would halo a small tile.

import React from 'react'

type Size = 'xl' | 'lg' | 'md' | 'sm'

const SIZES: Record<Size, [number, number, number, string, string]> = {
  xl: [46, 21, 2, 'var(--r-control)', '3px 3px 0 var(--ink)'],
  lg: [38, 19, 2, 'var(--r-control)', '2px 2px 0 var(--ink)'],
  md: [28, 15, 1.5, 'var(--r-chip)', '2px 2px 0 var(--ink)'],
  sm: [26, 14, 1.5, 'var(--r-chip-sm)', '2px 2px 0 var(--ink)'],
}

const NUDGE: Record<string, [number, number]> = {
  '📥': [0.045, 0.03], '📤': [0.045, 0.03], '🤝': [0, -0.035], '🎬': [0.02, 0], '📎': [0, -0.02],
}

const EMOJI_FONT = "var(--font-emoji, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif)"

export function tileStyle(size: Size, bg: string, raised = true): React.CSSProperties {
  const d = SIZES[size]
  return {
    display: 'grid', placeItems: 'center', width: d[0], height: d[0], padding: 0, flex: 'none',
    boxSizing: 'border-box', border: `${d[2]}px solid var(--ink)`, borderRadius: d[3],
    background: bg, boxShadow: raised ? d[4] : 'none',
  }
}

export function Glyph({ emoji, size }: { emoji: string; size: Size }) {
  const n = NUDGE[emoji]
  return (
    <span aria-hidden="true" style={{
      display: 'block', fontFamily: EMOJI_FONT, fontSize: SIZES[size][1], lineHeight: 1,
      transform: n ? `translate(${n[0]}em, ${n[1]}em)` : undefined,
    }}>{emoji}</span>
  )
}

export default function EmojiTile({ emoji, size = 'md', bg = 'var(--card)', raised = true, style }: {
  emoji: string; size?: Size; bg?: string; raised?: boolean; style?: React.CSSProperties
}) {
  return (
    <span aria-hidden="true" style={{ ...tileStyle(size, bg, raised), ...style }}>
      <Glyph emoji={emoji} size={size} />
    </span>
  )
}
