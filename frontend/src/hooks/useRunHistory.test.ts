import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRunHistory } from './useRunHistory';
import { ViewMode } from './useProjectDetail';

vi.mock('../api', () => ({
  api: {
    feasibility: {
      runs: vi.fn(),
      getVersion: vi.fn(),
    },
  },
}));

import { api } from '../api';

const mockSummaries = [
  { id: 'run-1', projectId: 'proj-1', version: 1, status: 'COMPLETE', completedAt: '2024-01-01T00:00:00Z', totalCostUsd: 1.5 },
  { id: 'run-2', projectId: 'proj-1', version: 2, status: 'ERROR', completedAt: null, totalCostUsd: 0 },
];

describe('useRunHistory', () => {
  let setViewMode: (vm: ViewMode) => void;
  let setToast: (t: { message: string; detail?: string; type?: 'success' | 'error' | 'info' } | null) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    setViewMode = vi.fn() as unknown as (vm: ViewMode) => void;
    setToast = vi.fn() as unknown as typeof setToast;
  });

  it('handleShowHistory fetches run summaries and calls setViewMode("history")', async () => {
    (api.feasibility.runs as any).mockResolvedValue(mockSummaries);

    const { result } = renderHook(() =>
      useRunHistory('proj-1', setViewMode, setToast),
    );

    await act(async () => {
      await result.current.handleShowHistory();
    });

    expect(api.feasibility.runs).toHaveBeenCalledWith('proj-1');
    expect(result.current.runHistory).toEqual(mockSummaries);
    expect(setViewMode).toHaveBeenCalledWith('history');
  });

  it('handleLoadHistoricalRun fetches specific version and sets historicalReport', async () => {
    const mockRun = { id: 'run-1', version: 1, finalReport: '# Report content' };
    (api.feasibility.getVersion as any).mockResolvedValue(mockRun);

    const { result } = renderHook(() =>
      useRunHistory('proj-1', setViewMode, setToast),
    );

    await act(async () => {
      await result.current.handleLoadHistoricalRun(1);
    });

    expect(api.feasibility.getVersion).toHaveBeenCalledWith('proj-1', 1);
    expect(result.current.historicalReport).toBe('# Report content');
    expect(result.current.selectedRunVersion).toBe(1);
    expect(setViewMode).toHaveBeenCalledWith('report');
  });

  it('handleLoadHistoricalRun sets historicalReport to null when finalReport is absent', async () => {
    const mockRun = { id: 'run-2', version: 2 }; // no finalReport property
    (api.feasibility.getVersion as any).mockResolvedValue(mockRun);

    const { result } = renderHook(() =>
      useRunHistory('proj-1', setViewMode, setToast),
    );

    await act(async () => {
      await result.current.handleLoadHistoricalRun(2);
    });

    expect(result.current.historicalReport).toBeNull();
    expect(result.current.selectedRunVersion).toBe(2);
  });

  it('error in handleShowHistory calls setToast with error', async () => {
    (api.feasibility.runs as any).mockRejectedValue(new Error('Network failure'));

    const { result } = renderHook(() =>
      useRunHistory('proj-1', setViewMode, setToast),
    );

    await act(async () => {
      await result.current.handleShowHistory();
    });

    expect(setToast).toHaveBeenCalledWith({
      message: 'Failed to load history',
      detail: 'Network failure',
      type: 'error',
    });
    expect(setViewMode).not.toHaveBeenCalled();
  });

  it('error in handleLoadHistoricalRun calls setToast with error', async () => {
    (api.feasibility.getVersion as any).mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() =>
      useRunHistory('proj-1', setViewMode, setToast),
    );

    await act(async () => {
      await result.current.handleLoadHistoricalRun(99);
    });

    expect(setToast).toHaveBeenCalledWith({
      message: 'Failed to load run',
      detail: 'Not found',
      type: 'error',
    });
  });

  it('handleShowHistory does nothing when projectId is undefined', async () => {
    const { result } = renderHook(() =>
      useRunHistory(undefined, setViewMode, setToast),
    );

    await act(async () => {
      await result.current.handleShowHistory();
    });

    expect(api.feasibility.runs).not.toHaveBeenCalled();
    expect(setViewMode).not.toHaveBeenCalled();
  });

  it('handleLoadHistoricalRun does nothing when projectId is undefined', async () => {
    const { result } = renderHook(() =>
      useRunHistory(undefined, setViewMode, setToast),
    );

    await act(async () => {
      await result.current.handleLoadHistoricalRun(1);
    });

    expect(api.feasibility.getVersion).not.toHaveBeenCalled();
    expect(setViewMode).not.toHaveBeenCalled();
  });

  it('exposes setSelectedRunVersion and setHistoricalReport setters', async () => {
    const { result } = renderHook(() =>
      useRunHistory('proj-1', setViewMode, setToast),
    );

    act(() => {
      result.current.setSelectedRunVersion(5);
      result.current.setHistoricalReport('# Forced report');
    });

    expect(result.current.selectedRunVersion).toBe(5);
    expect(result.current.historicalReport).toBe('# Forced report');
  });
});
