import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the production build (`vite preview`), so the
// Content Security Policy and the bundled pdf.js assets are exercised too.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173/frfpdf/',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173/frfpdf/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
