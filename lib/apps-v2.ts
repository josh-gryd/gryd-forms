// The frame each route wears: which app's colours, and what the sidebar's
// switcher card names. One app here.

import { APPS, type AppDef, type AppPage } from './apps'

export type V2AppId = 'forms'

export interface V2RailApp { id: V2AppId; name: string; emoji: string; href: string }

export const V2_EMOJI = { apps: { forms: '📝' } }

export const V2_RAIL: V2RailApp[] = [{ id: 'forms', name: 'Forms', emoji: '📝', href: '/forms' }]

export interface V2Frame {
  theme: V2AppId
  rail: V2AppId | null
  name: string
  emoji: string
  kind: string
  source: AppDef
  pages: AppPage[]
}

export function v2FrameFor(_pathname: string, v1: AppDef = APPS[0]): V2Frame {
  return { theme: 'forms', rail: 'forms', name: 'Forms', emoji: V2_EMOJI.apps.forms, kind: 'app', source: v1, pages: v1.pages }
}
