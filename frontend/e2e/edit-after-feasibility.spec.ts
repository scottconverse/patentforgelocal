/**
 * E2E tests for editing invention fields after feasibility completes.
 *
 * Full feasibility pipelines are expensive (~$0.75–$3.00 per run). These tests
 * do NOT re-run the pipeline from scratch. Instead:
 *   - The first test checks for a completed project in the database and skips
 *     if none exists. Run feasibility-pipeline.spec.ts first to create one.
 *   - Alternatively, tests use the mocked SSE pipeline to create a completed run
 *     in the same test session before testing the edit behavior.
 *
 * What is tested:
 *   - Editing the invention description after feasibility completes
 *   - Saving the change and verifying via API that the update persisted
 *   - Returning to the Feasibility tab and confirming results are still visible
 *   - No new error banners appear after the edit
 */

import { test, expect, screenshot } from './fixtures';
import { createProject, deleteProject, updateSettings } from './helpers';
import type { Page, Route } from '@playwright/test';

const API_BASE = 'http://localhost:3000/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a full 6-stage mock SSE response. */
function buildMockSSEResponse(): string {
  const stages = [
    { num: 1, name: 'Technical Intake & Restatement' },
    { num: 2, name: 'Prior Art Research' },
    { num: 3, name: 'Patentability Analysis' },
    { num: 4, name: 'Deep Dive Analysis' },
    { num: 5, name: 'IP Strategy & Recommendations' },
    { num: 6, name: 'Comprehensive Report' },
  ];

  let body = '';
  const outputs: string[] = [];

  for (const stage of stages) {
    const output = `## Stage ${stage.num}: ${stage.name}\n\nMock output for ${stage.name}. Contains detailed analysis results.\n`;
    outputs.push(output);

    body += `event: stage_start\ndata: ${JSON.stringify({
      type: 'stage_start',
      stage: stage.num,
      name: stage.name,
    })}\n\n`;
    body += `event: token\ndata: ${JSON.stringify({ type: 'token', text: output })}\n\n`;
    body += `event: stage_complete\ndata: ${JSON.stringify({
      type: 'stage_complete',
      stage: stage.num,
      output,
      model: 'claude-haiku-4-5-20251001',
      webSearchUsed: stage.num === 2,
      inputTokens: 4000,
      outputTokens: 2000,
      estimatedCostUsd: 0.02,
    })}\n\n`;
  }

  body += `event: pipeline_complete\ndata: ${JSON.stringify({
    type: 'pipeline_complete',
    finalReport: outputs.join('\n---\n\n'),
    stages: [],
  })}\n\n`;

  return body;
}

/** Set up standard route mocks. */
async function setupMocks(page: Page, sseBody: string) {
  await page.route('**/api/projects/*/feasibility/stream', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      body: sseBody,
    });
  });

  await page.route('**/api/projects/*/prior-art/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'NONE' }),
    });
  });

  await page.route('**/raw.githubusercontent.com/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        'claude-haiku-4-5-20251001': {
          input_cost_per_token: 0.0000008,
          output_cost_per_token: 0.000004,
        },
      }),
    });
  });

  // Mock the disk-export endpoint — avoids file-system side effects in cleanroom.
  await page.route('**/api/projects/*/feasibility/export', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        folderPath: '/tmp/patentforge-e2e-export',
        mdFile: '/tmp/patentforge-e2e-export/report.md',
        htmlFile: '/tmp/patentforge-e2e-export/report.html',
      }),
    });
  });

  // Mock the report-text endpoint.
  await page.route('**/api/projects/*/feasibility/report', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        report: '# E2E Mock Feasibility Report\n\nMock report for end-to-end testing.',
        html: '<h1>E2E Mock Feasibility Report</h1><p>Mock report for end-to-end testing.</p>',
      }),
    });
  });

  // Mock the report-HTML endpoint — browser logs 500s to console even when JS catches them.
  await page.route('**/api/projects/*/feasibility/report/html', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: '<!DOCTYPE html><html><body style="background:#030712;color:#f3f4f6;padding:2rem;font-family:sans-serif"><h1 style="color:#60a5fa">E2E Mock Feasibility Report</h1><p>Mock report for end-to-end testing.</p></body></html>',
    });
  });
}

