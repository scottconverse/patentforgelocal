import { test, expect, screenshot } from './fixtures';
import { createProject, deleteProject, updateSettings } from './helpers';

test.describe('Project Lifecycle', () => {
  let projectId: string | null = null;

  // Ensure an API key is set so the FirstRunWizard does not block navigation
  test.beforeAll(async () => {
    await updateSettings({ anthropicApiKey: 'test-key-for-e2e' });
  });

  test.afterEach(async () => {
    if (projectId) {
      await deleteProject(projectId);
      projectId = null;
    }
  });

  test('can create a new project from the project list', async ({ page, consoleErrors }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Projects');

    await page.click('button:has-text("New Project")');
    await screenshot(page, 'new-project-form-open');

    const input = page.locator('input[type="text"]').first();
    await input.fill('E2E Test Widget Analyzer');
    await page.click('button:has-text("Create")');

    // After creation, the app may navigate to the project detail page
    // or stay on the list. Either way, verify the project was created.
    await page.waitForTimeout(1_000);
    await screenshot(page, 'project-created');

    // Verify project exists via API
    const res = await page.request.get('http://localhost:3000/api/projects');
    const projects = await res.json();
    const found = projects.find((p: any) => p.title === 'E2E Test Widget Analyzer');
    expect(found).toBeTruthy();
    if (found) projectId = found.id;
  });

  test('can navigate to project detail page via Open button', async ({ page, consoleErrors }) => {
    projectId = await createProject('E2E Navigate Test');

    await page.goto('/');
    await expect(page.locator('h3:has-text("E2E Navigate Test")')).toBeVisible({ timeout: 5_000 });

    const h3 = page.locator('h3:has-text("E2E Navigate Test")');
    const openBtn = h3.locator('..').locator('..').locator('..').locator('button:has-text("Open")');
    await openBtn.first().click();

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}`), { timeout: 5_000 });
    // Wait for the project detail page to finish loading (not just URL change).
    // Without this, afterEach may delete the project while the browser's proxied
    // GET /api/projects/:id is still in-flight, causing a 404 console error.
    await expect(page.locator('text=E2E Navigate Test').first()).toBeVisible({ timeout: 5_000 });
    await screenshot(page, 'project-detail-page');
  });

  test('shows empty state when no projects exist', async ({ page, consoleErrors }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Projects');
    await screenshot(page, 'empty-project-list');
  });
});
