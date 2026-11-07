'use client'

import { createContext, useContext } from 'react'
import { DS_DEFAULT, type DesignSystem } from '@/lib/design-system'

// The root layout reads the gryd-ds cookie on the server and hands the answer
// down here, so every shell component renders the right system on the first
// paint — reading <html data-ds> in an effect would flash the other one.
const DSContext = createContext<DesignSystem>(DS_DEFAULT)

export function DSProvider({ ds, children }: { ds: DesignSystem; children: React.ReactNode }) {
  return <DSContext.Provider value={ds}>{children}</DSContext.Provider>
}

export function useDS(): DesignSystem {
  return useContext(DSContext)
}
