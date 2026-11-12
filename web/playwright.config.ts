import { defineConfig, devices } from '@playwright/test'

// The post-deploy smoke against prod (ADR 0005); deploy.yml sets SMOKE_URL.
export default defineConfig({
  testDir: 'e2e',
  retries: 1,
  // A cold Vercel function can take seconds to answer the first request.
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.SMOKE_URL,
    // The smoke user's password is typed, so nothing that could record it.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
