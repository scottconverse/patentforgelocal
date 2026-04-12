import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { makePlaceholderStages, toNarrative, useFeasibilityRun, UseFeasibilityRunParams } from './useFeasibilityRun';
import { InventionInput, FeasibilityStage } from '../types';

vi.mock('../api', () => ({
  api: {
    settings: {
      get: vi.fn(),
    },
    feasibility: {
      costEstimate: vi.fn(),
      start: vi.fn(),
      cancel: vi.fn(),
      patchRun: vi.fn(),
      patchStage: vi.fn(),
      exportToDisk: vi.fn(),
    },
    priorArt: {
      status: vi.fn(),
      get: vi.fn(),
    },
  },
}));

import { api } from '../api';

const mockInvention: InventionInput = {
  id: 'inv-1',
  projectId: 'proj-1',
  title: 'Test Invention',
  description:
    'A device that solves the fundamental problem of automated patent analysis by leveraging advanced natural language processing techniques to parse and evaluate invention disclosures against existing prior art databases. The system uses a multi-stage pipeline architecture to progressively refine its understanding of the invention and produce comprehensive feasibility reports for patent attorneys and inventors.',
  problemSolved: 'Solves problem X',
  howItWorks: undefined,
  aiComponents: 'Uses ML for Y',
  whatIsNovel: 'Novel approach to Z',
};

function makeDefaultParams(overrides?: Partial<UseFeasibilityRunParams>): UseFeasibilityRunParams {
  return {
    projectId: 'proj-1',
    project: {
      id: 'proj-1',
      title: 'Test Project',
      status: 'FEASIBILITY',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      invention: mockInvention,
      feasibility: [],
    },
    setProject: vi.fn(),
    getLatestRun: vi.fn().mockReturnValue(null),
    setViewMode: vi.fn(),
    setToast: vi.fn(),
    setCostModal: vi.fn(),
    setError: vi.fn(),
    loadProject: vi.fn().mockResolvedValue(undefined),
    setPriorArtSearch: vi.fn(),
    setSelectedRunVersion: vi.fn(),
    setHistoricalReport: vi.fn(),
    viewMode: 'overview' as const,
    latestRun: null,
    ...overrides,
  };
}

