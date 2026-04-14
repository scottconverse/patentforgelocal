import { test, expect, screenshot, checkViewport } from './fixtures';
import { getSettings, updateSettings } from './helpers';

test.describe('Settings Page', () => {
  // Ensure an API key is set so the FirstRunWizard does not block navigation
  test.beforeAll(async () => {
    await updateSettings({ modelReady: true, ollamaModel: 'gemma4:26b', ollamaUrl: 'http://localhost:11434' });
  });

  test.afterAll(async () => {
    await updateSettings({
      usptoApiKey: '',
      defaultModel: 'gemma4:26b',
    });
  });

  test('loads settings page with all sections and clean console', async ({ page, consoleErrors }) => {
    await page.goto('/settings');

    await expect(page.locator('h1, h2').filter({ hasText: /settings/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('label:has-text("Ollama API Key")')).toBeVisible();
    await expect(page.locator('label:has-text("USPTO Open Data Portal Key")')).toBeVisible();
    await expect(page.locator('button:has-text("Save Settings")')).toBeVisible();
    await screenshot(page, 'settings-page-loaded');
  });

  test('can save and persist USPTO API key settings', async ({ page, consoleErrors }) => {
    await page.goto('/settings');
    await expect(page.locator('label:has-text("USPTO Open Data Portal Key")')).toBeVisible({ timeout: 10_000 });

    // Fill the USPTO API key field (Ollama URL is not user-editable — it's a status display)
    const usptoInput = page.locator('input[placeholder*="30-character"]').first();
    await usptoInput.fill('test-key-for-e2e-verification1');
    await screenshot(page, 'settings-key-filled');

    await page.click('button:has-text("Save Settings")');

    // Wait for the save to complete (button text changes to "Saving..." then back)
    await page.waitForFunction(
      () => document.querySelector('button[type="submit"]')?.textContent?.includes('Save Settings'),
      { timeout: 10_000 },
    );
    await screenshot(page, 'settings-saved-confirmation');

    // Restore valid settings so subsequent tests don't trigger the FirstRunWizard
    await updateSettings({ modelReady: true, ollamaModel: 'gemma4:26b', ollamaUrl: 'http://localhost:11434', usptoApiKey: '' });
  });

  test('model status shows configured model', async ({ page, consoleErrors }) => {
    await page.goto('/settings');
    await expect(page.locator('button:has-text("Save Settings")')).toBeVisible({ timeout: 10_000 });

    // Model is displayed as read-only status (not a select dropdown — local inference uses Ollama's configured model)
    await expect(page.locator('text=gemma4:26b')).toBeVisible();
    await screenshot(page, 'settings-model-status');
  });

  test('responsive: settings page at mobile viewport', async ({ page, consoleErrors }) => {
    await page.goto('/settings');
    await expect(page.locator('button:has-text("Save Settings")')).toBeVisible({ timeout: 10_000 });
    await checkViewport(page, 'settings-page-mobile', 375, 812);

    // All controls should be visible and not overflow
    await expect(page.locator('button:has-text("Save Settings")')).toBeVisible();
    await expect(page.locator('text=gemma4:26b')).toBeVisible();
  });
});
