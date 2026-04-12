/**
 * Shared Playwright fixtures for PatentForge E2E tests.
 *
 * Every test automatically gets:
 * 1. Disclaimer modal dismissed (via localStorage)
 * 2. Console error/warning collection — test FAILS if any errors found
 * 3. Screenshot on every test completion (pass or fail) saved to e2e-screenshots/
 *
 * Usage: import { test, expect } from './fixtures' instead of '@playwright/test'
 */

import { test as base, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.join(__dirname, '..', 'e2e-screenshots');

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

/** Console messages collected during a test */
interface ConsoleEntry {
  type: string;
  text: string;
  url: string;
}

/**
 * Extended test fixture that adds automatic console checking and screenshots.
 */
export const test = base.extend<{
  consoleErrors: ConsoleEntry[];
}>({
  // Auto-dismiss disclaimer modal
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      localStorage.setItem('patentforge_disclaimer_accepted', new Date().toISOString());
    });
    await use(page);
  },

  // Collect console errors/warnings throughout the test
  consoleErrors: async ({ page }, use, testInfo) => {
    const errors: ConsoleEntry[] = [];

    page.on('console', (msg) => {
      const type = msg.type();
      // Collect errors and warnings (skip known React dev warnings)
      if (type === 'error' || type === 'warning') {
        const text = msg.text();
        // Skip known benign warnings
        if (text.includes('was not wrapped in act(')) return; // React testing noise
        if (text.includes('Download the React DevTools')) return;
        if (text.includes('esbuild') && text.includes('deprecated')) return; // Vite deprecation
        if (text.includes('Blocked script execution')) return; // Chromium sandbox iframe warning
        if (text.includes('about:srcdoc')) return; // iframe srcdoc sandbox noise
        errors.push({ type, text, url: page.url() });
      }
    });

    // Collect uncaught page errors (JS exceptions)
    page.on('pageerror', (err) => {
      errors.push({ type: 'pageerror', text: err.message, url: page.url() });
    });

    await use(errors);

    // After test: take screenshot
    const screenshotName = testInfo.title
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    const status = testInfo.status === 'passed' ? 'pass' : 'fail';
    const screenshotPath = path.join(SCREENSHOT_DIR, `${screenshotName}-${status}.png`);

    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {
      // Page may have closed already — not critical
    }

    // After test: fail if console errors were found
    if (errors.length > 0 && testInfo.status === 'passed') {
      const errorSummary = errors
        .map(e => `  [${e.type}] ${e.text.slice(0, 200)}`)
        .join('\n');
      // Attach error log to test report
      testInfo.annotations.push({
        type: 'console-errors',
        description: errorSummary,
      });
      // Don't hard-fail on warnings, only on errors and page crashes
      const realErrors = errors.filter(e => e.type === 'error' || e.type === 'pageerror');
      if (realErrors.length > 0) {
        throw new Error(
          `Browser console had ${realErrors.length} error(s):\n${realErrors.map(e => `  [${e.type}] ${e.text.slice(0, 300)}`).join('\n')}`,
        );
      }
    }
  },
});

export { expect };

/**
 * Take a named screenshot during a test for visual verification.
 * Saved to e2e-screenshots/{name}.png
 */
export async function screenshot(page: Page, name: string): Promise<void> {
  const safeName = name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${safeName}.png`),
    fullPage: true,
  });
}

/**
 * Check page at a specific viewport width. Takes a screenshot at that width.
 * Useful for responsive spot-checks.
 */
export async function checkViewport(
  page: Page,
  name: string,
  width: number,
  height: number,
): Promise<void> {
  const originalSize = page.viewportSize();
  await page.setViewportSize({ width, height });
  await screenshot(page, `${name}-${width}x${height}`);
  // Restore original viewport
  if (originalSize) {
    await page.setViewportSize(originalSize);
  }
}
