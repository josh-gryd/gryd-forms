// One process, two listeners: the forms engine on 127.0.0.1 only (never
// exposed), and the web app (portal + public forms) on PORT. The web app
// reaches the engine through lib/engine-fetch.ts with a secret made at boot.

import crypto from 'node:crypto'
import { createServer } from 'node:http'
import next from 'next'

const dev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development'
const port = Number(process.env.PORT || 3000)
const enginePort = Number(process.env.FORMS_ENGINE_PORT || port + 1)

process.env.FORMS_ENGINE_PORT = String(enginePort)
process.env.FORMS_INTERNAL_SECRET = crypto.randomBytes(32).toString('hex')

async function main() {
  const { createApiServer } = await import('./engine/api/index.js')
  const { getDb } = await import('./engine/db/index.js')
  const { startFormsMaintenance } = await import('./engine/forms/service.js')
  const { config, appSecret } = await import('./engine/config.js')

  getDb()
  appSecret()
  startFormsMaintenance()
  await new Promise<void>(resolve => createApiServer().listen(enginePort, '127.0.0.1', () => resolve()))

  const app = next({ dev, dir: process.cwd(), hostname: 'localhost', port })
  await app.prepare()
  const handle = app.getRequestHandler()
  const server = createServer((req, res) => { void handle(req, res) })
  // Dev hot reload runs over a websocket upgrade.
  const upgrade = app.getUpgradeHandler()
  server.on('upgrade', (req, socket, head) => { void upgrade(req, socket, head) })
  server.listen(port, () => {
    console.log(`[forms] ready on http://localhost:${port} (data: ${config.dataDir})`)
    if (!process.env.FORMS_ADMIN_PASSWORD) {
      console.log(dev ? '[forms] FORMS_ADMIN_PASSWORD is not set: the portal is open (development only).' : '[forms] FORMS_ADMIN_PASSWORD is not set: nobody can sign in until you set it.')
    }
  })
}

main().catch(err => { console.error(err); process.exit(1) })
