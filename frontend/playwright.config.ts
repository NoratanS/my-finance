import { defineConfig } from '@playwright/test';

// Assumes the backend is already running on :8080 (the Vite dev server
// proxies /api there). Browsers come from PLAYWRIGHT_BROWSERS_PATH.
// The suite needs an instance with no profiles, and leaves it that way
// (e2e/global-setup.ts, which refuses any other instance).
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
