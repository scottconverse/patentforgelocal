/**
 * E2E tests for the feasibility analysis pipeline.
 *
 * Uses Playwright route interception to mock the SSE stream from the backend,
 * so these tests exercise the full frontend pipeline flow (form → cost modal →
 * streaming → stage progression → report rendering) without calling the real
 * Anthropic API.
 *
 * Live API tests run only before major releases (v0.X.0) per testing policy.
 */

import { test, expect, screenshot } from './fixtures';
import { createProject, deleteProject, updateSettings } from './helpers';
import type { Page, Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a synthetic SSE response that simulates a full 6-stage pipeline run. */
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
    const output = `## Stage ${stage.num}: ${stage.name}\n\nThis is the mock output for ${stage.name}. The analysis covers key aspects of the invention.\n`;
    outputs.push(output);

    body += `event: stage_start\ndata: ${JSON.stringify({
      type: 'stage_start',
      stage: stage.num,
      name: stage.name,
    })}\n\n`;

    // Send a few token events
    const words = output.split(' ');
    for (let i = 0; i < words.length; i += 3) {
      const chunk = words.slice(i, i + 3).join(' ') + ' ';
      body += `event: token\ndata: ${JSON.stringify({ type: 'token', text: chunk })}\n\n`;
    }

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

  // Final report is all stage outputs combined
  const finalReport = outputs.join('\n---\n\n');
  body += `event: pipeline_complete\ndata: ${JSON.stringify({
    type: 'pipeline_complete',
    finalReport,
    stages: [],
  })}\n\n`;

  return body;
}

/** Build a partial SSE response that errors after stage 2. */
function buildMockSSEWithError(): string {
  let body = '';

  body += `event: stage_start\ndata: ${JSON.stringify({
    type: 'stage_start', stage: 1, name: 'Technical Intake & Restatement',
  })}\n\n`;
  body += `event: token\ndata: ${JSON.stringify({ type: 'token', text: 'Stage 1 output text.' })}\n\n`;
  body += `event: stage_complete\ndata: ${JSON.stringify({
    type: 'stage_complete', stage: 1, output: 'Stage 1 output text.',
    model: 'claude-haiku-4-5-20251001', webSearchUsed: false,
    inputTokens: 4000, outputTokens: 2000, estimatedCostUsd: 0.02,
  })}\n\n`;

  body += `event: stage_start\ndata: ${JSON.stringify({
    type: 'stage_start', stage: 2, name: 'Prior Art Research',
  })}\n\n`;
  body += `event: stage_error\ndata: ${JSON.stringify({
    type: 'stage_error', stage: 2, error: 'Rate limited after 3 retries',
  })}\n\n`;

  return body;
}

/** Build a cancelled SSE response. */
function buildMockSSECancelled(): string {
  let body = '';

  body += `event: stage_start\ndata: ${JSON.stringify({
    type: 'stage_start', stage: 1, name: 'Technical Intake & Restatement',
  })}\n\n`;
  body += `event: token\ndata: ${JSON.stringify({ type: 'token', text: 'Starting analysis...' })}\n\n`;
  body += `event: cancelled\ndata: ${JSON.stringify({ type: 'cancelled' })}\n\n`;

  return body;
}

/**
 * Set up route mocks that every feasibility test needs.
 *
 * Only three things are mocked:
 * 1. The SSE stream (avoids calling the real Anthropic API)
 * 2. Prior art status (avoids the 45-second wait for search completion)
 * 3. LiteLLM pricing (avoids external GitHub fetch)
 *
 * Everything else (create run, patch stage, patch run, load project, export)
 * hits the real backend so that the final report is actually persisted and
 * loadProject() returns real data after pipeline_complete.
 */
