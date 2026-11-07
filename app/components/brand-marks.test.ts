// Brand marks are drawn for a white ground. They sat on `--on-fill`, which is
// near-black in the light theme, so HubSpot, Slack and Gmail read as dark tiles.

import { test } from 'node:test'
import { strict as assert } from 'node:assert'

import { BRAND_SVG_MARKUP, FULL_BLEED_MARKS, MARK_TILE_BG, appIconTileMarkup } from './brand-marks'

test('a bundled brand mark sits on a white tile, never on --on-fill', () => {
  for (const app of ['HubSpot', 'Slack', 'Gmail']) {
    const html = appIconTileMarkup(app, 18, 'Hs', '#eee', '#111')
    assert.ok(html.includes(`background:${MARK_TILE_BG}`), `${app} tile is white`)
    assert.ok(!html.includes('var(--on-fill)'), `${app} tile does not use --on-fill`)
  }
})

test('Jira is a blue tile with a white glyph, drawn edge to edge', () => {
  assert.ok(FULL_BLEED_MARKS.has('jira'))
  const mark = BRAND_SVG_MARKUP.jira(20)
  assert.match(mark, /#0052CC/)
  assert.match(mark, /#2684FF/)
  assert.match(mark, /fill="#fff"/)
})