/** Fill invention form with required fields. */
async function fillInventionForm(page: Page, projectId: string, title = 'E2E Edit After Feasibility') {
  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState('networkidle');

  const fillButton = page.locator('button:has-text("Fill in Invention Details")');
  if (await fillButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await fillButton.click();
  }

  await page
    .locator('input[placeholder="Name your invention"]')
    .waitFor({ state: 'visible', timeout: 10_000 });

  await page.locator('input[placeholder="Name your invention"]').fill(title);
  // 50+ words required by the backend before a feasibility run can start
  await page
    .locator('textarea[placeholder*="detailed description"]')
    .fill(
      'Initial description of the invention for end-to-end edit-after-run testing. ' +
        'This text will be modified after the pipeline finishes to verify that updating ' +
        'invention details does not wipe or invalidate previously generated stage outputs. ' +
        'The system should preserve prior analysis data while allowing inventors to ' +
        'refine and improve their invention disclosure at any point in time.',
    );
}

/** Run the mocked feasibility pipeline to completion. Returns when pipeline_complete is shown. */
async function runFeasibilityToCompletion(page: Page) {
  await page.click('button:has-text("Save & Run Feasibility")');
  await expect(page.locator('text=Confirm Analysis Run')).toBeVisible({ timeout: 10_000 });
  await page.click('button:has-text("Start Analysis")');
  await expect(page.locator('text=Feasibility analysis complete')).toBeVisible({ timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Edit After Feasibility', () => {
  let projectId: string;

  test.beforeEach(async () => {
    projectId = await createProject('E2E Edit After Feasibility Test');
    await updateSettings({
      anthropicApiKey: 'test-key-for-e2e',
      defaultModel: 'claude-haiku-4-5-20251001',
      maxTokens: 8000,
      interStageDelaySeconds: 0,
      costCapUsd: 5.0,
    });
  });

  test.afterEach(async () => {
    await deleteProject(projectId);
  });

  test('editing description after feasibility completes does not wipe results', async ({
    page,
    consoleErrors,
  }) => {
    // Step 1: Run a mocked feasibility pipeline to completion
    await setupMocks(page, buildMockSSEResponse());
    await fillInventionForm(page, projectId);
    await runFeasibilityToCompletion(page);

    await screenshot(page, 'edit-after-feasibility-run-complete');

    // Step 2: Navigate to the invention form (Edit Invention)
    // Return to overview first
    const viewReportButton = page.locator('button:has-text("View Report")');
    if (await viewReportButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // On the running-complete view — go back to overview first
      await page.goto(`/projects/${projectId}`);
      await page.waitForLoadState('networkidle');
    }

    // The sidebar "Invention Intake" button navigates to the invention form
    await page.locator('button:has-text("Invention Intake"), aside button:has-text("Intake")').first().click();

    // Wait for the invention form to be visible
    await page
      .locator('input[placeholder="Name your invention"]')
      .waitFor({ state: 'visible', timeout: 10_000 });

    await screenshot(page, 'edit-after-feasibility-form-open');

    // Step 3: Append " — E2E UPDATED" to the description
    const descriptionField = page.locator('textarea[placeholder*="detailed description"]');
    const currentDescription = await descriptionField.inputValue();
    await descriptionField.fill(currentDescription + ' — E2E UPDATED');

    // Step 4: Click Save Draft
    await page.click('button:has-text("Save Draft")');

    // Wait for save to complete — onSaved navigates to overview (unmounts the form),
    // so wait for the invention form input to disappear as the success signal
    await page
      .locator('input[placeholder="Name your invention"]')
      .waitFor({ state: 'hidden', timeout: 10_000 });

    await screenshot(page, 'edit-after-feasibility-saved');

    // Step 5: Verify via API that the description was persisted
    const invRes = await page.request.get(`${API_BASE}/projects/${projectId}/invention`);
    expect(invRes.ok()).toBeTruthy();
    const invention = await invRes.json();
    expect(invention.description).toContain('E2E UPDATED');

    // Step 6: Navigate back to overview / feasibility results
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    await screenshot(page, 'edit-after-feasibility-back-to-overview');

    // Step 7: Assert feasibility results are still visible
    // The project should still show COMPLETE status — the green checkmark on Feasibility
    // and the "View Report" button should still be present
    const latestRunRes = await page.request.get(`${API_BASE}/projects/${projectId}/feasibility`);
    expect(latestRunRes.ok()).toBeTruthy();
    const latestRun = await latestRunRes.json();
    expect(latestRun.status).toBe('COMPLETE');

    // View Report button should still appear (feasibility results intact).
    // There may be two — one in the sidebar and one in the main report area.
    const viewReport = page.locator('button:has-text("View Report")').first();
    await expect(viewReport).toBeVisible({ timeout: 5_000 });

    // Step 8: Assert no unexpected error banners
    // Any red banners present would indicate editing broke something
    const errorBanners = page.locator('.bg-red-900');
    const errorCount = await errorBanners.count();
    // Filter out the project error panel (which only shows if loading failed)
    // We verify the feasibility run is still COMPLETE via API above
    // If there are banners, they must be pre-existing (not introduced by the edit)
    // We already confirmed via API that feasibility is COMPLETE, so banners are unexpected
    if (errorCount > 0) {
      const bannerTexts = await errorBanners.allTextContents();
      // Fail if any banner text suggests feasibility was broken by the edit
      for (const text of bannerTexts) {
        expect(text).not.toContain('feasibility');
        expect(text).not.toContain('run failed');
        expect(text).not.toContain('pipeline error');
      }
    }

    await screenshot(page, 'edit-after-feasibility-results-intact');
  });

  test('editing invention title after feasibility — title updates correctly via API', async ({
    page,
    consoleErrors,
  }) => {
    // Run pipeline to completion using mocked SSE
    await setupMocks(page, buildMockSSEResponse());
    await fillInventionForm(page, projectId, 'Original Invention Title');
    await runFeasibilityToCompletion(page);

    // Verify run is complete via API
    const runRes = await page.request.get(`${API_BASE}/projects/${projectId}/feasibility`);
    expect(runRes.ok()).toBeTruthy();
    const run = await runRes.json();
    expect(run.status).toBe('COMPLETE');

    // Navigate to invention form and update the title
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    await page
      .locator('button:has-text("Invention Intake"), aside button:has-text("Intake")')
      .first()
      .click();

    await page
      .locator('input[placeholder="Name your invention"]')
      .waitFor({ state: 'visible', timeout: 10_000 });

    await page.locator('input[placeholder="Name your invention"]').fill('Updated Invention Title — E2E');
    await page.click('button:has-text("Save Draft")');

    // Wait for save to complete — onSaved navigates to overview (unmounts the form),
    // so wait for the invention form input to disappear as the success signal
    await page
      .locator('input[placeholder="Name your invention"]')
      .waitFor({ state: 'hidden', timeout: 10_000 });

    // Verify title update via API
    const invRes = await page.request.get(`${API_BASE}/projects/${projectId}/invention`);
    expect(invRes.ok()).toBeTruthy();
    const invention = await invRes.json();
    expect(invention.title).toBe('Updated Invention Title — E2E');

    // Verify feasibility run still intact after title change
    const runRes2 = await page.request.get(`${API_BASE}/projects/${projectId}/feasibility`);
    const run2 = await runRes2.json();
    expect(run2.status).toBe('COMPLETE');

    await screenshot(page, 'edit-title-feasibility-intact');
  });
});
