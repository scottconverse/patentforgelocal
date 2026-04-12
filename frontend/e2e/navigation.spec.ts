import { test, expect, screenshot, checkViewport } from './fixtures';
import { updateSettings } from './helpers';

test.describe('Navigation', () => {
  // Ensure an API key is set so the FirstRunWizard does not block navigation
  test.beforeAll(async () => {
    await updateSettings({ anthropicApiKey: 'test-key-for-e2e' });
  });

  test('home page loads with clean console', async ({ page, consoleErrors }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/PatentForge/i);
    await expect(page.locator('h1')).toContainText('Projects');
    await screenshot(page, 'home-page-loaded');
  });

  test('settings link navigates to settings page', async ({ page, consoleErrors }) => {
    await page.goto('/');
    await page.click('a[href="/settings"]');
    await expect(page).toHaveURL(/\/settings/);
    await screenshot(page, 'settings-page');
  });

  test('logo navigates back to home from settings', async ({ page, consoleErrors }) => {
    await page.goto('/settings');
    await page.click('a:has-text("PatentForge")');
    await expect(page).toHaveURL('/');
  });

  test('responsive: home page renders at mobile viewport', async ({ page, consoleErrors }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Projects');
    await checkViewport(page, 'home-mobile', 375, 812);
    // Nav bar should still be visible
    await expect(page.locator('a:has-text("PatentForge")')).toBeVisible();
    await expect(page.locator('a[href="/settings"]')).toBeVisible();
  });

  test('responsive: settings page renders at mobile viewport', async ({ page, consoleErrors }) => {
    await page.goto('/settings');
    await expect(page.locator('button:has-text("Save Settings")')).toBeVisible({ timeout: 10_000 });
    await checkViewport(page, 'settings-mobile', 375, 812);
    // Save button should still be visible and not clipped
    await expect(page.locator('button:has-text("Save Settings")')).toBeVisible();
  });
});
