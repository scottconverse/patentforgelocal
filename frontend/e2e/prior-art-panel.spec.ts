import { test, expect, screenshot } from './fixtures';
import { createProject, deleteProject } from './helpers';

test.describe('Prior Art Panel', () => {
  let projectId: string;

  test.beforeEach(async () => {
    projectId = await createProject('E2E Prior Art Test');
  });

  test.afterEach(async () => {
    await deleteProject(projectId);
  });

  test('project detail page loads with clean console', async ({ page, consoleErrors }) => {
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=E2E Prior Art Test')).toBeVisible({ timeout: 10_000 });
    await screenshot(page, 'project-detail-with-prior-art-panel');
  });
});
