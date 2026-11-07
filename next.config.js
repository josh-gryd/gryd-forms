/** @type {import('next').NextConfig} */
const nextConfig = {
  // Unit tests run under tsx and are not part of the build.
  typescript: { tsconfigPath: 'tsconfig.build.json' },
  agentRules: false,
  // Dev only: hosted dev environments (Codespaces, Gitpod) serve the app from their own domain.
  allowedDevOrigins: ['127.0.0.1', '*.app.github.dev', '*.gitpod.io', ...(process.env.FORMS_DEV_ORIGINS || '').split(',').filter(Boolean)],
  serverExternalPackages: ['better-sqlite3'],
  skipTrailingSlashRedirect: true,
  async headers() {
    return [{ source: '/fonts/:file*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' }] }]
  },
}

module.exports = nextConfig
