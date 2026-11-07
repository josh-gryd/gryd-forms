// Object storage for respondent files and builder assets. Two drivers behind
// one interface:
//   s3     any S3-compatible bucket (AWS S3, Cloudflare R2, Tigris) when
//          BUCKET_NAME and AWS_* are set; keys live under a `forms/` prefix
//   local  a directory next to the SQLite file, for dev and tests
// Bytes never touch the database. The browser uploads either straight to the
// bucket with a presigned PUT (transport=direct, needs bucket CORS) or through
// the dashboard → engine proxy (transport=proxy, the default until CORS is
// verified in production).

import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { config } from '../config.js'
import { formsLog } from './log'

export interface UploadTarget { method: 'PUT'; url: string; headers: Record<string, string>; transport: 'direct' | 'proxy' }
export interface ObjectInfo { size: number; contentType: string }

export interface StorageDriver {
  readonly kind: 'local' | 's3'
  readonly transport: 'direct' | 'proxy'
  /** Where the browser PUTs bytes for `key`. `proxyUrl` is the dashboard path used when transport=proxy. */
  uploadTarget(key: string, opts: { contentType: string; contentLength: number; proxyUrl: string }): Promise<UploadTarget>
  putStream(key: string, body: Readable, opts: { contentType: string; maxBytes: number }): Promise<ObjectInfo>
  head(key: string): Promise<ObjectInfo | null>
  getStream(key: string): Promise<{ stream: Readable; info: ObjectInfo } | null>
  /** A short-lived URL a browser can be redirected to, or null when the caller must stream. */
  downloadUrl(key: string, opts: { filename: string; contentType: string; expiresSec: number }): Promise<string | null>
  delete(key: string): Promise<void>
}

export class BytesLimitError extends Error {
  constructor(public readonly max: number) { super(`upload larger than ${max} bytes`) }
}

/** Reads a stream while counting; aborts once `max` is exceeded. */
async function collectLimited(body: Readable, max: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  // destroyOnReturn: false — leaving the loop early must not tear down the
  // request socket; the caller drains what is left and answers cleanly.
  for await (const chunk of body.iterator({ destroyOnReturn: false })) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > max) throw new BytesLimitError(max)
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}

function safeKey(key: string): string {
  if (!/^[A-Za-z0-9_\-./]{1,300}$/.test(key) || key.includes('..')) throw new Error('bad storage key')
  return key
}

// ── Local ────────────────────────────────────────────────────────────────────

export class LocalStorage implements StorageDriver {
  readonly kind = 'local' as const
  readonly transport = 'proxy' as const
  constructor(private readonly dir: string) { fs.mkdirSync(dir, { recursive: true }) }

  private pathFor(key: string): string { return path.join(this.dir, safeKey(key)) }
  private metaFor(key: string): string { return this.pathFor(key) + '.meta.json' }

  async uploadTarget(_key: string, opts: { contentType: string; contentLength: number; proxyUrl: string }): Promise<UploadTarget> {
    return { method: 'PUT', url: opts.proxyUrl, headers: { 'content-type': opts.contentType || 'application/octet-stream' }, transport: 'proxy' }
  }
  async putStream(key: string, body: Readable, opts: { contentType: string; maxBytes: number }): Promise<ObjectInfo> {
    const buf = await collectLimited(body, opts.maxBytes)
    const p = this.pathFor(key)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    const tmp = `${p}.part-${process.pid}-${Date.now()}`
    fs.writeFileSync(tmp, buf)
    fs.renameSync(tmp, p)
    fs.writeFileSync(this.metaFor(key), JSON.stringify({ contentType: opts.contentType, size: buf.length }))
    return { size: buf.length, contentType: opts.contentType }
  }
  async head(key: string): Promise<ObjectInfo | null> {
    const p = this.pathFor(key)
    if (!fs.existsSync(p)) return null
    const size = fs.statSync(p).size
    let contentType = 'application/octet-stream'
    try { contentType = JSON.parse(fs.readFileSync(this.metaFor(key), 'utf8')).contentType || contentType } catch { /* no meta */ }
    return { size, contentType }
  }
  async getStream(key: string) {
    const info = await this.head(key)
    if (!info) return null
    // Open eagerly so a missing file fails here, not later on an unread stream.
    const fd = fs.openSync(this.pathFor(key), 'r')
    return { stream: fs.createReadStream('', { fd, autoClose: true }), info }
  }
  async downloadUrl(): Promise<string | null> { return null }
  async delete(key: string): Promise<void> {
    for (const p of [this.pathFor(key), this.metaFor(key)]) { try { fs.unlinkSync(p) } catch { /* already gone */ } }
  }
}

// ── S3 / Tigris ──────────────────────────────────────────────────────────────

export interface S3Options {
  bucket: string
  region: string
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  transport: 'direct' | 'proxy'
}

export class S3Storage implements StorageDriver {
  readonly kind = 's3' as const
  readonly transport: 'direct' | 'proxy'
  private clientPromise: Promise<any> | null = null
  constructor(private readonly opts: S3Options) { this.transport = opts.transport }

  private async client(): Promise<any> {
    if (!this.clientPromise) {
      this.clientPromise = import('@aws-sdk/client-s3').then(({ S3Client }) => new S3Client({
        region: this.opts.region || 'auto',
        endpoint: this.opts.endpoint || undefined,
        forcePathStyle: true,
        credentials: { accessKeyId: this.opts.accessKeyId, secretAccessKey: this.opts.secretAccessKey },
      }))
    }
    return this.clientPromise
  }

