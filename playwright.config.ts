import { defineConfig, devices } from '@playwright/test'

// End-to-end tests for Forms against the local harness (scripts/forms-dev.sh):
// engine :3102 with a throwaway SQLite, dashboard :3100 with auth off.
// A production-mode dashboard (FORMS_DASH_MODE=start) always enforces sign-in:
// point FORMS_STORAGE_STATE at a storage state holding a locally minted session
// (e2e/forms/mint-session.cjs) to run the same suite against it.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: process.env.FORMS_BASE_URL || 'http://127.0.0.1:3000',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    storageState: 'test-results/.auth.json',
    ...(process.env.PLAYWRIGHT_CHROMIUM ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
})
