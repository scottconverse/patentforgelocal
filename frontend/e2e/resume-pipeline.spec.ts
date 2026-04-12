/**
 * E2E tests for resuming a pipeline after an interrupted or errored state.
 *
 * The Resume button in ProjectSidebar appears only when:
 *   - The project has an invention
 *   - The pipeline is NOT currently running
 *   - displayStages contains at least one COMPLETE stage AND at least one ERROR or PENDING stage
 *
 * Important: After a CANCELLED run, stages are stored with status CANCELLED (not ERROR),
 * so the Resume button does NOT appear for cancelled runs. Resume only appears for ERROR
 * state (e.g., API failure partway through). This test verifies both scenarios:
 *   1. After an error mid-pipeline: Resume button IS visible and initiates a new stream.
 *   2. After a cancelled run: Resume button is NOT visible; "Run Feasibility" appears instead.
 */

import { test, expect, screenshot } from './fixtures';
import { createProject, deleteProject, updateSettings } from './helpers';
import type { Page, Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an SSE response that errors partway through (stage 1 complete, stage 2 errors). */
function buildMockSSEWithError(): string {
  let body = '';

  body += `event: stage_start\ndata: ${JSON.stringify({
    type: 'stage_start',
    stage: 1,
    name: 'Technical Intake & Restatement',
  })}\n\n`;
  body += `event: token\ndata: ${JSON.stringify({ type: 'token', text: 'Stage 1 output text.' })}\n\n`;
  body += `event: stage_complete\ndata: ${JSON.stringify({
    type: 'stage_complete',
    stage: 1,
    output: 'Stage 1 output text.',
    model: 'claude-haiku-4-5-20251001',
    webSearchUsed: false,
    inputTokens: 4000,
    outputTokens: 2000,
    estimatedCostUsd: 0.02,
  })}\n\n`;

  body += `event: stage_start\ndata: ${JSON.stringify({
    type: 'stage_start',
    stage: 2,
    name: 'Prior Art Research',
  })}\n\n`;
  body += `event: stage_error\ndata: ${JSON.stringify({
    type: 'stage_error',
    stage: 2,
    error: 'Rate limited after 3 retries',
  })}\n\n`;

  return body;
}

/** Build an SSE response that sends a cancelled event. */
function buildMockSSECancelled(): string {
  let body = '';

  body += `event: stage_start\ndata: ${JSON.stringify({
    type: 'stage_start',
    stage: 1,
    name: 'Technical Intake & Restatement',
  })}\n\n`;
  body += `event: token\ndata: ${JSON.stringify({ type: 'token', text: 'Starting analysis...' })}\n\n`;
  // Emit explicit cancellation event so the frontend transitions to true CANCELLED state.
  // The frontend handles eventType === 'cancelled' by marking RUNNING/PENDING stages as
  // CANCELLED and setting runError to 'Analysis was cancelled.' (useFeasibilityRun.ts).
  body += `event: cancelled\ndata: ${JSON.stringify({ type: 'cancelled' })}\n\n`;

  return body;
}

/** Build a full successful SSE response (used to verify Resume actually re-runs pipeline). */
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
    const output = `## Stage ${stage.num}: ${stage.name}\n\nMock output for ${stage.name}.\n`;
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
      webSearchUsed: false,
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

/** Set up standard route mocks for all feasibility tests. */
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

/** Navigate to a project and fill the invention form. */
async function fillInventionForm(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState('networkidle');

  const fillButton = page.locator('button:has-text("Fill in Invention Details")');
  if (await fillButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await fillButton.click();
  }

  await page
    .locator('input[placeholder="Name your invention"]')
    .waitFor({ state: 'visible', timeout: 10_000 });

  await page.locator('input[placeholder="Name your invention"]').fill('E2E Resume Test Invention');
  // 50+ words required by the backend before a feasibility run can start
  await page
    .locator('textarea[placeholder*="detailed description"]')
    .fill(
      'A test invention for end-to-end resume pipeline verification and error recovery testing. ' +
        'This description verifies the resume button behavior that appears after a pipeline enters ' +
        'an ERROR state mid-run, allowing the user to restart from the failed stage without ' +
        'losing previously completed stage outputs or needing to configure the invention again.',
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Resume Pipeline', () => {
  let projectId: string;

  test.beforeEach(async () => {
    projectId = await createProject('E2E Resume Pipeline Test');
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

  test('Resume button appears after pipeline ERROR and initiates new stream', async ({
    page,
    consoleErrors,
  }) => {
    // First run: error after stage 1 (stage 2 fails with stage_error event)
    await setupMocks(page, buildMockSSEWithError());
    await fillInventionForm(page, projectId);

    await page.click('button:has-text("Save & Run Feasibility")');
    await expect(page.locator('text=Confirm Analysis Run')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Start Analysis")');

    // Wait for the error message from the failed stage 2
    await expect(page.locator('text=Rate limited after 3 retries')).toBeVisible({ timeout: 15_000 });
    await screenshot(page, 'resume-error-state');

    // Navigate back to overview so the sidebar actions are visible
    const backButton = page.locator('button:has-text("Back")');
    if (await backButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await backButton.click();
    } else {
      // May already be in overview or sidebar is always visible
      await page.goto(`/projects/${projectId}`);
      await page.waitForLoadState('networkidle');
    }

    await screenshot(page, 'resume-after-error-overview');

    // The Resume button should be visible in the sidebar.
    // ProjectSidebar shows Resume when: has invention, not running, and displayStages has
    // at least one COMPLETE stage AND at least one ERROR or PENDING stage.
    const resumeButton = page.locator('button:has-text("Resume")');
    await expect(resumeButton).toBeVisible({ timeout: 5_000 });
    await screenshot(page, 'resume-button-visible');

    // Set up fresh mocks for the resumed run (full success)
    await setupMocks(page, buildMockSSEResponse());

    // Click Resume
    await resumeButton.click();

    // Cost modal should appear for the new run
    await expect(page.locator('text=Confirm Analysis Run')).toBeVisible({ timeout: 10_000 });
    await screenshot(page, 'resume-cost-modal');

    // Start the resumed analysis
    await page.click('button:has-text("Start Analysis")');

    // Verify new streaming session starts — stage names should appear
    await expect(page.locator('text=Technical Intake & Restatement')).toBeVisible({ timeout: 15_000 });
    await screenshot(page, 'resume-streaming-started');

    // Wait for pipeline to complete
    await expect(page.locator('text=Feasibility analysis complete')).toBeVisible({ timeout: 30_000 });
    await screenshot(page, 'resume-pipeline-complete');
  });

  test('Cancel run — Resume button is NOT shown after cancellation (Run Feasibility shown instead)', async ({
    page,
    consoleErrors,
  }) => {
    // The interrupted SSE body: stream ends without pipeline_complete.
    // The Cancel button click sets run status to CANCELLED.
    // After CANCELLED, stages have status CANCELLED — not ERROR/PENDING —
    // so the Resume button condition (has ERROR or PENDING stage) is NOT met.
    await setupMocks(page, buildMockSSECancelled());
    await fillInventionForm(page, projectId);

    await page.click('button:has-text("Save & Run Feasibility")');
    await expect(page.locator('text=Confirm Analysis Run')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Start Analysis")');

    // Wait for stream-ended state (connection lost or similar message)
    await expect(
      page.locator('text=Connection to analysis service lost'),
    ).toBeVisible({ timeout: 15_000 });

    // Find and click Cancel to register cancellation with the backend
    const cancelButton = page.locator('button:has-text("Cancel")');
    if (await cancelButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cancelButton.click();
      await expect(page.locator('text=analysis was cancelled')).toBeVisible({ timeout: 10_000 });
    }

    // Navigate back to overview
    const backButton = page.locator('button:has-text("Back")');
    if (await backButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await backButton.click();
    } else {
      await page.goto(`/projects/${projectId}`);
      await page.waitForLoadState('networkidle');
    }

    await screenshot(page, 'resume-after-cancel-overview');

    // After CANCELLED state: Resume button should NOT be visible.
    // ProjectSidebar Resume condition requires ERROR or PENDING stages alongside COMPLETE.
    // CANCELLED stages do not satisfy this condition.
    const resumeButton = page.locator('button:has-text("Resume")');
    await expect(resumeButton).not.toBeVisible({ timeout: 3_000 });

    // "Run Feasibility" or "Run from Start" should appear instead
    const runButton = page.locator('button:has-text("Run Feasibility"), button:has-text("Run from Start")');
    await expect(runButton.first()).toBeVisible({ timeout: 5_000 });

    await screenshot(page, 'resume-cancel-run-button-present');
  });
});
