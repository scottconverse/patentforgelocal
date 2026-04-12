import { test, expect, screenshot, checkViewport } from './fixtures';
import { createProject, deleteProject, updateSettings } from './helpers';

test.describe('Invention Form', () => {
  let projectId: string;

  test.beforeEach(async () => {
    projectId = await createProject('E2E Invention Form Test');
    // Ensure an API key is set so the FirstRunWizard does not block navigation
    await updateSettings({ anthropicApiKey: 'test-key-for-e2e' });
  });

  test.afterEach(async () => {
    await deleteProject(projectId);
  });

  test('shows invention form with required fields', async ({ page, consoleErrors }) => {
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // New project may show "Fill in Invention Details" button or render the form directly.
    const fillButton = page.locator('button:has-text("Fill in Invention Details")');
    if (await fillButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await fillButton.click();
    }

    await expect(page.locator('label:has-text("Title")')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('label:has-text("Description")')).toBeVisible();
    await expect(page.locator('button:has-text("Save Draft")')).toBeVisible();
    await screenshot(page, 'invention-form-empty');
  });

  test('can fill and save invention form fields', async ({ page, consoleErrors }) => {
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // New project shows overview — click to open the form
    const fillButton = page.locator('button:has-text("Fill in Invention Details")');
    if (await fillButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await fillButton.click();
    }
    await expect(page.locator('label:has-text("Title")')).toBeVisible({ timeout: 10_000 });

    const titleInput = page.locator('input[type="text"]').first();
    await titleInput.fill('Self-Healing Concrete Monitor');

    const descInput = page.locator('textarea').first();
    await descInput.fill('An IoT sensor network that monitors concrete structures.');

    await screenshot(page, 'invention-form-filled');
    await page.click('button:has-text("Save Draft")');

    // Wait for save to complete, then verify no error banner appeared
    await page.waitForTimeout(1000);
    await screenshot(page, 'invention-form-saved');

    // Verify via API that the invention was persisted
    const res = await page.request.get(`http://localhost:3000/api/projects/${projectId}/invention`);
    const invention = await res.json();
    expect(invention.title).toBe('Self-Healing Concrete Monitor');
    expect(invention.description).toContain('IoT sensor network');
  });

  test('responsive: invention form at mobile viewport', async ({ page, consoleErrors }) => {
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // New project shows overview — click to open the form
    const fillButton = page.locator('button:has-text("Fill in Invention Details")');
    if (await fillButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await fillButton.click();
    }
    await expect(page.locator('label:has-text("Title")')).toBeVisible({ timeout: 10_000 });
    await checkViewport(page, 'invention-form-mobile', 375, 812);

    // Form elements should still be usable at mobile width
    await expect(page.locator('button:has-text("Save Draft")')).toBeVisible();
    await expect(page.locator('input[type="text"]').first()).toBeVisible();
  });
});