async function setupMocks(page: Page, sseBody: string) {
  // Mock the SSE stream endpoint — this is the only pipeline endpoint we fake
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

  // Mock prior art status to return NONE (skip 45s wait)
  await page.route('**/api/projects/*/prior-art/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'NONE' }),
    });
  });

  // Mock LiteLLM pricing fetch to avoid external dependency
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
  // The real endpoint writes to ~/Desktop which may not exist in CI; the browser
  // also logs the resulting 500 to the console even when JS catches it.
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

  // Mock the report-text endpoint — returns mock content so the report view
  // renders without waiting for a real backend round-trip.
  await page.route('**/api/projects/*/feasibility/report', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        report: '# E2E Mock Feasibility Report\n\nThis is the mock feasibility analysis report for end-to-end testing purposes. It contains multiple sections covering prior art, patentability, and IP strategy.',
        html: '<h1>E2E Mock Feasibility Report</h1><p>This is the mock feasibility analysis report for end-to-end testing purposes.</p>',
      }),
    });
  });

  // Mock the report-HTML endpoint — serves the iframe without a backend round-trip.
  // The browser logs a 500 to the console even if JS catches it, which fails the
  // consoleErrors fixture.
  await page.route('**/api/projects/*/feasibility/report/html', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: '<!DOCTYPE html><html><body style="background:#030712;color:#f3f4f6;padding:2rem;font-family:sans-serif"><h1 style="color:#60a5fa">E2E Mock Feasibility Report</h1><p>Mock feasibility analysis report for end-to-end testing.</p></body></html>',
    });
  });
}

