import { useState } from 'react';
import { api } from '../api';
import { FeasibilityRunSummary } from '../types';
import { ViewMode } from './useProjectDetail';

export interface UseRunHistoryReturn {
  runHistory: FeasibilityRunSummary[];
  selectedRunVersion: number | null;
  historicalReport: string | null;
  setSelectedRunVersion: React.Dispatch<React.SetStateAction<number | null>>;
  setHistoricalReport: React.Dispatch<React.SetStateAction<string | null>>;
  handleShowHistory: () => Promise<void>;
  handleLoadHistoricalRun: (version: number) => Promise<void>;
}

export function useRunHistory(
  projectId: string | undefined,
  setViewMode: (vm: ViewMode) => void,
  setToast: (
    t: { message: string; detail?: string; type?: 'success' | 'error' | 'info' } | null,
  ) => void,
): UseRunHistoryReturn {
  const [runHistory, setRunHistory] = useState<FeasibilityRunSummary[]>([]);
  const [selectedRunVersion, setSelectedRunVersion] = useState<number | null>(null);
  const [historicalReport, setHistoricalReport] = useState<string | null>(null);

  async function handleShowHistory() {
    if (!projectId) return;
    try {
      const summaries = await api.feasibility.runs(projectId);
      setRunHistory(summaries);
      setViewMode('history');
    } catch (e: any) {
      setToast({ message: 'Failed to load history', detail: e.message, type: 'error' });
    }
  }

  async function handleLoadHistoricalRun(version: number) {
    if (!projectId) return;
    try {
      const run = await api.feasibility.getVersion(projectId, version);
      setHistoricalReport(run.finalReport ?? null);
      setSelectedRunVersion(version);
      setViewMode('report');
    } catch (e: any) {
      setToast({ message: 'Failed to load run', detail: e.message, type: 'error' });
    }
  }

  return {
    runHistory,
    selectedRunVersion,
    historicalReport,
    setSelectedRunVersion,
    setHistoricalReport,
    handleShowHistory,
    handleLoadHistoricalRun,
  };
}
