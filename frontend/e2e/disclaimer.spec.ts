/**
 * Disclaimer modal E2E test — exercises the REAL first-run flow.
 *
 * This test deliberately does NOT use the shared fixtures from ./fixtures.ts
 * because those bypass the disclaimer via localStorage. The whole point of
 * this test is to verify the modal appears, is accessible, and works.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.join(__dirname, '..', 'e2e-screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

test.describe('Disclaimer Modal — First-Run Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage so the disclaimer modal appears fresh
    await page.addInitScript(() => {
      localStorage.removeItem('patentforge_disclaimer_accepted');
    });
  });

  test('modal appears on first visit and blocks interaction', async ({ page }) => {
    await page.goto('/');

    // Modal should be visible
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // Verify accessibility attributes
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(modal).toHaveAttribute('aria-labelledby', 'disclaimer-title');

    // Title should be present
    await expect(page.locator('#disclaimer-title')).toHaveText('Terms of Use');

    // The accept button should be visible
    const acceptButton = page.getByRole('button', { name: /I Understand and Agree/i });
    await expect(acceptButton).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'disclaimer-modal-visible.png'),
      fullPage: true,
    });
  });

  test('accepting the disclaimer dismisses the modal and persists', async ({ page }) => {
    await page.goto('/');

    // Modal should be visible
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // Click accept
    await page.getByRole('button', { name: /I Understand and Agree/i }).click();

    // Modal should disappear
    await expect(modal).not.toBeVisible();

    // Verify localStorage was set
    const accepted = await page.evaluate(() =>
      localStorage.getItem('patentforge_disclaimer_accepted'),
    );
    expect(accepted).toBeTruthy();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'disclaimer-accepted.png'),
      fullPage: true,
    });

    // Reload — modal should NOT reappear
    await page.reload();
    await expect(modal).not.toBeVisible();

    // App content should be visible (projects heading)
    await expect(page.locator('h1')).toContainText('Projects');

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'disclaimer-stays-dismissed.png'),
      fullPage: true,
    });
  });

  test('modal contains required legal disclaimers', async ({ page }) => {
    await page.goto('/');

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // Key legal content that must be present
    await expect(modal).toContainText('does not provide legal advice');
    await expect(modal).toContainText('may contain errors');
    await expect(modal).toContainText('your own third-party AI account');
    await expect(modal).toContainText('qualified legal counsel');
    await expect(modal).toContainText('"as is"');
  });
});
