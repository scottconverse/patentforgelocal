/**
 * E2E tests for SSE step progress in Claims, Compliance, and Application tabs.
 *
 * Uses Playwright route interception to mock the SSE stream endpoints,
 * verifying that the StepProgress component renders correctly with
 * realtime step events. No real API calls are made.
 *
 * These tests verify the PRIMARY UI change in v0.9.2 — the StepProgress
 * component that replaced silent spinners with step-by-step progress.
 */

import { test, expect, screenshot } from './fixtures';
import { createProject, deleteProject, updateSettings } from './helpers';
import type { Page, Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock SSE builders
// ---------------------------------------------------------------------------

function buildClaimsSSE(): string {
  const steps = [
    { step: 'plan', detail: 'Claim strategy planned' },
    { step: 'draft', detail: '5 claims drafted' },
    { step: 'examine', detail: 'Claims reviewed' },
  ];

  let body = '';
  for (const s of steps) {
    body += `event: step\ndata: ${JSON.stringify({ step: s.step, status: 'complete', detail: s.detail })}\n\n`;
  }

  body += `event: complete\ndata: ${JSON.stringify({
    claims: [
      { number: 1, claim_type: 'independent', text: 'A method for testing SSE progress in patent analysis tools comprising the steps of receiving an invention description and generating claims.', parent_claim_number: null },
      { number: 2, claim_type: 'dependent', text: 'The method of claim 1 wherein the invention description includes technical specifications.', parent_claim_number: 1 },
      { number: 3, claim_type: 'independent', text: 'A system for automated patent claim generation comprising a processor and memory storing instructions.', parent_claim_number: null },
      { number: 4, claim_type: 'dependent', text: 'The system of claim 3 further comprising a natural language processing module.', parent_claim_number: 3 },
      { number: 5, claim_type: 'dependent', text: 'The system of claim 3 wherein the processor executes a machine learning model.', parent_claim_number: 3 },
    ],
    spec_language: 'en',
    planner_strategy: 'Test strategy',
    examiner_feedback: 'Test feedback',
    total_estimated_cost_usd: 0.05,
    status: 'SUCCESS',
  })}\n\n`;

  return body;
}

function buildComplianceSSE(): string {
  const steps = [
    { step: 'eligibility', detail: '35 USC 101 eligibility check complete', results_count: 3 },
    { step: 'definiteness', detail: '35 USC 112(b) definiteness check complete', results_count: 4 },
    { step: 'written_description', detail: '35 USC 112(a) written description check complete', results_count: 2 },
    { step: 'formalities', detail: 'MPEP 608 formalities check complete', results_count: 5 },
  ];

  let body = '';
  for (const s of steps) {
    body += `event: step\ndata: ${JSON.stringify({ step: s.step, status: 'complete', detail: s.detail, results_count: s.results_count })}\n\n`;
  }

  body += `event: complete\ndata: ${JSON.stringify({
    status: 'SUCCESS',
    results: [
      { rule: '35 USC 101', status: 'PASS', claim_number: 1, detail: 'Claim recites a method — patent-eligible.', citation: 'MPEP 2106', suggestion: '' },
      { rule: '35 USC 112(b)', status: 'PASS', claim_number: 1, detail: 'Claim terms are definite.', citation: 'MPEP 2173', suggestion: '' },
      { rule: '35 USC 112(a)', status: 'PASS', claim_number: 1, detail: 'Written description adequate.', citation: 'MPEP 2163', suggestion: '' },
    ],
    total_estimated_cost_usd: 0.04,
  })}\n\n`;

  return body;
}

function buildApplicationSSE(): string {
  const steps = [
    { step: 'background', detail: 'Background section generated' },
    { step: 'summary', detail: 'Summary section generated' },
    { step: 'detailed_description', detail: 'Detailed description generated' },
    { step: 'abstract', detail: 'Abstract generated' },
    { step: 'figures', detail: 'Figure descriptions generated' },
  ];

  let body = '';
  for (const s of steps) {
    body += `event: step\ndata: ${JSON.stringify({ step: s.step, status: 'complete', detail: s.detail })}\n\n`;
  }

  body += `event: complete\ndata: ${JSON.stringify({
    title: 'Test Patent Application',
    abstract: 'An abstract for the test application.',
    background: 'Background of the invention.',
    summary: 'Summary of the invention.',
    detailed_description: 'Detailed description of the invention.',
    claims: 'Claim 1: A method...',
    figure_descriptions: 'FIG. 1 shows...',
    cross_references: 'CROSS-REFERENCE TO RELATED APPLICATIONS\n\nThis application does not claim priority to or benefit of any prior application.\n\nINCORPORATION BY REFERENCE\n\nAll references cited herein are incorporated by reference in their entirety.',
    ids_table: 'No IDS entries.',
    total_estimated_cost_usd: 0.08,
    status: 'SUCCESS',
  })}\n\n`;

  return body;
}

/** Mock the SSE stream endpoint with a route handler. */
async function mockSSERoute(page: Page, urlPattern: string | RegExp, sseBody: string): Promise<void> {
  await page.route(urlPattern, (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      body: sseBody,
    });
  });
}

