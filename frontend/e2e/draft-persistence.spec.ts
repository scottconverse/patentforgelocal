/**
 * E2E tests for invention draft persistence.
 *
 * Tests:
 *   1. Save a draft via the UI, reload the page, verify data persists in both
 *      the API and the UI form fields.
 *   2. API-layer test: PUT all 11 invention fields, GET them back, assert all match.
 */

import { test, expect, screenshot } from './fixtures';
import { createProject, deleteProject, updateSettings } from './helpers';

const API_BASE = 'http://localhost:3000/api';

// All 11 invention fields with test values
const FULL_INVENTION_DATA = {
  title: 'E2E Draft Persistence Test Invention',
  description:
    'A comprehensive test invention for verifying that all invention fields persist correctly ' +
    'through save and reload cycles.',
  problemSolved:
    'Existing systems lack a unified mechanism to verify field persistence in E2E tests.',
  howItWorks:
    'A multi-field form submits data to the API, which stores it in a Postgres database via Prisma.',
  aiComponents: 'Machine learning model for automated test case generation.',
  threeDPrintComponents: 'Custom fixture housing for sensor array — 3D printed in PETG.',
  whatIsNovel:
    'The combination of automated E2E verification with real database persistence is the key novel element.',
  currentAlternatives: 'Manual testing and unit tests that mock the database layer.',
  whatIsBuilt: 'A working prototype demonstrating the core persistence mechanism.',
  whatToProtect:
    'The method of verifying field-level persistence across UI reload and API round-trips.',
  additionalNotes: 'Filed under provisional application 63/000,000 as reference.',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Draft Persistence', () => {
  let projectId: string;

  test.beforeEach(async () => {
    projectId = await createProject('E2E Draft Persistence Test');
    await updateSettings({ anthropicApiKey: 'test-key-for-e2e' });
  });

  test.afterEach(async () => {
    await deleteProject(projectId);
  });

  test('save draft via UI, reload page, verify title and description persist', async ({
    page,
    consoleErrors,
  }) => {
    // Navigate to the project detail page
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Open the invention form
    const fillButton = page.locator('button:has-text("Fill in Invention Details")');
    if (await fillButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await fillButton.click();
    }

    // Wait for the form to appear
    await page
      .locator('input[placeholder="Name your invention"]')
      .waitFor({ state: 'visible', timeout: 10_000 });

    await screenshot(page, 'draft-persistence-form-empty');

    // Fill title and description
    const testTitle = FULL_INVENTION_DATA.title;
    const testDescription = FULL_INVENTION_DATA.description;

    await page.locator('input[placeholder="Name your invention"]').fill(testTitle);
    await page
      .locator('textarea[placeholder*="detailed description"]')
      .fill(testDescription);

    await screenshot(page, 'draft-persistence-form-filled');

    // Click Save Draft
    await page.click('button:has-text("Save Draft")');

    // Wait for save to complete — onSaved navigates to overview (unmounts the form),
    // so wait for the invention form input to disappear as the success signal
    await page
      .locator('input[placeholder="Name your invention"]')
      .waitFor({ state: 'hidden', timeout: 10_000 });

    await screenshot(page, 'draft-persistence-saved-confirmation');

    // Verify via API that the data was persisted before reloading
    const invRes = await page.request.get(`${API_BASE}/projects/${projectId}/invention`);
    expect(invRes.ok()).toBeTruthy();
    const invention = await invRes.json();
    expect(invention.title).toBe(testTitle);
    expect(invention.description).toBe(testDescription);

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    await screenshot(page, 'draft-persistence-after-reload');

    // After reload, the invention form should show the saved data.
    // The project detail page shows invention data when it exists —
    // navigate to the form via the Invention Intake sidebar button.
    await page
      .locator('button:has-text("Invention Intake"), aside button:has-text("Intake")')
      .first()
      .click();

    await page
      .locator('input[placeholder="Name your invention"]')
      .waitFor({ state: 'visible', timeout: 10_000 });

    // Verify the title field shows the saved value
    const titleValue = await page
      .locator('input[placeholder="Name your invention"]')
      .inputValue();
    expect(titleValue).toBe(testTitle);

    // Verify the description field shows the saved value
    const descriptionValue = await page
      .locator('textarea[placeholder*="detailed description"]')
      .inputValue();
    expect(descriptionValue).toBe(testDescription);

    await screenshot(page, 'draft-persistence-fields-restored');
  });

  test('save all 11 invention fields via UI, reload, verify all fields restored', async ({
    page,
    consoleErrors,
  }) => {
    // Navigate to the project and open the form
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    const fillButton = page.locator('button:has-text("Fill in Invention Details")');
    if (await fillButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await fillButton.click();
    }

    await page
      .locator('input[placeholder="Name your invention"]')
      .waitFor({ state: 'visible', timeout: 10_000 });

    await screenshot(page, 'draft-persistence-11fields-form-empty');

    // Fill required fields
    await page.locator('input[placeholder="Name your invention"]').fill(FULL_INVENTION_DATA.title);
    await page
      .locator('textarea[placeholder*="detailed description"]')
      .fill(FULL_INVENTION_DATA.description);

    // Fill all 9 optional fields (all visible — no collapsible sections)
    await page
      .locator('textarea[placeholder*="What problem does this invention solve"]')
      .fill(FULL_INVENTION_DATA.problemSolved);
    await page
      .locator('textarea[placeholder*="Describe the mechanism or process"]')
      .fill(FULL_INVENTION_DATA.howItWorks);
    await page
      .locator('textarea[placeholder*="Describe any AI or machine learning components"]')
      .fill(FULL_INVENTION_DATA.aiComponents);
    await page
      .locator('textarea[placeholder*="Describe any physical or 3D printed components"]')
      .fill(FULL_INVENTION_DATA.threeDPrintComponents);
    await page
      .locator('textarea[placeholder*="What makes this invention unique or innovative"]')
      .fill(FULL_INVENTION_DATA.whatIsNovel);
    await page
      .locator('textarea[placeholder*="Describe existing solutions or prior art"]')
      .fill(FULL_INVENTION_DATA.currentAlternatives);
    await page
      .locator('textarea[placeholder*="Describe any prototypes, proofs-of-concept"]')
      .fill(FULL_INVENTION_DATA.whatIsBuilt);
    await page
      .locator('textarea[placeholder*="Describe the specific aspects you want patent protection"]')
      .fill(FULL_INVENTION_DATA.whatToProtect);
    await page
      .locator('textarea[placeholder*="Any other relevant information"]')
      .fill(FULL_INVENTION_DATA.additionalNotes);

    await screenshot(page, 'draft-persistence-11fields-form-filled');

    // Click Save Draft
    await page.click('button:has-text("Save Draft")');

    // Wait for save to complete — onSaved navigates to overview (unmounts the form),
    // so wait for the invention form input to disappear as the success signal
    await page
      .locator('input[placeholder="Name your invention"]')
      .waitFor({ state: 'hidden', timeout: 10_000 });

    await screenshot(page, 'draft-persistence-11fields-saved-confirmation');

    // Verify via API that all 11 fields were persisted before reloading
    const invRes = await page.request.get(`${API_BASE}/projects/${projectId}/invention`);
    expect(invRes.ok()).toBeTruthy();
    const invention = await invRes.json();
    expect(invention.title).toBe(FULL_INVENTION_DATA.title);
    expect(invention.description).toBe(FULL_INVENTION_DATA.description);
    expect(invention.problemSolved).toBe(FULL_INVENTION_DATA.problemSolved);
    expect(invention.howItWorks).toBe(FULL_INVENTION_DATA.howItWorks);
    expect(invention.aiComponents).toBe(FULL_INVENTION_DATA.aiComponents);
    expect(invention.threeDPrintComponents).toBe(FULL_INVENTION_DATA.threeDPrintComponents);
    expect(invention.whatIsNovel).toBe(FULL_INVENTION_DATA.whatIsNovel);
    expect(invention.currentAlternatives).toBe(FULL_INVENTION_DATA.currentAlternatives);
    expect(invention.whatIsBuilt).toBe(FULL_INVENTION_DATA.whatIsBuilt);
    expect(invention.whatToProtect).toBe(FULL_INVENTION_DATA.whatToProtect);
    expect(invention.additionalNotes).toBe(FULL_INVENTION_DATA.additionalNotes);

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Navigate back to the invention form via the sidebar
    await page
      .locator('button:has-text("Invention Intake"), aside button:has-text("Intake")')
      .first()
      .click();

    await page
      .locator('input[placeholder="Name your invention"]')
      .waitFor({ state: 'visible', timeout: 10_000 });

    // Verify all 11 field values are restored in the UI form
    const titleValue = await page
      .locator('input[placeholder="Name your invention"]')
      .inputValue();
    expect(titleValue).toBe(FULL_INVENTION_DATA.title);

    const descriptionValue = await page
      .locator('textarea[placeholder*="detailed description"]')
      .inputValue();
    expect(descriptionValue).toBe(FULL_INVENTION_DATA.description);

    const problemSolvedValue = await page
      .locator('textarea[placeholder*="What problem does this invention solve"]')
      .inputValue();
    expect(problemSolvedValue).toBe(FULL_INVENTION_DATA.problemSolved);

    const howItWorksValue = await page
      .locator('textarea[placeholder*="Describe the mechanism or process"]')
      .inputValue();
    expect(howItWorksValue).toBe(FULL_INVENTION_DATA.howItWorks);

    const aiComponentsValue = await page
      .locator('textarea[placeholder*="Describe any AI or machine learning components"]')
      .inputValue();
    expect(aiComponentsValue).toBe(FULL_INVENTION_DATA.aiComponents);

    const threeDPrintValue = await page
      .locator('textarea[placeholder*="Describe any physical or 3D printed components"]')
      .inputValue();
    expect(threeDPrintValue).toBe(FULL_INVENTION_DATA.threeDPrintComponents);

    const whatIsNovelValue = await page
      .locator('textarea[placeholder*="What makes this invention unique or innovative"]')
      .inputValue();
    expect(whatIsNovelValue).toBe(FULL_INVENTION_DATA.whatIsNovel);

    const currentAlternativesValue = await page
      .locator('textarea[placeholder*="Describe existing solutions or prior art"]')
      .inputValue();
    expect(currentAlternativesValue).toBe(FULL_INVENTION_DATA.currentAlternatives);

    const whatIsBuiltValue = await page
      .locator('textarea[placeholder*="Describe any prototypes, proofs-of-concept"]')
      .inputValue();
    expect(whatIsBuiltValue).toBe(FULL_INVENTION_DATA.whatIsBuilt);

    const whatToProtectValue = await page
      .locator('textarea[placeholder*="Describe the specific aspects you want patent protection"]')
      .inputValue();
    expect(whatToProtectValue).toBe(FULL_INVENTION_DATA.whatToProtect);

    const additionalNotesValue = await page
      .locator('textarea[placeholder*="Any other relevant information"]')
      .inputValue();
    expect(additionalNotesValue).toBe(FULL_INVENTION_DATA.additionalNotes);

    await screenshot(page, 'draft-persistence-11fields-all-restored');
  });

  test('save draft with optional fields, reload, verify optional fields persist', async ({
    page,
    consoleErrors,
  }) => {
    // Navigate to the project and open the form
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    const fillButton = page.locator('button:has-text("Fill in Invention Details")');
    if (await fillButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await fillButton.click();
    }

    await page
      .locator('input[placeholder="Name your invention"]')
      .waitFor({ state: 'visible', timeout: 10_000 });

    // Fill required fields
    await page.locator('input[placeholder="Name your invention"]').fill(FULL_INVENTION_DATA.title);
    await page
      .locator('textarea[placeholder*="detailed description"]')
      .fill(FULL_INVENTION_DATA.description);

    // Fill an optional field (Problem Solved)
    const problemSolvedField = page.locator('textarea[placeholder*="What problem does this invention solve"]');
    await problemSolvedField.fill(FULL_INVENTION_DATA.problemSolved);

    // Fill another optional field (How It Works)
    const howItWorksField = page.locator('textarea[placeholder*="Describe the mechanism or process"]');
    await howItWorksField.fill(FULL_INVENTION_DATA.howItWorks);

    // Save the draft
    await page.click('button:has-text("Save Draft")');

    // Wait for save to complete — onSaved navigates to overview (unmounts the form),
    // so wait for the invention form input to disappear as the success signal
    await page
      .locator('input[placeholder="Name your invention"]')
      .waitFor({ state: 'hidden', timeout: 10_000 });

    // Verify all saved fields via API
    const invRes = await page.request.get(`${API_BASE}/projects/${projectId}/invention`);
    expect(invRes.ok()).toBeTruthy();
    const invention = await invRes.json();
    expect(invention.title).toBe(FULL_INVENTION_DATA.title);
    expect(invention.description).toBe(FULL_INVENTION_DATA.description);
    expect(invention.problemSolved).toBe(FULL_INVENTION_DATA.problemSolved);
    expect(invention.howItWorks).toBe(FULL_INVENTION_DATA.howItWorks);

    // Reload and verify optional fields are restored in the UI
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page
      .locator('button:has-text("Invention Intake"), aside button:has-text("Intake")')
      .first()
      .click();

    await page
      .locator('input[placeholder="Name your invention"]')
      .waitFor({ state: 'visible', timeout: 10_000 });

    // Verify optional field values in the form after reload
    const problemSolvedValue = await page
      .locator('textarea[placeholder*="What problem does this invention solve"]')
      .inputValue();
    expect(problemSolvedValue).toBe(FULL_INVENTION_DATA.problemSolved);

    const howItWorksValue = await page
      .locator('textarea[placeholder*="Describe the mechanism or process"]')
      .inputValue();
    expect(howItWorksValue).toBe(FULL_INVENTION_DATA.howItWorks);

    await screenshot(page, 'draft-persistence-optional-fields-restored');
  });
});

