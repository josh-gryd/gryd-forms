/** Horizontal shift (in px) that keeps an anchored popover fully on screen
 *  within an 8px gutter — positive moves it right, negative left, 0 leaves it
 *  where its anchor put it. Pulled out as a pure function so the off-screen
 *  regression (a right-anchored filter panel clipping off the left edge on a
 *  phone) can be pinned without a DOM; the component feeds it live layout
 *  metrics. Left-edge visibility wins when the panel is wider than the gutters
 *  allow, so the top of the panel is never the part that gets cut. */
export function clampPopoverDx(
  naturalLeft: number, width: number, viewportWidth: number, gutter = 8,
): number {
  let dx = 0
  if (naturalLeft + width > viewportWidth - gutter) dx = (viewportWidth - gutter) - (naturalLeft + width)
  if (naturalLeft + dx < gutter) dx = gutter - naturalLeft
  return Math.round(dx)
}
