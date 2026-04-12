import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useViewInit } from './useViewInit';

vi.mock('../api', () => ({
  api: {
    feasibility: {
      get: vi.fn(),
      patchRun: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { api } from '../api';

const makeStage = (n: number, withOutput = false) => ({
  id: `stage-${n}`,
  feasibilityRunId: 'run-1',
  stageNumber: n,
  stageName: `Stage ${n}`,
  status: 'COMPLETE' as const,
  model: 'claude-sonnet-4-6',
  webSearchUsed: false,
  startedAt: null,
  completedAt: null,
  errorMessage: null,
  inputTokens: null,
  outputTokens: null,
  estimatedCostUsd: null,
  outputText: withOutput ? `Output for stage ${n}` : null,
});

const makeProject = (runStatus: string, stagesWithOutput = false) => ({
  id: 'proj-1',
  title: 'Test',
  status: 'FEASIBILITY' as const,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  invention: { id: 'inv-1', title: 'Test', description: 'Desc' },
  feasibility: [
    {
      id: 'run-1',
      projectId: 'proj-1',
      version: 1,
      status: runStatus,
      stages: [1, 2, 3, 4, 5, 6].map((n) => makeStage(n, stagesWithOutput)),
      startedAt: null,
      completedAt: null,
      finalReport: null,
    },
  ],
});

describe('useViewInit', () => {
  const setStages = vi.fn();
  const setRunError = vi.fn();
  const setViewMode = vi.fn();
  const runIdRef = { current: null };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches full stage data (with outputText) from feasibility endpoint for COMPLETE run', async () => {
    const fullStages = [1, 2, 3, 4, 5, 6].map((n) => makeStage(n, true));
    (api.feasibility.get as any).mockResolvedValue({ stages: fullStages });
    const project = makeProject('COMPLETE');

    renderHook(() =>
      useViewInit({
        project,
        loading: false,
        getLatestRun: (p) => p?.feasibility?.[0] ?? null,
        setStages,
        setRunError,
        setViewMode,
        runIdRef,
      }),
    );

    await waitFor(() => {
      expect(api.feasibility.get).toHaveBeenCalledWith('proj-1');
    });
    await waitFor(() => {
      expect(setStages).toHaveBeenCalledWith(fullStages);
    });
    expect(setViewMode).toHaveBeenCalledWith('overview');
  });

  it('falls back to project stages if feasibility fetch fails', async () => {
    (api.feasibility.get as any).mockRejectedValue(new Error('network error'));
    const project = makeProject('COMPLETE');
    const fallbackStages = project.feasibility[0].stages;

    renderHook(() =>
      useViewInit({
        project,
        loading: false,
        getLatestRun: (p) => p?.feasibility?.[0] ?? null,
        setStages,
        setRunError,
        setViewMode,
        runIdRef,
      }),
    );

    await waitFor(() => {
      expect(setStages).toHaveBeenCalledWith(fallbackStages);
    });
  });

  it('does NOT call api.feasibility.get for RUNNING (stale) runs', async () => {
    const project = makeProject('RUNNING');

    renderHook(() =>
      useViewInit({
        project,
        loading: false,
        getLatestRun: (p) => p?.feasibility?.[0] ?? null,
        setStages,
        setRunError,
        setViewMode,
        runIdRef,
      }),
    );

    await waitFor(() => {
      expect(setStages).toHaveBeenCalled();
    });
    expect(api.feasibility.get).not.toHaveBeenCalled();
  });

  it('also fetches full stages for ERROR run status', async () => {
    const fullStages = [1, 2, 3, 4, 5, 6].map((n) => makeStage(n, true));
    (api.feasibility.get as any).mockResolvedValue({ stages: fullStages });
    const project = makeProject('ERROR');

    renderHook(() =>
      useViewInit({
        project,
        loading: false,
        getLatestRun: (p) => p?.feasibility?.[0] ?? null,
        setStages,
        setRunError,
        setViewMode,
        runIdRef,
      }),
    );

    await waitFor(() => {
      expect(api.feasibility.get).toHaveBeenCalledWith('proj-1');
    });
  });
});
