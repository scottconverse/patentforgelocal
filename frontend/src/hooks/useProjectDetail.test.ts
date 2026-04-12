import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProjectDetail } from './useProjectDetail';

vi.mock('../api', () => ({
  api: {
    projects: {
      get: vi.fn(),
    },
    priorArt: {
      get: vi.fn(),
    },
    claimDraft: {
      getLatest: vi.fn(),
    },
    compliance: {
      getLatest: vi.fn(),
    },
    application: {
      getLatest: vi.fn(),
    },
  },
}));

import { api } from '../api';

const mockProject = {
  id: 'proj-1',
  title: 'Test Invention',
  status: 'INTAKE' as const,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  invention: undefined,
  feasibility: [],
};

const makeRun = (version: number, status = 'COMPLETE' as const) => ({
  id: `run-${version}`,
  projectId: 'proj-1',
  version,
  status,
  stages: [],
});

describe('useProjectDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default fire-and-forget mocks resolve silently
    (api.priorArt.get as any).mockResolvedValue({ results: [] });
    (api.claimDraft.getLatest as any).mockResolvedValue(null);
    (api.compliance.getLatest as any).mockResolvedValue(null);
    (api.application.getLatest as any).mockResolvedValue(null);
  });

  it('calls api.projects.get(id) and sets project state', async () => {
    (api.projects.get as any).mockResolvedValue(mockProject);

    const { result } = renderHook(() => useProjectDetail('proj-1', 'overview'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.projects.get).toHaveBeenCalledWith('proj-1');
    expect(result.current.project).toEqual(mockProject);
  });

  it('returns loading=true initially, loading=false after load', async () => {
    let resolve: (value: any) => void;
    (api.projects.get as any).mockImplementation(
      () => new Promise((res) => { resolve = res; }),
    );

    const { result } = renderHook(() => useProjectDetail('proj-1', 'overview'));

    expect(result.current.loading).toBe(true);

    resolve!(mockProject);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('sets error state on API failure', async () => {
    (api.projects.get as any).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useProjectDetail('proj-1', 'overview'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.project).toBeNull();
  });

  it('does nothing when id is undefined', async () => {
    renderHook(() => useProjectDetail(undefined, 'overview'));

    // loading stays true because loadProject returns early without setting it false
    // Give a tick to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(api.projects.get).not.toHaveBeenCalled();
  });

  it('getLatestRun returns the run with the highest version', async () => {
    (api.projects.get as any).mockResolvedValue(mockProject);

    const { result } = renderHook(() => useProjectDetail('proj-1', 'overview'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const runs = [makeRun(1), makeRun(3), makeRun(2)];
    const projectWithRuns = { ...mockProject, feasibility: runs };

    const latest = result.current.getLatestRun(projectWithRuns);
    expect(latest?.version).toBe(3);
  });

  it('getLatestRun returns null for project with no runs', async () => {
    (api.projects.get as any).mockResolvedValue(mockProject);

    const { result } = renderHook(() => useProjectDetail('proj-1', 'overview'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getLatestRun(null)).toBeNull();
    expect(result.current.getLatestRun({ ...mockProject, feasibility: [] })).toBeNull();
  });

  it('re-fetches claimDraftStatus when viewMode switches to compliance', async () => {
    (api.projects.get as any).mockResolvedValue(mockProject);
    const claimData = { status: 'COMPLETE', claims: [{ id: 'c1' }] };
    (api.claimDraft.getLatest as any).mockResolvedValue(claimData);

    const { result, rerender } = renderHook(
      ({ mode }: { mode: Parameters<typeof useProjectDetail>[1] }) =>
        useProjectDetail('proj-1', mode),
      { initialProps: { mode: 'overview' as const } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Reset call count after initial load
    vi.clearAllMocks();
    (api.claimDraft.getLatest as any).mockResolvedValue(claimData);

    rerender({ mode: 'compliance' });

    await waitFor(() => {
      expect(api.claimDraft.getLatest).toHaveBeenCalledWith('proj-1');
    });
  });

  it('re-fetches claimDraftStatus when viewMode switches to application', async () => {
    (api.projects.get as any).mockResolvedValue(mockProject);
    const claimData = { status: 'COMPLETE', claims: [] };
    (api.claimDraft.getLatest as any).mockResolvedValue(claimData);

    const { result, rerender } = renderHook(
      ({ mode }: { mode: Parameters<typeof useProjectDetail>[1] }) =>
        useProjectDetail('proj-1', mode),
      { initialProps: { mode: 'overview' as const } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.clearAllMocks();
    (api.claimDraft.getLatest as any).mockResolvedValue(claimData);

    rerender({ mode: 'application' });

    await waitFor(() => {
      expect(api.claimDraft.getLatest).toHaveBeenCalledWith('proj-1');
    });
  });
});