describe('makePlaceholderStages', () => {
  it('returns 6 stages with correct names and PENDING status', () => {
    const stages = makePlaceholderStages();

    expect(stages).toHaveLength(6);
    expect(stages[0].stageName).toBe('Technical Intake & Restatement');
    expect(stages[1].stageName).toBe('Prior Art Research');
    expect(stages[2].stageName).toBe('Patentability Analysis');
    expect(stages[3].stageName).toBe('Deep Dive Analysis');
    expect(stages[4].stageName).toBe('IP Strategy & Recommendations');
    expect(stages[5].stageName).toBe('Comprehensive Report');

    for (let i = 0; i < 6; i++) {
      expect(stages[i].status).toBe('PENDING');
      expect(stages[i].stageNumber).toBe(i + 1);
      expect(stages[i].webSearchUsed).toBe(false);
      expect(stages[i].id).toBe(`placeholder-${i + 1}`);
    }
  });

  it('returns a new array on each call (no shared state)', () => {
    const a = makePlaceholderStages();
    const b = makePlaceholderStages();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('toNarrative', () => {
  it('builds correct markdown from InventionInput with populated fields', () => {
    const result = toNarrative(mockInvention);

    expect(result).toContain('**Invention Title:** Test Invention');
    expect(result).toContain('**Description:** A device that solves the fundamental problem');
    expect(result).toContain('**Problem Solved:** Solves problem X');
    expect(result).toContain('**AI / ML Components:** Uses ML for Y');
    expect(result).toContain('**What I Believe Is Novel:** Novel approach to Z');
    // Sections are separated by double newlines
    expect(result).toContain('\n\n');
  });

  it('omits fields that are undefined or empty', () => {
    const result = toNarrative(mockInvention);

    // howItWorks is undefined — should not appear
    expect(result).not.toContain('How It Works');
    // additionalNotes is undefined — should not appear
    expect(result).not.toContain('Additional Notes');
  });

  it('omits fields that are whitespace-only', () => {
    const inv: InventionInput = {
      ...mockInvention,
      problemSolved: '   ',
      howItWorks: '\n\t',
    };
    const result = toNarrative(inv);
    expect(result).not.toContain('Problem Solved');
    expect(result).not.toContain('How It Works');
  });

  it('handles minimal invention (only title and description)', () => {
    const inv: InventionInput = {
      id: 'inv-2',
      projectId: 'proj-1',
      title: 'Minimal',
      description: 'Just a description',
    };
    const result = toNarrative(inv);
    expect(result).toBe('**Invention Title:** Minimal\n\n**Description:** Just a description');
  });
});

describe('useFeasibilityRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with placeholder stages and idle state', () => {
    const params = makeDefaultParams();
    const { result } = renderHook(() => useFeasibilityRun(params));

    expect(result.current.stages).toHaveLength(6);
    expect(result.current.stages[0].status).toBe('PENDING');
    expect(result.current.activeStageNum).toBeUndefined();
    expect(result.current.currentStageName).toBe('');
    expect(result.current.streamText).toBe('');
    expect(result.current.isStreamComplete).toBe(false);
    expect(result.current.runError).toBeNull();
    expect(result.current.cancelling).toBe(false);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isPipelineStreaming).toBe(false);
  });

  it('isPipelineStreaming is false when no run is active', () => {
    // Verifies that the flag used by Back buttons to detect an active pipeline
    // starts false and is only true while proceedWithRun is executing.
    const params = makeDefaultParams();
    const { result } = renderHook(() => useFeasibilityRun(params));
    expect(result.current.isPipelineStreaming).toBe(false);
  });

  it('handleRunFeasibility without invention shows error and switches to invention-form', async () => {
    const setError = vi.fn();
    const setViewMode = vi.fn();
    const params = makeDefaultParams({
      project: {
        id: 'proj-1',
        title: 'Test',
        status: 'INTAKE',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        invention: undefined,
        feasibility: [],
      },
      setError,
      setViewMode,
    });

    const { result } = renderHook(() => useFeasibilityRun(params));

    await act(async () => {
      await result.current.handleRunFeasibility();
    });

    expect(setError).toHaveBeenCalledWith('Please fill in invention details first.');
    expect(setViewMode).toHaveBeenCalledWith('invention-form');
  });

  it('handleRunFeasibility without API key shows error toast', async () => {
    const setToast = vi.fn();
    (api.settings.get as any).mockResolvedValue({
      anthropicApiKey: '',
      defaultModel: 'claude-sonnet-4-20250514',
    });

    const params = makeDefaultParams({ setToast });

    const { result } = renderHook(() => useFeasibilityRun(params));

    await act(async () => {
      await result.current.handleRunFeasibility();
    });

    expect(setToast).toHaveBeenCalledWith({
      message: 'No API key configured',
      detail: 'Add your Anthropic API key in Settings before running.',
      type: 'error',
    });
  });

  it('handleRunFeasibility shows toast when settings fetch fails', async () => {
    const setToast = vi.fn();
    (api.settings.get as any).mockRejectedValue(new Error('Connection refused'));

    const params = makeDefaultParams({ setToast });

    const { result } = renderHook(() => useFeasibilityRun(params));

    await act(async () => {
      await result.current.handleRunFeasibility();
    });

    expect(setToast).toHaveBeenCalledWith({
      message: 'Failed to load settings',
      detail: 'Connection refused',
      type: 'error',
    });
  });

  it('handleCancel sets cancelling state and calls api.feasibility.cancel', async () => {
    (api.feasibility.cancel as any).mockResolvedValue({});

    const params = makeDefaultParams();
    const { result } = renderHook(() => useFeasibilityRun(params));

    await act(async () => {
      await result.current.handleCancel();
    });

    expect(api.feasibility.cancel).toHaveBeenCalledWith('proj-1');
    // After cancel completes, cancelling is reset to false
    expect(result.current.cancelling).toBe(false);
    expect(result.current.runError).toBe('Analysis cancelled.');
  });

  it('handleCancel does nothing when projectId is undefined', async () => {
    const params = makeDefaultParams({ projectId: undefined });
    const { result } = renderHook(() => useFeasibilityRun(params));

    await act(async () => {
      await result.current.handleCancel();
    });

    expect(api.feasibility.cancel).not.toHaveBeenCalled();
  });

  it('handleRunFeasibility does nothing when projectId is undefined', async () => {
    const params = makeDefaultParams({ projectId: undefined });
    const { result } = renderHook(() => useFeasibilityRun(params));

    await act(async () => {
      await result.current.handleRunFeasibility();
    });

    expect(api.settings.get).not.toHaveBeenCalled();
  });

  it('handleRunFeasibility with valid settings shows cost modal', async () => {
    const setCostModal = vi.fn();
    (api.settings.get as any).mockResolvedValue({
      anthropicApiKey: 'sk-test-key',
      defaultModel: 'claude-sonnet-4-20250514',
      costCapUsd: 5.0,
    });
    (api.feasibility.costEstimate as any).mockResolvedValue({
      hasHistory: false,
      runsUsed: 0,
      stagesUsed: 0,
      avgInputTokens: 50000,
      avgOutputTokens: 10000,
      avgCostPerStage: 0,
    });

    const params = makeDefaultParams({ setCostModal });

    const { result } = renderHook(() => useFeasibilityRun(params));

    await act(async () => {
      await result.current.handleRunFeasibility();
    });

    expect(setCostModal).toHaveBeenCalledTimes(1);
    const modalArg = setCostModal.mock.calls[0][0];
    expect(modalArg).toHaveProperty('tokenCost');
    expect(modalArg).toHaveProperty('webSearchCost', 0.15);
    expect(modalArg).toHaveProperty('cap', 5.0);
    expect(modalArg).toHaveProperty('model', 'claude-sonnet-4-20250514');
    expect(modalArg).toHaveProperty('source', 'static');
    expect(modalArg).toHaveProperty('runsUsed', 0);
  });

  it('handleRunFeasibility blocks when description is under 50 words and sets descriptionError', async () => {
    const shortInvention: InventionInput = {
      id: 'inv-short',
      projectId: 'proj-1',
      title: 'Short Invention',
      description: 'This is a short description.',
    };
    const params = makeDefaultParams({
      project: {
        id: 'proj-1',
        title: 'Test',
        status: 'FEASIBILITY',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        invention: shortInvention,
        feasibility: [],
      },
    });

    const { result } = renderHook(() => useFeasibilityRun(params));

    await act(async () => {
      await result.current.handleRunFeasibility();
    });

    // Should NOT have called settings (validation blocks before that)
    expect(api.settings.get).not.toHaveBeenCalled();
    // Should have set the description error
    expect(result.current.descriptionError).not.toBeNull();
    expect(result.current.descriptionError).toContain('at least 50 words');
  });

  it('handleRunFeasibility clears descriptionError when description meets minimum', async () => {
    (api.settings.get as any).mockResolvedValue({
      anthropicApiKey: 'sk-test-key',
      defaultModel: 'claude-sonnet-4-20250514',
      costCapUsd: 5.0,
    });
    (api.feasibility.costEstimate as any).mockResolvedValue({
      hasHistory: false,
      runsUsed: 0,
      stagesUsed: 0,
      avgInputTokens: 50000,
      avgOutputTokens: 10000,
      avgCostPerStage: 0,
    });

    const params = makeDefaultParams();
    const { result } = renderHook(() => useFeasibilityRun(params));

    await act(async () => {
      await result.current.handleRunFeasibility();
    });

    // descriptionError should be null since mockInvention has 50+ words
    expect(result.current.descriptionError).toBeNull();
  });

  it('pendingRunRef is accessible and starts as null', () => {
    const params = makeDefaultParams();
    const { result } = renderHook(() => useFeasibilityRun(params));

    expect(result.current.pendingRunRef.current).toBeNull();
  });

  it('exposes setStages and setRunError setters', () => {
    const params = makeDefaultParams();
    const { result } = renderHook(() => useFeasibilityRun(params));

    act(() => {
      result.current.setRunError('test error');
    });
    expect(result.current.runError).toBe('test error');

    act(() => {
      result.current.setStages([]);
    });
    expect(result.current.stages).toEqual([]);
  });
});