  async uploadTarget(key: string, opts: { contentType: string; contentLength: number; proxyUrl: string }): Promise<UploadTarget> {
    if (this.transport === 'proxy') return { method: 'PUT', url: opts.proxyUrl, headers: { 'content-type': opts.contentType || 'application/octet-stream' }, transport: 'proxy' }
    const [{ PutObjectCommand }, { getSignedUrl }] = await Promise.all([import('@aws-sdk/client-s3'), import('@aws-sdk/s3-request-presigner')])
    const cmd = new PutObjectCommand({ Bucket: this.opts.bucket, Key: safeKey(key), ContentType: opts.contentType || 'application/octet-stream', ContentLength: opts.contentLength })
    const url = await getSignedUrl(await this.client(), cmd, { expiresIn: 900 })
    return { method: 'PUT', url, headers: { 'content-type': opts.contentType || 'application/octet-stream' }, transport: 'direct' }
  }

  async putStream(key: string, body: Readable, opts: { contentType: string; maxBytes: number }): Promise<ObjectInfo> {
    const buf = await collectLimited(body, opts.maxBytes)
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    await (await this.client()).send(new PutObjectCommand({ Bucket: this.opts.bucket, Key: safeKey(key), Body: buf, ContentType: opts.contentType || 'application/octet-stream', ContentLength: buf.length }))
    return { size: buf.length, contentType: opts.contentType }
  }

  async head(key: string): Promise<ObjectInfo | null> {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3')
    try {
      const res = await (await this.client()).send(new HeadObjectCommand({ Bucket: this.opts.bucket, Key: safeKey(key) }))
      return { size: Number(res.ContentLength ?? 0), contentType: String(res.ContentType ?? 'application/octet-stream') }
    } catch (err) {
      const name = (err as { name?: string })?.name
      if (name === 'NotFound' || name === 'NoSuchKey' || (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404) return null
      throw err
    }
  }

  async getStream(key: string) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    try {
      const res = await (await this.client()).send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: safeKey(key) }))
      const body = res.Body as Readable | undefined
      if (!body) return null
      const stream = body instanceof Readable ? body : Readable.fromWeb(body as any)
      return { stream, info: { size: Number(res.ContentLength ?? 0), contentType: String(res.ContentType ?? 'application/octet-stream') } }
    } catch (err) {
      const name = (err as { name?: string })?.name
      if (name === 'NotFound' || name === 'NoSuchKey') return null
      throw err
    }
  }

  async downloadUrl(key: string, opts: { filename: string; contentType: string; expiresSec: number }): Promise<string | null> {
    const [{ GetObjectCommand }, { getSignedUrl }] = await Promise.all([import('@aws-sdk/client-s3'), import('@aws-sdk/s3-request-presigner')])
    const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(opts.filename)}`
    const cmd = new GetObjectCommand({ Bucket: this.opts.bucket, Key: safeKey(key), ResponseContentDisposition: disposition, ResponseContentType: opts.contentType || undefined })
    return getSignedUrl(await this.client(), cmd, { expiresIn: opts.expiresSec })
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3')
    await (await this.client()).send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: safeKey(key) }))
  }

  /** Direct uploads need the bucket to accept browser PUTs from the portal origin. Idempotent. */
  async ensureCors(origins: string[]): Promise<void> {
    const { PutBucketCorsCommand } = await import('@aws-sdk/client-s3')
    await (await this.client()).send(new PutBucketCorsCommand({
      Bucket: this.opts.bucket,
      CORSConfiguration: { CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ['PUT', 'GET', 'HEAD'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3600 }] },
    }))
  }
}

// ── Selection ────────────────────────────────────────────────────────────────

let driver: StorageDriver | null = null

export function storageConfig(): { kind: 'local' | 's3'; transport: 'direct' | 'proxy'; dir: string; prefix: string } {
  const env = process.env
  const hasS3 = !!(env.BUCKET_NAME && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY)
  const kind: 'local' | 's3' = env.FORMS_STORAGE === 'local' ? 'local' : env.FORMS_STORAGE === 's3' ? 's3' : hasS3 ? 's3' : 'local'
  const transport: 'direct' | 'proxy' = env.FORMS_UPLOAD_TRANSPORT === 'direct' ? 'direct' : 'proxy'
  const dbPath = env.DB_PATH || config.dbPath
  const dir = env.FORMS_STORAGE_DIR || (dbPath === ':memory:' ? path.join(process.cwd(), '.test-files') : path.join(config.dataDir, 'files'))
  return { kind, transport, dir, prefix: (env.FORMS_S3_PREFIX || 'forms').replace(/\/+$/, '') }
}

export function getStorage(): StorageDriver {
  if (driver) return driver
  const cfg = storageConfig()
  if (cfg.kind === 's3') {
    driver = new S3Storage({
      bucket: process.env.BUCKET_NAME!, region: process.env.AWS_REGION || 'auto', endpoint: process.env.AWS_ENDPOINT_URL_S3 || '',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!, transport: cfg.transport,
    })
    formsLog.info('storage', { kind: 's3', transport: cfg.transport, prefix: cfg.prefix })
  } else {
    driver = new LocalStorage(cfg.dir)
    formsLog.info('storage', { kind: 'local', dir: cfg.dir })
  }
  return driver
}

/** Tests swap the driver; production never calls this. */
export function setStorageForTests(d: StorageDriver | null): void { driver = d }

export function fileKey(formId: string, fileId: string, ext: string): string {
  const safeExt = /^[a-z0-9]{1,8}$/i.test(ext) ? `.${ext.toLowerCase()}` : ''
  return `${storageConfig().prefix}/files/${formId}/${fileId}${safeExt}`
}
export function assetKey(formId: string, assetId: string, ext: string): string {
  const safeExt = /^[a-z0-9]{1,8}$/i.test(ext) ? `.${ext.toLowerCase()}` : ''
  return `${storageConfig().prefix}/assets/${formId}/${assetId}${safeExt}`
}

export { pipeline }
