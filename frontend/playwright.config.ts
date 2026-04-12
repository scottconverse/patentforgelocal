import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1, // serialize — shared SQLite DB can't handle concurrent writes
  outputDir: './e2e-results',
  use: {
    baseURL: 'http://localhost:8080',
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
      // Only run navigation and layout tests on mobile — skip form-heavy tests
      testMatch: /navigation\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'cd ../backend && node --env-file=.env dist/main',
      port: 3000,
      timeout: 15_000,
      reuseExistingServer: true,
    },
    {
      command: 'cd ../services/feasibility && node dist/server.js',
      port: 3001,
      timeout: 15_000,
      reuseExistingServer: true,
    },
    {
      command: 'cd ../services/claim-drafter && python -m uvicorn src.server:app --port 3002',
      port: 3002,
      timeout: 15_000,
      reuseExistingServer: true,
    },
    {
      command: 'cd ../services/compliance-checker && python -m uvicorn src.server:app --port 3004',
      port: 3004,
      timeout: 15_000,
      reuseExistingServer: true,
    },
    {
      command: 'npx vite --port 8080 --strictPort',
      port: 8080,
      timeout: 15_000,
      reuseExistingServer: true,
    },
  ],
});
