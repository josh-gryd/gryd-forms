'use client'

// Client side of file uploads. A pick starts immediately, shows progress,
// and touches nothing but its own field: a failure leaves the rest of the
// form exactly as it was. The transport is injected so the same controller
// serves the live form (real storage) and the builder's preview (no server).

import { useCallback, useMemo, useRef, useState } from 'react'
import { fileGate, uploadSettings, errorsFor, uiFor, withLanguage, type Block, type FileAnswer, type AnswerValue, type FormLanguage } from '@/lib/forms-core/index'
import type { UploadController, UploadItemState } from './registry'

export type UploadControllerEx = UploadController & { busy: (blockId: string) => boolean; failed: (blockId: string) => boolean }

export interface UploadGrant { fileId: string; uploadToken: string; put: { url: string; headers?: Record<string, string> } }
export interface UploadTransport {
  create(block: Block, file: File): Promise<UploadGrant>
  complete(fileId: string, uploadToken: string): Promise<void>
  cancel(fileId: string, uploadToken: string): Promise<void>
}

interface Live { file: File; block: Block; xhr: XMLHttpRequest | null; token: string | null; cancelled: boolean }


let seq = 0

export function useUploads(transport: UploadTransport | null, getValue: (blockId: string) => AnswerValue | undefined, setValue: (blockId: string, v: AnswerValue) => void, onFieldError?: (blockId: string, message: string) => void, lang: FormLanguage = 'en'): UploadControllerEx {
  const ERR = useMemo(() => errorsFor(lang), [lang])
  const droppedAt = useCallback((pct: number) => uiFor(lang).fields.uploadDropped(Math.max(0, Math.min(99, pct))), [lang])
  const [pending, setPending] = useState<Record<string, UploadItemState[]>>({})
  const live = useRef(new Map<string, Live>())

  const patch = useCallback((blockId: string, fileId: string, fn: (it: UploadItemState) => UploadItemState | null) => {
    setPending(prev => {
      const list = prev[blockId] ?? []
      const next = list.map(it => (it.fileId === fileId ? fn(it) : it)).filter((x): x is UploadItemState => x !== null)
      return { ...prev, [blockId]: next }
    })
  }, [])

  const addDone = useCallback((blockId: string, fa: FileAnswer) => {
    const cur = getValue(blockId)
    const list = Array.isArray(cur) ? (cur as FileAnswer[]).filter(x => x && typeof x === 'object' && 'fileId' in x) : []
    setValue(blockId, [...list, fa])
  }, [getValue, setValue])

  const start = useCallback(async (block: Block, file: File, reuseId?: string) => {
    const tempId = reuseId ?? `up_${++seq}`
    const entry: Live = { file, block, xhr: null, token: null, cancelled: false }
    live.current.set(tempId, entry)
    setPending(prev => {
      const list = (prev[block.id] ?? []).filter(it => it.fileId !== tempId)
      return { ...prev, [block.id]: [...list, { fileId: tempId, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', status: 'busy', pct: 0 }] }
    })
    if (!transport) {
      // Preview: no server. Walk the progress bar so the flow can be tried, then keep the file on this device only.
      for (const pct of [30, 65, 100]) {
        await new Promise(r => setTimeout(r, 160))
        if (entry.cancelled) return
        patch(block.id, tempId, it => ({ ...it, pct }))
      }
      patch(block.id, tempId, () => null)
      live.current.delete(tempId)
      addDone(block.id, { fileId: `preview_${tempId}`, name: file.name, size: file.size, mime: file.type || 'application/octet-stream' })
      return
    }
    let grant: UploadGrant
    try { grant = await transport.create(block, file) } catch (err) {
      if (entry.cancelled) return
      patch(block.id, tempId, it => ({ ...it, status: 'failed', error: (err as Error).message || ERR.uploadFailed }))
      return
    }
    if (entry.cancelled) { transport.cancel(grant.fileId, grant.uploadToken).catch(() => undefined); return }
    entry.token = grant.uploadToken
    live.current.delete(tempId)
    live.current.set(grant.fileId, entry)
    patch(block.id, tempId, it => ({ ...it, fileId: grant.fileId, uploadToken: grant.uploadToken }))
    const xhr = new XMLHttpRequest()
    entry.xhr = xhr
    let lastPct = 0
    await new Promise<void>(resolve => {
      xhr.upload.onprogress = e => { if (e.lengthComputable) { lastPct = Math.round((e.loaded / e.total) * 100); patch(block.id, grant.fileId, it => ({ ...it, pct: Math.min(99, lastPct) })) } }
      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            await transport.complete(grant.fileId, grant.uploadToken)
            patch(block.id, grant.fileId, () => null)
            live.current.delete(grant.fileId)
            addDone(block.id, { fileId: grant.fileId, name: file.name, size: file.size, mime: file.type || 'application/octet-stream' })
          } catch (err) {
            patch(block.id, grant.fileId, it => ({ ...it, status: 'failed', error: (err as Error).message || ERR.uploadFailed }))
          }
        } else {
          let msg = ERR.uploadFailed
          try { const j = JSON.parse(xhr.responseText); if (j && typeof j.error === 'string') msg = j.error } catch { /* not json */ }
          patch(block.id, grant.fileId, it => ({ ...it, status: 'failed', error: msg }))
        }
        resolve()
      }
      xhr.onerror = () => { patch(block.id, grant.fileId, it => ({ ...it, status: 'failed', error: droppedAt(lastPct) })); resolve() }
      xhr.ontimeout = () => { patch(block.id, grant.fileId, it => ({ ...it, status: 'failed', error: droppedAt(lastPct) })); resolve() }
      xhr.onabort = () => resolve()
      xhr.open('PUT', grant.put.url)
      xhr.timeout = 180_000
      for (const [k, v] of Object.entries(grant.put.headers ?? {})) xhr.setRequestHeader(k, v)
      if (!grant.put.headers || !('content-type' in grant.put.headers)) xhr.setRequestHeader('content-type', file.type || 'application/octet-stream')
      xhr.send(file)
    })
  }, [transport, patch, addDone, ERR, droppedAt])

  const pick = useCallback((block: Block, files: FileList | File[]) => {
    const s = uploadSettings(block.settings)
    const cur = getValue(block.id)
    const have = (Array.isArray(cur) ? cur.length : 0) + (pending[block.id]?.filter(i => i.status === 'busy').length ?? 0)
    const list = Array.from(files)
    if (have + list.length > s.maxFiles) { onFieldError?.(block.id, ERR.tooManyFiles(s.maxFiles)); return }
    for (const file of list) {
      const gate = withLanguage(lang, () => fileGate(block, { name: file.name, size: file.size }))
      if (gate) { onFieldError?.(block.id, gate); continue }
      void start(block, file)
    }
  }, [getValue, pending, onFieldError, start, ERR, lang])

  const cancel = useCallback((block: Block, fileId: string) => {
    const entry = live.current.get(fileId)
    if (entry) {
      entry.cancelled = true
      entry.xhr?.abort()
      if (entry.token && transport) transport.cancel(fileId, entry.token).catch(() => undefined)
      live.current.delete(fileId)
    }
    patch(block.id, fileId, () => null)
  }, [patch, transport])

  const remove = useCallback((block: Block, fileId: string) => {
    const entry = live.current.get(fileId)
    if (entry) { if (entry.token && transport) transport.cancel(fileId, entry.token).catch(() => undefined); live.current.delete(fileId) }
    patch(block.id, fileId, () => null)
    const cur = getValue(block.id)
    if (Array.isArray(cur)) setValue(block.id, (cur as FileAnswer[]).filter(f => f.fileId !== fileId))
  }, [patch, getValue, setValue, transport])

  const retry = useCallback((block: Block, fileId: string) => {
    const entry = live.current.get(fileId)
    if (!entry) { patch(block.id, fileId, () => null); return }
    if (entry.token && transport) transport.cancel(fileId, entry.token).catch(() => undefined)
    live.current.delete(fileId)
    patch(block.id, fileId, () => null)
    void start(block, entry.file)
  }, [patch, start, transport])

  const items = useCallback((blockId: string): UploadItemState[] => {
    const cur = getValue(blockId)
    const done: UploadItemState[] = Array.isArray(cur) ? (cur as FileAnswer[]).filter(f => f && typeof f === 'object' && 'fileId' in f).map(f => ({ fileId: f.fileId, name: f.name, size: f.size, mime: f.mime, status: 'done', pct: 100 })) : []
    return [...done, ...(pending[blockId] ?? [])]
  }, [getValue, pending])

  const busy = useCallback((blockId: string) => (pending[blockId] ?? []).some(i => i.status === 'busy'), [pending])
  const failed = useCallback((blockId: string) => (pending[blockId] ?? []).some(i => i.status === 'failed'), [pending])

  return useMemo<UploadControllerEx>(() => ({ items, pick, cancel, remove, retry, busy, failed }), [items, pick, cancel, remove, retry, busy, failed])
}