// ---------------------------------------------------------------------------
// API-layer test — all 11 invention fields
// ---------------------------------------------------------------------------

test.describe('Draft Persistence — API Layer', () => {
  let projectId: string;

  test.beforeEach(async () => {
    projectId = await createProject('E2E Invention API Layer Test');
    await updateSettings({ anthropicApiKey: 'test-key-for-e2e' });
  });

  test.afterEach(async () => {
    await deleteProject(projectId);
  });

  test('PUT all 11 invention fields, GET back and assert all 11 match', async ({ page }) => {
    // PUT all 11 fields via API
    const putRes = await page.request.put(`${API_BASE}/projects/${projectId}/invention`, {
      data: FULL_INVENTION_DATA,
      headers: { 'Content-Type': 'application/json' },
    });
    expect(putRes.ok()).toBeTruthy();

    const putBody = await putRes.json();
    // PUT should return the created/updated invention
    expect(putBody.title).toBe(FULL_INVENTION_DATA.title);
    expect(putBody.description).toBe(FULL_INVENTION_DATA.description);

    // GET back and assert all 11 fields match
    const getRes = await page.request.get(`${API_BASE}/projects/${projectId}/invention`);
    expect(getRes.ok()).toBeTruthy();
    const inv = await getRes.json();

    expect(inv.title).toBe(FULL_INVENTION_DATA.title);
    expect(inv.description).toBe(FULL_INVENTION_DATA.description);
    expect(inv.problemSolved).toBe(FULL_INVENTION_DATA.problemSolved);
    expect(inv.howItWorks).toBe(FULL_INVENTION_DATA.howItWorks);
    expect(inv.aiComponents).toBe(FULL_INVENTION_DATA.aiComponents);
    expect(inv.threeDPrintComponents).toBe(FULL_INVENTION_DATA.threeDPrintComponents);
    expect(inv.whatIsNovel).toBe(FULL_INVENTION_DATA.whatIsNovel);
    expect(inv.currentAlternatives).toBe(FULL_INVENTION_DATA.currentAlternatives);
    expect(inv.whatIsBuilt).toBe(FULL_INVENTION_DATA.whatIsBuilt);
    expect(inv.whatToProtect).toBe(FULL_INVENTION_DATA.whatToProtect);
    expect(inv.additionalNotes).toBe(FULL_INVENTION_DATA.additionalNotes);

    // Verify the invention is linked to the correct project
    expect(inv.projectId).toBe(projectId);
  });

  test('PUT invention twice (upsert) — second PUT updates existing fields', async ({ page }) => {
    // First PUT
    const put1Res = await page.request.put(`${API_BASE}/projects/${projectId}/invention`, {
      data: {
        title: 'Initial Title',
        description: 'Initial description.',
        problemSolved: 'Initial problem.',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(put1Res.ok()).toBeTruthy();

    // Second PUT (upsert — should update, not duplicate)
    const put2Res = await page.request.put(`${API_BASE}/projects/${projectId}/invention`, {
      data: {
        title: 'Updated Title',
        description: 'Updated description.',
        problemSolved: 'Updated problem.',
        howItWorks: 'New how it works field.',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(put2Res.ok()).toBeTruthy();

    // GET back — should reflect the second PUT values
    const getRes = await page.request.get(`${API_BASE}/projects/${projectId}/invention`);
    expect(getRes.ok()).toBeTruthy();
    const inv = await getRes.json();

    expect(inv.title).toBe('Updated Title');
    expect(inv.description).toBe('Updated description.');
    expect(inv.problemSolved).toBe('Updated problem.');
    expect(inv.howItWorks).toBe('New how it works field.');

    // Only one invention record should exist for this project (upsert, not insert)
    // Verify by checking the project detail endpoint
    const projectRes = await page.request.get(`${API_BASE}/projects/${projectId}`);
    expect(projectRes.ok()).toBeTruthy();
    const projectData = await projectRes.json();
    // The project should have exactly one invention
    expect(projectData.invention).toBeTruthy();
    expect(projectData.invention.title).toBe('Updated Title');
  });
});
