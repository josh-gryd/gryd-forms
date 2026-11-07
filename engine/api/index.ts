// The forms engine's HTTP app. Only the web app calls it (over 127.0.0.1, see
// server.ts), with the internal secret on every request.

import express from 'express'
import { timingSafeEqual } from 'node:crypto'
import { formsRouter, mountFormsRaw } from '../forms/api.js'

function secretOk(provided: string): boolean {
  const expected = process.env.FORMS_INTERNAL_SECRET || ''
  if (!expected || provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

export function createApiServer(): express.Express {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', false)
  // Upload bytes are streamed, never parsed; this mount checks the secret itself.
  mountFormsRaw(app)
  app.use('/api', (req, res, next) => {
    if (!secretOk(req.get('x-forms-secret') || '')) { res.status(401).json({ error: 'unauthorized' }); return }
    next()
  })
  app.use(express.json({ limit: '25mb' }))
  app.use('/api/forms', formsRouter)
  app.use((_req, res) => { res.status(404).json({ error: 'not found' }) })
  return app
}