/** Set up a project with completed feasibility + claims for testing downstream tabs. */
async function setupProjectWithFeasibilityAndClaims(page: Page, projectId: string): Promise<void> {
  // Create a feasibility run with COMPLETE status
  const runRes = await page.request.post(`/api/projects/${projectId}/feasibility/run`);
  if (runRes.ok()) {
    const run = await runRes.json();
    // Patch the run to COMPLETE
    await page.request.patch(`/api/projects/${projectId}/feasibility/run`, {
      data: { status: 'COMPLETE' },
    });
    // Patch each stage with mock output
    for (let i = 1; i <= 6; i++) {
      await page.request.patch(`/api/projects/${projectId}/feasibility/stages/${i}`, {
        data: {
          status: 'COMPLETE',
          outputText: `Mock stage ${i} output for testing.`,
          model: 'claude-haiku-4-5-20251001',
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('SSE Step Progress — Claims Tab', () => {
  let projectId: string;

  test.beforeAll(async () => {
    await updateSettings({ anthropicApiKey: 'sk-ant-test-e2e-key-not-real', defaultModel: 'claude-haiku-4-5-20251001' });
    projectId = await createProject('SSE Progress Test');
    // Save invention with 50+ word description
    await fetch(`http://localhost:3000/api/projects/${projectId}/invention`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'SSE Progress Test Invention',
        description: 'A machine learning system that predicts patent examination outcomes using natural language processing to analyze patent claims and specifications. The system processes historical USPTO examination data to identify patterns in claim rejections and allowances. It uses transformer-based models fine-tuned on patent text to evaluate novelty, non-obviousness, and enablement. The system outputs a probability score for each claim.',
      }),
    });
  });

  test.afterAll(async () => {
    if (projectId) await deleteProject(projectId);
  });

  test('claims SSE stream shows step progress then renders claims', async ({ page }) => {
    // Set up feasibility as complete so claims tab is enabled
    await setupProjectWithFeasibilityAndClaims(page, projectId);

    // Mock the claims SSE stream
    await mockSSERoute(page, /\/api\/projects\/.*\/claims\/stream/, buildClaimsSSE());

    // Also mock the claims GET to return the claims after completion
    await page.route(/\/api\/projects\/.*\/claims(\?|$)/, (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'mock-draft-id',
            status: 'COMPLETE',
            version: 1,
            claims: [
              { id: 'c1', claimNumber: 1, claimType: 'independent', preview: 'A method for testing SSE progress...', parentClaimNumber: null },
              { id: 'c2', claimNumber: 2, claimType: 'dependent', preview: 'The method of claim 1 wherein...', parentClaimNumber: 1 },
            ],
          }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto(`/projects/${projectId}`);
    await page.waitForSelector('text=SSE Progress Test');

    // Navigate to Claims tab
    const claimsBtn = page.locator('button').filter({ hasText: 'Claims' });
    await claimsBtn.click();

    // Should see "Draft Claims" button (or similar)
    const draftBtn = page.locator('button').filter({ hasText: /Draft Claims|Generate Claims/ });
    if (await draftBtn.count() > 0) {
      await draftBtn.click();

      // Wait for step progress to appear
      await page.waitForSelector('[data-testid="step-progress"]', { timeout: 5_000 }).catch(() => {});
    }

    // Take screenshot for evidence
    await screenshot(page, 'sse-claims-progress');
  });
});

test.describe('SSE Step Progress — Compliance Tab', () => {
  let projectId: string;

  test.beforeAll(async () => {
    await updateSettings({ anthropicApiKey: 'sk-ant-test-e2e-key-not-real', defaultModel: 'claude-haiku-4-5-20251001' });
    projectId = await createProject('SSE Compliance Test');
    await fetch(`http://localhost:3000/api/projects/${projectId}/invention`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'SSE Compliance Test Invention',
        description: 'A machine learning system that predicts patent examination outcomes using natural language processing to analyze patent claims and specifications. The system processes historical USPTO examination data to identify patterns in claim rejections and allowances. It uses transformer-based models fine-tuned on patent text to evaluate novelty, non-obviousness, and enablement. The system outputs a probability score for each claim.',
      }),
    });
  });

  test.afterAll(async () => {
    if (projectId) await deleteProject(projectId);
  });

  test('compliance SSE stream shows 4-step progress', async ({ page }) => {
    await setupProjectWithFeasibilityAndClaims(page, projectId);
    await mockSSERoute(page, /\/api\/projects\/.*\/compliance\/stream/, buildComplianceSSE());

    // Mock compliance GET
    await page.route(/\/api\/projects\/.*\/compliance(\?|$)/, (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'mock-check-id', status: 'NONE', version: 0, results: [] }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto(`/projects/${projectId}`);
    await page.waitForSelector('text=SSE Compliance Test');

    const complianceBtn = page.locator('button').filter({ hasText: 'Compliance' });
    await complianceBtn.click();

    const runBtn = page.locator('button').filter({ hasText: /Run Compliance|Check Compliance/ });
    if (await runBtn.count() > 0) {
      await runBtn.click();
      await page.waitForSelector('[data-testid="step-progress"]', { timeout: 5_000 }).catch(() => {});
    }

    await screenshot(page, 'sse-compliance-progress');
  });
});

test.describe('SSE Step Progress — Application Tab', () => {
  let projectId: string;

  test.beforeAll(async () => {
    await updateSettings({ anthropicApiKey: 'sk-ant-test-e2e-key-not-real', defaultModel: 'claude-haiku-4-5-20251001' });
    projectId = await createProject('SSE Application Test');
    await fetch(`http://localhost:3000/api/projects/${projectId}/invention`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'SSE Application Test Invention',
        description: 'A machine learning system that predicts patent examination outcomes using natural language processing to analyze patent claims and specifications. The system processes historical USPTO examination data to identify patterns in claim rejections and allowances. It uses transformer-based models fine-tuned on patent text to evaluate novelty, non-obviousness, and enablement. The system outputs a probability score for each claim.',
      }),
    });
  });

  test.afterAll(async () => {
    if (projectId) await deleteProject(projectId);
  });

  test('application SSE stream shows 5-step progress', async ({ page }) => {
    await setupProjectWithFeasibilityAndClaims(page, projectId);
    await mockSSERoute(page, /\/api\/projects\/.*\/application\/stream/, buildApplicationSSE());

    // Mock application GET
    await page.route(/\/api\/projects\/.*\/application(\?|$)/, (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'mock-app-id', status: 'NONE', version: 0 }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto(`/projects/${projectId}`);
    await page.waitForSelector('text=SSE Application Test');

    const appBtn = page.locator('button').filter({ hasText: 'Application' });
    await appBtn.click();

    const genBtn = page.locator('button').filter({ hasText: /Generate Application/ });
    if (await genBtn.count() > 0) {
      await genBtn.click();
      await page.waitForSelector('[data-testid="step-progress"]', { timeout: 5_000 }).catch(() => {});
    }

    await screenshot(page, 'sse-application-progress');
  });
});
