/**
 * Playwright config for testing against the INSTALLED binary (port 3000).
 * All services must already be running — no webServer entries here.
 * Usage: node node_modules/@playwright/test/cli.js test --config=playwright.installed.config.ts
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  outputDir: './e2e-results-installed',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'on',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-chromium',
      use: { browserName: 'chromium', viewport: { width: 375, height: 812 } },
      testMatch: /navigation\.spec\.ts/,
    },
  ],
  // No webServer — reuse already-running installed services
});
