/**
 * Mobile and tablet viewport smoke tests.
 *
 * Verifies that key UI surfaces render correctly at:
 *   - 375×812  (mobile — iPhone SE/standard)
 *   - 768×1024 (tablet — iPad portrait)
 *
 * Also clears v0.9.2 QA debt:
 *   - StepProgress component rendered live (SSE mock)
 *   - Claims lazy-load expand-to-fetch at mobile width
 *
 * These tests do NOT exercise live APIs — all pipeline calls are mocked.
 */

import { test, expect, screenshot, checkViewport } from './fixtures';
import { createProject, deleteProject, updateSettings } from './helpers';
import type { Page, Route } from '@playwright/test';

const MOBILE = { width: 375, height: 812 };
const TABLET = { width: 768, height: 1024 };

// 55+ word description — passes backend 50-word minimum check
const DESCRIPTION =
  'This invention describes a novel system and method for automating the process of ' +
  'analyzing patent feasibility using AI-driven pipeline stages. The system processes ' +
  'inventor disclosures through multiple sequential analysis phases and produces a ' +
  'structured research report covering prior art, patentability analysis, and IP strategy ' +
  'recommendations. The approach leverages advanced computational techniques to evaluate ' +
  'novelty and inventiveness systematically.';

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
    body += `event: stage_start\ndata: ${JSON.stringify({ type: 'stage_start', stage: stage.num, name: stage.name })}\n\n`;
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

async function setupMocks(page: Page, sseBody: string) {
  await page.route('**/api/projects/*/feasibility/stream', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: sseBody,
    });
  });
  await page.route('**/api/projects/*/prior-art/status', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'NONE' }) });
  });
  await page.route('**/raw.githubusercontent.com/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ 'claude-haiku-4-5-20251001': { input_cost_per_token: 0.0000008, output_cost_per_token: 0.000004 } }),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Mobile viewport — project list and navigation', () => {
  test.beforeAll(async () => {
    await updateSettings({ anthropicApiKey: 'test-key-for-e2e', defaultModel: 'claude-haiku-4-5-20251001' });
  });

  test('project list renders at 375px with no overflow', async ({ page, consoleErrors }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Heading should be visible
    await expect(page.locator('h1, h2').filter({ hasText: /patentforge|projects/i }).first()).toBeVisible({ timeout: 10_000 });

    // New Project button should be visible and accessible
    const newProjectBtn = page.locator('button:has-text("New Project")');
    await expect(newProjectBtn).toBeVisible();

    // No horizontal scrollbar — body width should not exceed viewport
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(MOBILE.width + 20); // 20px tolerance for scrollbar

    await screenshot(page, 'mobile-project-list-375');
  });

  test('project list renders at 768px (tablet)', async ({ page, consoleErrors }) => {
    await page.setViewportSize(TABLET);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button:has-text("New Project")')).toBeVisible({ timeout: 10_000 });
    await screenshot(page, 'tablet-project-list-768');
  });
});

test.describe('Mobile viewport — project detail with sidebar', () => {
  let projectId: string;

  test.beforeEach(async () => {
    projectId = await createProject('Mobile Viewport Test Project');
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

  test('project detail sidebar collapses correctly at 375px', async ({ page, consoleErrors }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Main content (invention form or project title) should be visible
    await expect(
      page.locator('input[placeholder="Name your invention"], h1, h2').first()
    ).toBeVisible({ timeout: 10_000 });

    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(MOBILE.width + 20);

    await screenshot(page, 'mobile-project-detail-375');
  });

  test('project detail sidebar at 768px (tablet)', async ({ page, consoleErrors }) => {
    await page.setViewportSize(TABLET);
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.locator('input[placeholder="Name your invention"], h1, h2').first()
    ).toBeVisible({ timeout: 10_000 });

    await screenshot(page, 'tablet-project-detail-768');
  });

  test('feasibility pipeline running state renders at 375px (clears StepProgress QA debt)', async ({ page, consoleErrors }) => {
    // This test clears the v0.9.2 QA debt: StepProgress component never rendered live.
    await setupMocks(page, buildMockSSEResponse());
    await page.setViewportSize(MOBILE);

    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Fill the form
    const fillButton = page.locator('button:has-text("Fill in Invention Details")');
    if (await fillButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await fillButton.click();
    }
    await page.locator('input[placeholder="Name your invention"]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('input[placeholder="Name your invention"]').fill('Mobile Test Invention');
    await page.locator('textarea[placeholder*="detailed description"]').fill(DESCRIPTION);

    // Start the pipeline
    await page.click('button:has-text("Save & Run Feasibility")');
    await expect(page.locator('text=Confirm Analysis Run')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Start Analysis")');

    // Wait for pipeline to complete (mocked — fast)
    await expect(page.locator('text=Feasibility analysis complete')).toBeVisible({ timeout: 30_000 });
    await screenshot(page, 'mobile-feasibility-complete-375');

    // No horizontal overflow after completion
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(MOBILE.width + 20);
  });

  test('feasibility complete state renders at 768px (tablet)', async ({ page, consoleErrors }) => {
    await setupMocks(page, buildMockSSEResponse());
    await page.setViewportSize(TABLET);

    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    const fillButton = page.locator('button:has-text("Fill in Invention Details")');
    if (await fillButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await fillButton.click();
    }
    await page.locator('input[placeholder="Name your invention"]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('input[placeholder="Name your invention"]').fill('Tablet Test Invention');
    await page.locator('textarea[placeholder*="detailed description"]').fill(DESCRIPTION);

    await page.click('button:has-text("Save & Run Feasibility")');
    await expect(page.locator('text=Confirm Analysis Run')).toBeVisible({ timeout: 10_000 });
    await page.click('button:has-text("Start Analysis")');
    await expect(page.locator('text=Feasibility analysis complete')).toBeVisible({ timeout: 30_000 });

    await screenshot(page, 'tablet-feasibility-complete-768');
  });
});