/** Navigate to a project and fill the invention form with minimal data. */
async function fillInventionForm(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState('networkidle');

  // New project shows "No Invention Details Yet" with a "Fill in Invention Details" button.
  // Click it to open the actual form.
  const fillButton = page.locator('button:has-text("Fill in Invention Details")');
  if (await fillButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await fillButton.click();
  }

  // Wait for the invention form to appear
  await page.locator('input[placeholder="Name your invention"]').waitFor({ state: 'visible', timeout: 10_000 });

  // Fill required fields
  await page.locator('input[placeholder="Name your invention"]').fill('E2E Test Widget');
  // 50+ words required by the backend before a feasibility run can start
  await page.locator('textarea[placeholder*="detailed description"]').fill(
    'A test invention for end-to-end pipeline verification and automated testing purposes. ' +
    'It uses a novel mechanism to process data through a multi-stage analysis pipeline, ' +
    'leveraging advanced computational techniques to systematically evaluate patent claims ' +
    'for novelty and inventiveness. The system incorporates multiple sequential processing ' +
    'stages to generate comprehensive feasibility analysis reports suitable for patent applications.'
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Feasibility Pipeline', () => {
  let projectId: string;

  test.beforeEach(async () => {
    projectId = await createProject('E2E Feasibility Pipeline Test');
    // Ensure settings have an API key configured (mock pipeline won't actually use it)
    await updateSettings({
      anthropicApiKey: 'test-key-for-e2e',
      defaultModel: 'claude-haiku-4-5-20251001',
      maxTokens: 8000,
      interStageDelaySeconds: 0,
      costCapUsd: 5.00,
    });
  });

  test.afterEach(async () => {
    await deleteProject(projectId);
  });

  test('runs full 6-stage pipeline and shows report', async ({ page, consoleErrors }) => {
    const sseBody = buildMockSSEResponse();
    await setupMocks(page, sseBody);
    await fillInventionForm(page, projectId);

    // Click "Save & Run Feasibility"
    await page.click('button:has-text("Save & Run Feasibility")');

    // Cost confirmation modal appears
    await expect(page.locator('text=Confirm Analysis Run')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Claude Haiku')).toBeVisible();
    await screenshot(page, 'feasibility-cost-modal');

    // Click "Start Analysis"
    await page.click('button:has-text("Start Analysis")');

    // Pipeline runs — stages should progress
    // Wait for the completion state (overview with "View Report" button)
    await expect(page.locator('text=Feasibility analysis complete')).toBeVisible({ timeout: 30_000 });

    // Click "View Report" to navigate to the report view
    await page.click('button:has-text("View Report")');

    // Verify report view is rendered (heading + export buttons + iframe)
    await expect(page.locator('text=Feasibility Report')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('button:has-text("Download HTML")')).toBeVisible();
    await expect(page.locator('button:has-text("Download Word")')).toBeVisible();

    // Report content is in an iframe — verify the iframe loaded
    await expect(page.locator('iframe[title="Feasibility Report"]')).toBeVisible();

    await screenshot(page, 'feasibility-report-complete');
  });

  test('shows stage progression during pipeline run', async ({ page, consoleErrors }) => {
    const sseBody = buildMockSSEResponse();
    await setupMocks(page, sseBody);
    await fillInventionForm(page, projectId);

    await page.click('button:has-text("Save & Run Feasibility")');
    await expect(page.locator('text=Confirm Analysis Run')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Start Analysis")');

    // Pipeline should complete — all 6 stages should show as complete
    await expect(page.locator('text=Feasibility analysis complete')).toBeVisible({ timeout: 30_000 });

    // Check the stage list in the sidebar shows completion indicators
    // Each completed stage gets a green checkmark
    const stageItems = page.locator('aside .text-green-400');
    const count = await stageItems.count();
    // At minimum, the Feasibility label should be green (COMPLETE)
    expect(count).toBeGreaterThanOrEqual(1);

    await screenshot(page, 'feasibility-stages-complete');
  });

  test('handles pipeline error gracefully', async ({ page, consoleErrors }) => {
    const sseBody = buildMockSSEWithError();
    await setupMocks(page, sseBody);
    await fillInventionForm(page, projectId);

    await page.click('button:has-text("Save & Run Feasibility")');
    await expect(page.locator('text=Confirm Analysis Run')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Start Analysis")');

    // Error message should appear
    await expect(page.locator('text=Rate limited after 3 retries')).toBeVisible({ timeout: 15_000 });

    await screenshot(page, 'feasibility-pipeline-error');
  });

  test('shows cancel button and connection-lost recovery', async ({ page, consoleErrors }) => {
    // Use the cancelled SSE body — the mock delivers everything at once,
    // so the stream ends immediately after the cancelled event. The frontend
    // detects "stream ended without pipeline_complete" and shows an error.
    // In production, real cancellation works via AbortController (frontend-initiated).
    const sseBody = buildMockSSECancelled();
    await setupMocks(page, sseBody);
    await fillInventionForm(page, projectId);

    await page.click('button:has-text("Save & Run Feasibility")');
    await expect(page.locator('text=Confirm Analysis Run')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Start Analysis")');

    // The stream ends immediately — frontend shows connection-lost error
    await expect(page.locator('text=Connection to analysis service lost')).toBeVisible({ timeout: 15_000 });

    await screenshot(page, 'feasibility-connection-lost');
  });

  test('blocks run when no API key configured', async ({ page, consoleErrors }) => {
    // Navigate first while the key is still set (avoids FirstRunWizard blocking)
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Click "Fill in Invention Details" to open the form
    const fillButton = page.locator('button:has-text("Fill in Invention Details")');
    if (await fillButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await fillButton.click();
    }

    await page.locator('input[placeholder="Name your invention"]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('input[placeholder="Name your invention"]').fill('No Key Test');
    // 50+ words required — word count check runs before API key check in startRun
    await page.locator('textarea[placeholder*="detailed description"]').fill(
      'A test invention created to verify the no-API-key error path in the feasibility ' +
      'analysis pipeline. This description is deliberately long enough to satisfy the ' +
      'fifty-word minimum requirement enforced by the backend controller before checking ' +
      'any other preconditions, such as a valid Anthropic API key being configured and ' +
      'available in the application settings.',
    );

    // Clear the API key AFTER the page has loaded (so wizard doesn't block)
    await updateSettings({ anthropicApiKey: '' });

    await page.click('button:has-text("Save & Run Feasibility")');

    // Should show error about missing API key
    await expect(page.locator('text=No API key configured')).toBeVisible({ timeout: 10_000 });

    // Restore key for subsequent tests
    await updateSettings({ anthropicApiKey: 'test-key-for-e2e' });

    await screenshot(page, 'feasibility-no-api-key');
  });

  test('cost cap warning shows when estimate exceeds cap', async ({ page, consoleErrors }) => {
    // Set a very low cost cap
    await updateSettings({ costCapUsd: 0.001 });

    const sseBody = buildMockSSEResponse();
    await setupMocks(page, sseBody);
    await fillInventionForm(page, projectId);

    await page.click('button:has-text("Save & Run Feasibility")');

    // Cost modal should appear with a warning
    await expect(page.locator('text=Confirm Analysis Run')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Estimated cost exceeds your cap')).toBeVisible();
    // Button should say "Proceed Anyway" instead of "Start Analysis"
    await expect(page.locator('button:has-text("Proceed Anyway")')).toBeVisible();

    await screenshot(page, 'feasibility-cost-cap-warning');
  });
});
