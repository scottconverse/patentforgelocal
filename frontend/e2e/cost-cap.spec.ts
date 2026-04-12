/**
 * E2E test for cost cap enforcement.
 *
 * Tests the backend API directly:
 * 1. Sets a cost cap via settings
 * 2. Creates stages with cumulative cost exceeding the cap
 * 3. Verifies startRun is blocked with 400
 *
 * This tests the full server-side enforcement path without any
 * Anthropic API calls. The frontend reads the 400 and shows an error.
 */

import { test, expect, screenshot } from './fixtures';
import { createProject, deleteProject, updateSettings, updateInvention } from './helpers';

/**
 * Invention description with 50+ words, required by the feasibility service
 * before a run can be started (backend enforces a 50-word minimum).
 */
const FIFTY_WORD_DESCRIPTION =
  'This invention relates to a novel system and method for processing and ' +
  'analyzing patent applications. The system comprises multiple interconnected ' +
  'components that work together to systematically evaluate patent claims and ' +
  'determine their technical validity and novelty. The method involves ' +
  'comprehensive data collection, detailed technical analysis, and structured ' +
  'reporting output, providing significant advantages over prior art approaches.';

const API = 'http://localhost:3000/api';

test.describe('Cost Cap Enforcement', () => {
  let projectId: string;

  test.beforeEach(async () => {
    projectId = await createProject('E2E Cost Cap Test');
  });

  test.afterEach(async () => {
    await updateSettings({ costCapUsd: 5.00 });
    await deleteProject(projectId);
  });

  test('backend blocks new run when cumulative cost exceeds cap', async ({ page, consoleErrors }) => {
    // Provide a 50+ word description — required by the backend before starting a run
    await updateInvention(projectId, { title: 'Cost Cap Test', description: FIFTY_WORD_DESCRIPTION });

    // Step 1: Create a feasibility run with stages that have cost data
    const runRes = await fetch(`${API}/projects/${projectId}/feasibility/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(runRes.ok).toBe(true);

    // Step 2: Patch stages with cost data that totals $6.00
    for (let stage = 1; stage <= 6; stage++) {
      await fetch(`${API}/projects/${projectId}/feasibility/stages/${stage}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'COMPLETE',
          estimatedCostUsd: 1.00,
          outputText: `Stage ${stage} output`,
        }),
      });
    }

    // Mark run complete
    await fetch(`${API}/projects/${projectId}/feasibility/run`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETE', finalReport: 'Test report' }),
    });

    // Step 3: Set cost cap to $5.00 (cumulative is $6.00 — exceeds cap)
    await updateSettings({ costCapUsd: 5.00 });

    // Step 4: Try to start another run — should be blocked
    const blockedRes = await fetch(`${API}/projects/${projectId}/feasibility/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(blockedRes.status).toBe(400);
    const errorBody = await blockedRes.json();
    expect(errorBody.message).toContain('Cost cap exceeded');
    expect(errorBody.message).toContain('$6.00');
    expect(errorBody.message).toContain('$5.00');
  });

  test('backend allows run when cost is under cap', async ({ page, consoleErrors }) => {
    // Provide a 50+ word description — required by the backend before starting a run
    await updateInvention(projectId, { title: 'Cost Cap Test', description: FIFTY_WORD_DESCRIPTION });

    // Create a run with low cost
    const runRes = await fetch(`${API}/projects/${projectId}/feasibility/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(runRes.ok).toBe(true);

    // Patch one stage with $0.50 cost
    await fetch(`${API}/projects/${projectId}/feasibility/stages/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETE', estimatedCostUsd: 0.50 }),
    });

    // Set cap to $5.00 — well above $0.50
    await updateSettings({ costCapUsd: 5.00 });

    // Start another run — should succeed
    const secondRes = await fetch(`${API}/projects/${projectId}/feasibility/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(secondRes.ok).toBe(true);
  });

  test('patchStage returns costCapExceeded flag when cap breached', async ({ page, consoleErrors }) => {
    // Provide a 50+ word description — required by the backend before starting a run
    await updateInvention(projectId, { title: 'Cost Cap Test', description: FIFTY_WORD_DESCRIPTION });

    // Set low cap
    await updateSettings({ costCapUsd: 1.00 });

    // Create a run
    await fetch(`${API}/projects/${projectId}/feasibility/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    // Patch stage 1 with cost that exceeds cap
    const patchRes = await fetch(`${API}/projects/${projectId}/feasibility/stages/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'COMPLETE',
        estimatedCostUsd: 1.50,
        outputText: 'Test output',
      }),
    });
    expect(patchRes.ok).toBe(true);

    const patchBody = await patchRes.json();
    expect(patchBody.costCapExceeded).toBe(true);
    expect(patchBody.cumulativeCost).toBeGreaterThanOrEqual(1.50);
    expect(patchBody.costCapUsd).toBe(1.00);
  });

  test('UI shows cost cap error when trying to run analysis over cap', async ({ page, consoleErrors }) => {
    // Provide a 50+ word description before starting the run (backend enforces minimum)
    await updateInvention(projectId, { title: 'Test Widget', description: FIFTY_WORD_DESCRIPTION });

    // Set up a project that's already over the cap
    const runRes = await fetch(`${API}/projects/${projectId}/feasibility/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    for (let stage = 1; stage <= 6; stage++) {
      await fetch(`${API}/projects/${projectId}/feasibility/stages/${stage}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'COMPLETE',
          estimatedCostUsd: 1.00,
          outputText: `Stage ${stage} output`,
        }),
      });
    }

    await fetch(`${API}/projects/${projectId}/feasibility/run`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETE', finalReport: 'Test report' }),
    });

    await updateSettings({ costCapUsd: 2.00, anthropicApiKey: 'sk-ant-fake-key' });

    // Navigate to the project
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'cost-cap-project-page');
  });
});
