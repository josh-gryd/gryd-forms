// The S3 driver against a tiny S3-shaped HTTP server: proves the request
// shapes (path-style bucket/key, PUT/HEAD/GET/DELETE), the presigned URL
// form, and the size limit — without a real bucket. Signatures are not
// verified here; that part is the SDK's job.
process.env.FORMS_MAINTENANCE = '0'

import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { Readable } from 'node:stream'
import { S3Storage, LocalStorage, BytesLimitError } from './storage'

function mockS3(): Promise<{ url: string; objects: Map<string, { body: Buffer; type: string }>; close: () => void; requests: string[] }> {
  const objects = new Map<string, { body: Buffer; type: string }>()
  const requests: string[] = []
  const server = http.createServer((req, res) => {
    const key = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^\/[^/]+\//, ''))
    requests.push(`${req.method} ${req.url}`)
    if (req.method === 'PUT') {
      const chunks: Buffer[] = []
      req.on('data', c => chunks.push(c)); req.on('end', () => { objects.set(key, { body: Buffer.concat(chunks), type: String(req.headers['content-type'] ?? '') }); res.setHeader('ETag', '"x"'); res.end() })
      return
    }
    const obj = objects.get(key)
    if (req.method === 'HEAD' || req.method === 'GET') {
      if (!obj) { res.statusCode = 404; res.end(); return }
      res.setHeader('content-length', String(obj.body.length)); res.setHeader('content-type', obj.type)
      if (req.method === 'HEAD') res.end(); else res.end(obj.body)
      return
    }
    if (req.method === 'DELETE') { objects.delete(key); res.statusCode = 204; res.end(); return }
    res.statusCode = 400; res.end()
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const addr = server.address() as { port: number }
    resolve({ url: `http://127.0.0.1:${addr.port}`, objects, close: () => server.close(), requests })
  }))
}

test('s3 driver: put/head/get/delete via path-style keys; presigned urls; size cap', async () => {
  const mock = await mockS3()
  try {
    const s3 = new S3Storage({ bucket: 'gryd-test', region: 'auto', endpoint: mock.url, accessKeyId: 'AK', secretAccessKey: 'SK', transport: 'direct' })
    const info = await s3.putStream('forms/files/frm_1/fil_1.pdf', Readable.from(Buffer.from('hello')), { contentType: 'application/pdf', maxBytes: 100 })
    assert.equal(info.size, 5)
    assert.ok(mock.objects.has('forms/files/frm_1/fil_1.pdf'))
    assert.ok(mock.requests.some(r => r.startsWith('PUT /gryd-test/forms/files/frm_1/fil_1.pdf')), 'path-style bucket in the url')
    const head = await s3.head('forms/files/frm_1/fil_1.pdf')
    assert.deepEqual(head, { size: 5, contentType: 'application/pdf' })
    assert.equal(await s3.head('forms/files/frm_1/missing.pdf'), null)
    const got = await s3.getStream('forms/files/frm_1/fil_1.pdf')
    const chunks: Buffer[] = []; for await (const c of got!.stream) chunks.push(Buffer.from(c))
    assert.equal(Buffer.concat(chunks).toString(), 'hello')
    const target = await s3.uploadTarget('forms/files/frm_1/fil_2.pdf', { contentType: 'application/pdf', contentLength: 10, proxyUrl: '/proxy' })
    assert.equal(target.transport, 'direct')
    assert.ok(target.url.startsWith(`${mock.url}/gryd-test/forms/files/frm_1/fil_2.pdf?`), target.url)
    assert.ok(target.url.includes('X-Amz-Signature='))
    const dl = await s3.downloadUrl('forms/files/frm_1/fil_1.pdf', { filename: 'my file.pdf', contentType: 'application/pdf', expiresSec: 300 })
    assert.ok(dl && dl.includes('response-content-disposition=') && dl.includes('X-Amz-Expires=300'))
    await assert.rejects(s3.putStream('forms/files/frm_1/big.bin', Readable.from(Buffer.alloc(200)), { contentType: 'x', maxBytes: 100 }), (e: unknown) => e instanceof BytesLimitError)
    await s3.delete('forms/files/frm_1/fil_1.pdf')
    assert.equal(mock.objects.has('forms/files/frm_1/fil_1.pdf'), false)
    const proxied = new S3Storage({ bucket: 'gryd-test', region: 'auto', endpoint: mock.url, accessKeyId: 'AK', secretAccessKey: 'SK', transport: 'proxy' })
    assert.equal((await proxied.uploadTarget('k', { contentType: 'x', contentLength: 1, proxyUrl: '/proxy/k' })).url, '/proxy/k')
  } finally { mock.close() }
})

test('local driver round-trips and refuses path escapes', async () => {
  const dir = `/tmp/forms-storage-test-${process.pid}`
  const local = new LocalStorage(dir)
  await local.putStream('forms/files/a/b.txt', Readable.from(Buffer.from('hi')), { contentType: 'text/plain', maxBytes: 10 })
  assert.deepEqual(await local.head('forms/files/a/b.txt'), { size: 2, contentType: 'text/plain' })
  await assert.rejects(local.head('../../etc/passwd'), /bad storage key/)
  await local.delete('forms/files/a/b.txt')
  assert.equal(await local.head('forms/files/a/b.txt'), null)
})
