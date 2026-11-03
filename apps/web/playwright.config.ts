import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a running stack (default: production images behind Caddy
 * on https://localhost, see deploy/docker-compose.e2e.yml).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  timeout: 60_000,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'https://localhost',
    ignoreHTTPSErrors: true,
    locale: 'de-AT',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
