/**
 * E2E tests for download/export buttons across all pipeline tabs.
 *
 * Each test is self-contained: creates a project via API, sets up route
 * mocks for all data and export endpoints to simulate a fully completed
 * project, then verifies that clicking export buttons triggers file downloads.
 *
 * Verified buttons:
 *   - Feasibility tab: Download HTML, Download Word
 *   - Claims tab: Export Word
 *   - Compliance tab: Export Word
 *   - Application tab: Export Word, Export Markdown
 */

import { test, expect } from './fixtures';
import { createProject, deleteProject } from './helpers';
import type { Page } from '@playwright/test';

let projectId: string;

test.describe('Download Buttons — Export to Disk', () => {
  test.beforeEach(async () => {
    projectId = await createProject('E2E Download Test');
  });

  test.afterEach(async () => {
    await deleteProject(projectId);
  });

  // ---------------------------------------------------------------------------
  // Mock setup — makes the project appear fully completed across all tabs
  // ---------------------------------------------------------------------------

  async function setupMocks(page: Page) {
    // ── Project detail — completed project with feasibility data ──
    await page.route(`**/api/projects/${projectId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: projectId,
          title: 'E2E Download Test',
          status: 'APPLICATION',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:01:00.000Z',
          invention: {
            id: 'inv-1',
            projectId,
            title: 'Test Invention',
            description:
              'A test invention with enough words to pass the fifty word minimum ' +
              'requirement for feasibility analysis to begin in the PatentForge ' +
              'pipeline system during end-to-end testing of the download feature.',
          },
          feasibility: [
            {
              id: 'run-1',
              projectId,
              version: 1,
              status: 'COMPLETE',
              startedAt: '2025-01-01T00:00:00.000Z',
              completedAt: '2025-01-01T00:01:00.000Z',
              finalReport: '# Test Report\n\nMock content for testing.',
              stages: [1, 2, 3, 4, 5, 6].map((n) => ({
                id: `stage-${n}`,
                feasibilityRunId: 'run-1',
                stageNumber: n,
                stageName: `Stage ${n}`,
                status: 'COMPLETE',
                outputText: null, // project GET excludes outputText
                model: 'claude-haiku-4-5-20251001',
                webSearchUsed: false,
                startedAt: '2025-01-01T00:00:00.000Z',
                completedAt: '2025-01-01T00:00:10.000Z',
                estimatedCostUsd: 0.01,
              })),
            },
          ],
        }),
      });
    });

    // ── Feasibility full run (called by useViewInit for stage data) ──
    await page.route(
      new RegExp(`/api/projects/${projectId}/feasibility$`),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'run-1',
            projectId,
            version: 1,
            status: 'COMPLETE',
            stages: [1, 2, 3, 4, 5, 6].map((n) => ({
              id: `stage-${n}`,
              feasibilityRunId: 'run-1',
              stageNumber: n,
              stageName: `Stage ${n}`,
              status: 'COMPLETE',
              outputText: `## Stage ${n}\n\nMock output for stage ${n}.`,
              model: 'claude-haiku-4-5-20251001',
              webSearchUsed: false,
              estimatedCostUsd: 0.01,
            })),
          }),
        });
      },
    );

    // ── Feasibility report (for useReportContent) ──
    await page.route(
      new RegExp(`/api/projects/${projectId}/feasibility/report$`),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            report: '# E2E Mock Report\n\nMock content for download testing.',
            html: '<h1>E2E Mock Report</h1><p>Mock content for download testing.</p>',
          }),
        });
      },
    );

    // ── Report HTML (for ReportViewer iframe) ──
    await page.route(
      `**/api/projects/${projectId}/feasibility/report/html`,
      async (route) => {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
          body: '<!DOCTYPE html><html><body><h1>Mock Report</h1></body></html>',
        });
      },
    );

    // ── Feasibility HTML export ──
    await page.route(
      `**/api/projects/${projectId}/feasibility/export/html`,
      async (route) => {
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
          body: '<!DOCTYPE html><html><body><h1>Mock Feasibility Export</h1></body></html>',
        });
      },
    );

    // ── Feasibility DOCX export ──
    await page.route(
      `**/api/projects/${projectId}/feasibility/export/docx`,
      async (route) => {
        await route.fulfill({
          status: 200,
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          body: Buffer.from('mock-docx-content'),
        });
      },
    );

    // ── Claims data (completed draft with one claim) ──
    await page.route(
      new RegExp(`/api/projects/${projectId}/claims$`),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'draft-1',
            version: 1,
            status: 'COMPLETE',
            claims: [
              {
                id: 'claim-1',
                claimNumber: 1,
                claimType: 'INDEPENDENT',
                scopeLevel: 'broad',
                statutoryType: 'method',
                parentClaimNumber: null,
                preview: 'A method for testing download functionality in E2E tests.',
                examinerNotes: '',
              },
            ],
            specLanguage: null,
            plannerStrategy: null,
            examinerFeedback: null,
            revisionNotes: null,
          }),
        });
      },
    );

    // ── Claims DOCX export ──
    await page.route(
      `**/api/projects/${projectId}/claims/export/docx`,
      async (route) => {
        await route.fulfill({
          status: 200,
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          body: Buffer.from('mock-docx-content'),
        });
      },
    );

    // ── Compliance data (completed check with one passing result) ──
    await page.route(
      new RegExp(`/api/projects/${projectId}/compliance$`),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'check-1',
            status: 'COMPLETE',
            overallPass: true,
            results: [
              {
                rule: '112a_written_description',
                status: 'PASS',
                claimNumber: 1,
                detail: 'Written description requirement met.',
                citation: null,
                suggestion: null,
              },
            ],
            estimatedCostUsd: 0.05,
          }),
        });
      },
    );

    // ── Compliance DOCX export ──
    await page.route(
      `**/api/projects/${projectId}/compliance/export/docx`,
      async (route) => {
        await route.fulfill({
          status: 200,
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          body: Buffer.from('mock-docx-content'),
        });
      },
    );

    // ── Application data (completed with sections) ──
    await page.route(
      new RegExp(`/api/projects/${projectId}/application$`),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'app-1',
            version: 1,
            status: 'COMPLETE',
            title: 'Test Patent Application',
            crossReferences: 'None',
            background: 'Test background section.',
            summary: 'Test summary section.',
            detailedDescription: 'Test detailed description.',
            claims: '1. A test claim.',
            abstract: 'Test abstract.',
            figureDescriptions: '',
            idsTable: '',
          }),
        });
      },
    );

    // ── Application DOCX export ──
    await page.route(
      `**/api/projects/${projectId}/application/export/docx`,
      async (route) => {
        await route.fulfill({
          status: 200,
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          body: Buffer.from('mock-docx-content'),
        });
      },
    );

    // ── Application Markdown export ──
    // The frontend uses req<string> which calls res.json(), so return JSON.
    await page.route(
      `**/api/projects/${projectId}/application/export/markdown`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify('# Mock Patent Application\n\nMock markdown content.'),
        });
      },
    );

    // ── Prior art (empty state — not needed for downloads) ──
    await page.route(
      new RegExp(`/api/projects/${projectId}/prior-art`),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'NONE' }),
        });
      },
    );

    // ── Cost estimate (avoids 404 when sidebar loads) ──
    await page.route(
      `**/api/projects/${projectId}/feasibility/cost-estimate`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            hasHistory: true,
            runsUsed: 1,
            stagesUsed: 6,
            avgInputTokens: 4000,
            avgOutputTokens: 2000,
            avgCostPerStage: 0.01,
          }),
        });
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Feasibility tab — Download HTML
  // ---------------------------------------------------------------------------

  test('feasibility HTML export downloads a file', async ({ page, consoleErrors }) => {
    await setupMocks(page);
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Navigate to report view via sidebar "View Report" button
    const sidebarViewReport = page.locator('aside').locator('text=View Report');
    await expect(sidebarViewReport).toBeVisible({ timeout: 5_000 });
    await sidebarViewReport.click();
    await page.waitForLoadState('networkidle');

    // Wait for download buttons to appear
    await expect(page.locator('text=Download HTML')).toBeVisible({ timeout: 5_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.click('text=Download HTML');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.html$/);
    const path = await download.path();
    expect(path).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Feasibility tab — Download Word
  // ---------------------------------------------------------------------------

  test('feasibility Word export downloads a file', async ({ page, consoleErrors }) => {
    await setupMocks(page);
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    const sidebarViewReport = page.locator('aside').locator('text=View Report');
    await expect(sidebarViewReport).toBeVisible({ timeout: 5_000 });
    await sidebarViewReport.click();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Download Word')).toBeVisible({ timeout: 5_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.click('text=Download Word');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.docx$/);
    const path = await download.path();
    expect(path).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Claims tab — Export Word
  // ---------------------------------------------------------------------------

  test('claims Word export downloads a file', async ({ page, consoleErrors }) => {
    await setupMocks(page);
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Navigate to Claims tab via sidebar
    await page.click('button:has-text("Claims")');
    await page.waitForLoadState('networkidle');

    // Wait for the Export Word button inside the claims view
    await expect(page.locator('main').locator('text=Export Word').first()).toBeVisible({
      timeout: 5_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.locator('main').locator('text=Export Word').first().click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.docx$/);
    const path = await download.path();
    expect(path).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Compliance tab — Export Word
  // ---------------------------------------------------------------------------

  test('compliance Word export downloads a file', async ({ page, consoleErrors }) => {
    await setupMocks(page);
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Navigate to Compliance tab via sidebar
    await page.click('button:has-text("Compliance")');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main').locator('text=Export Word').first()).toBeVisible({
      timeout: 5_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.locator('main').locator('text=Export Word').first().click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.docx$/);
    const path = await download.path();
    expect(path).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Application tab — Export Word
  // ---------------------------------------------------------------------------

  test('application Word export downloads a file', async ({ page, consoleErrors }) => {
    await setupMocks(page);
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Navigate to Application tab via sidebar
    await page.click('button:has-text("Application")');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main').locator('text=Export Word').first()).toBeVisible({
      timeout: 5_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.locator('main').locator('text=Export Word').first().click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.docx$/);
    const path = await download.path();
    expect(path).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Application tab — Export Markdown
  // ---------------------------------------------------------------------------

  test('application Markdown export downloads a file', async ({ page, consoleErrors }) => {
    await setupMocks(page);
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Navigate to Application tab via sidebar
    await page.click('button:has-text("Application")');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Export Markdown')).toBeVisible({ timeout: 5_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.click('text=Export Markdown');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.md$/);
    const path = await download.path();
    expect(path).toBeTruthy();
  });
});
