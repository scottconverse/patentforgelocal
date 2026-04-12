/**
 * E2E tests for multiple project management.
 *
 * Tests: CRUD operations across multiple projects, cascading deletes,
 * project list rendering, and navigation isolation between projects.
 */

import { test, expect, screenshot } from './fixtures';
import { createProject, deleteProject, updateSettings } from './helpers';

test.describe('Multiple Projects — CRUD and Cascade', () => {
  // Ensure API key is set so FirstRunWizard doesn't block navigation
  test.beforeAll(async () => {
    await updateSettings({ anthropicApiKey: 'test-key-for-e2e' });
  });

  const projectIds: string[] = [];

  test.afterAll(async () => {
    for (const id of projectIds) {
      try {
        await deleteProject(id);
      } catch {
        // Already deleted or doesn't exist
      }
    }
  });

  test('create 3 projects, verify list, delete one, verify cascade', async ({
    page,
    consoleErrors,
  }) => {
    // Create 3 projects via API
    const idAlpha = await createProject('E2E Project Alpha');
    const idBeta = await createProject('E2E Project Beta');
    const idGamma = await createProject('E2E Project Gamma');
    projectIds.push(idAlpha, idBeta, idGamma);

    // Navigate to project list
    await page.goto('/');
    await page.waitForSelector('h1:has-text("Projects")', { timeout: 5_000 });
    await screenshot(page, 'multi-project-list-all-three');

    // Verify all 3 appear in the list
    await expect(page.locator('h3:has-text("E2E Project Alpha")')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('h3:has-text("E2E Project Beta")')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('h3:has-text("E2E Project Gamma")')).toBeVisible({
      timeout: 5_000,
    });

    // Delete the middle project via API
    await deleteProject(idBeta);
    projectIds.splice(projectIds.indexOf(idBeta), 1);

    // Reload and verify only 2 remain
    await page.reload();
    await page.waitForSelector('h1:has-text("Projects")', { timeout: 5_000 });
    await screenshot(page, 'multi-project-list-after-delete');

    await expect(page.locator('h3:has-text("E2E Project Alpha")')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('h3:has-text("E2E Project Beta")')).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator('h3:has-text("E2E Project Gamma")')).toBeVisible({
      timeout: 5_000,
    });

    // Verify cascade: deleted project's API endpoint returns 404
    const res = await page.request.get(`http://localhost:3000/api/projects/${idBeta}`);
    expect(res.status()).toBe(404);

    // Navigate into first remaining project — verify data intact, no error banners
    const alphaCard = page.locator('h3:has-text("E2E Project Alpha")');
    const alphaOpenBtn = alphaCard.locator('..').locator('..').locator('..').locator('button:has-text("Open")');
    await alphaOpenBtn.first().click();
    await page.waitForURL(new RegExp(`/projects/${idAlpha}`), { timeout: 5_000 });
    await page.waitForSelector('text=Invention Intake', { timeout: 5_000 });
    await screenshot(page, 'multi-project-alpha-detail');

    // Verify no error banners (red backgrounds) on the page
    await expect(page.locator('.bg-red-900')).not.toBeVisible();

    // Navigate back to project list
    await page.goto('/');
    await page.waitForSelector('h1:has-text("Projects")', { timeout: 5_000 });

    // Navigate into second remaining project — verify it also works cleanly
    const gammaCard = page.locator('h3:has-text("E2E Project Gamma")');
    const gammaOpenBtn = gammaCard
      .locator('..')
      .locator('..')
      .locator('..')
      .locator('button:has-text("Open")');
    await gammaOpenBtn.first().click();
    await page.waitForURL(new RegExp(`/projects/${idGamma}`), { timeout: 5_000 });
    await page.waitForSelector('text=Invention Intake', { timeout: 5_000 });
    await screenshot(page, 'multi-project-gamma-detail');

    // Verify no error banners
    await expect(page.locator('.bg-red-900')).not.toBeVisible();
  });

  test('create 2 projects with same name — both should appear in list', async ({
    page,
    consoleErrors,
  }) => {
    const id1 = await createProject('Duplicate Name Test');
    const id2 = await createProject('Duplicate Name Test');
    projectIds.push(id1, id2);

    await page.goto('/');
    await page.waitForSelector('h1:has-text("Projects")', { timeout: 5_000 });
    // Wait for at least one card to appear before counting (list data may load after header)
    await page.waitForSelector('h3:has-text("Duplicate Name Test")', { timeout: 5_000 });
    await screenshot(page, 'multi-project-duplicate-names');

    // Verify both appear (as separate entries, identified by their unique IDs in data attributes or cards)
    const cards = page.locator('h3:has-text("Duplicate Name Test")');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('deleting one project does not affect others', async ({ page, consoleErrors }) => {
    const id1 = await createProject('Project One');
    const id2 = await createProject('Project Two');
    const id3 = await createProject('Project Three');
    projectIds.push(id1, id2, id3);

    await page.goto('/');
    await page.waitForSelector('h1:has-text("Projects")', { timeout: 5_000 });

    // Delete the first project
    await deleteProject(id1);
    projectIds.splice(projectIds.indexOf(id1), 1);

    // Reload
    await page.reload();
    await page.waitForSelector('h1:has-text("Projects")', { timeout: 5_000 });
    await screenshot(page, 'multi-project-isolation-after-delete');

    // Verify Two and Three still exist
    await expect(page.locator('h3:has-text("Project One")')).not.toBeVisible();
    await expect(page.locator('h3:has-text("Project Two")')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('h3:has-text("Project Three")')).toBeVisible({ timeout: 5_000 });

    // Verify we can still navigate to Project Two
    const twoCard = page.locator('h3:has-text("Project Two")');
    const twoOpenBtn = twoCard
      .locator('..')
      .locator('..')
      .locator('..')
      .locator('button:has-text("Open")');
    await twoOpenBtn.first().click();
    await page.waitForURL(new RegExp(`/projects/${id2}`), { timeout: 5_000 });
    await expect(page.locator('text=Invention Intake')).toBeVisible({ timeout: 5_000 });
  });
});
