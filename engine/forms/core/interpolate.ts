// Dynamic answer content. Authors never type syntax — the builder's variable
// picker inserts a token that refers to a block by its stable id:
//   {{answer:b_xxxxxxxxxx}}            → the answer, rendered with labels
//   {{answer:b_xxxxxxxxxx|fallback}}   → the fallback when unanswered
// Renaming a question changes nothing; deleting one renders the fallback.

import { componentDef } from './registry'
import type { FormDefinition } from './schema'
import { allBlocks } from './schema'
import type { AnswerMap } from './answers'

export const TOKEN_RE = /\{\{\s*answer:([A-Za-z0-9_\-]+)(?:\|([^}]*))?\s*\}\}/g

export function answerToken(blockId: string, fallback?: string): string {
  return fallback ? `{{answer:${blockId}|${fallback}}}` : `{{answer:${blockId}}}`
}

export function tokensIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(TOKEN_RE)) out.push(m[1])
  return out
}

export function renderTemplate(text: string, def: FormDefinition, answers: AnswerMap): string {
  if (!text || !text.includes('{{')) return text
  const blocks = new Map(allBlocks(def).map(b => [b.id, b]))
  return text.replace(TOKEN_RE, (_m, id: string, fallback?: string) => {
    const block = blocks.get(id)
    if (!block) return fallback ?? ''
    const value = answers[id]
    const rendered = componentDef(block.type).display(block, value)
    return rendered || (fallback ?? '')
  })
}

/** For the builder: swap tokens for a readable preview ("Thanks, {First name}"). */
export function describeTemplate(text: string, def: FormDefinition): string {
  const blocks = new Map(allBlocks(def).map(b => [b.id, b]))
  return text.replace(TOKEN_RE, (_m, id: string) => {
    const block = blocks.get(id)
    return block ? `{${block.label || block.type}}` : '{deleted field}'
  })
}
