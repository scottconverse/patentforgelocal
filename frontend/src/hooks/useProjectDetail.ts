import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { Project, FeasibilityRun, PriorArtSearch } from '../types';

export type ViewMode =
  | 'overview'
  | 'invention-form'
  | 'running'
  | 'report'
  | 'stage-output'
  | 'history'
  | 'prior-art'
  | 'claims'
  | 'compliance'
  | 'application';

export interface UseProjectDetailReturn {
  project: Project | null;
  setProject: React.Dispatch<React.SetStateAction<Project | null>>;
  loading: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  loadProject: () => Promise<void>;
  getLatestRun: (p: Project | null) => FeasibilityRun | null;
  priorArtSearch: PriorArtSearch | null;
  setPriorArtSearch: React.Dispatch<React.SetStateAction<PriorArtSearch | null>>;
  claimDraftStatus: { status: string; claims?: any[] } | null;
  setClaimDraftStatus: React.Dispatch<React.SetStateAction<{ status: string; claims?: any[] } | null>>;
  complianceStatus: any | null;
  applicationStatus: any | null;
}

export function useProjectDetail(
  id: string | undefined,
  viewMode: ViewMode,
): UseProjectDetailReturn {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priorArtSearch, setPriorArtSearch] = useState<PriorArtSearch | null>(null);
  const [claimDraftStatus, setClaimDraftStatus] = useState<{ status: string; claims?: any[] } | null>(null);
  const [complianceStatus, setComplianceStatus] = useState<any | null>(null);
  const [applicationStatus, setApplicationStatus] = useState<any | null>(null);

  function getLatestRun(p: Project | null): FeasibilityRun | null {
    if (!p?.feasibility || !Array.isArray(p.feasibility) || p.feasibility.length === 0) return null;
    return [...p.feasibility].sort((a, b) => b.version - a.version)[0];
  }

  const loadProject = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.projects.get(id);
      setProject(data);

      // Load prior art search state
      api.priorArt
        .get(id)
        .then((pa) => setPriorArtSearch(pa))
        .catch(() => {});

      // Load claim draft status (for compliance tab)
      api.claimDraft
        .getLatest(id)
        .then((d) => setClaimDraftStatus(d))
        .catch(() => {});

      // Load compliance status (for sidebar badge)
      api.compliance
        .getLatest(id)
        .then((d) => setComplianceStatus(d))
        .catch(() => {});

      // Load application status (for sidebar badge)
      api.application
        .getLatest(id)
        .then((d) => setApplicationStatus(d))
        .catch(() => {});

      // Determine initial view mode is handled in ProjectDetail.tsx using getLatestRun
    } catch (e: any) {
      setError(e.message || 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Mount effect — load on id change; cleanup is handled by ProjectDetail's abortRef
  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Re-fetch claim draft status when switching to tabs that depend on it
  useEffect(() => {
    if ((viewMode === 'compliance' || viewMode === 'application') && id) {
      api.claimDraft
        .getLatest(id)
        .then((d) => setClaimDraftStatus(d))
        .catch(() => {});
    }
  }, [viewMode, id]);

  return {
    project,
    setProject,
    loading,
    error,
    setError,
    loadProject,
    getLatestRun,
    priorArtSearch,
    setPriorArtSearch,
    claimDraftStatus,
    setClaimDraftStatus,
    complianceStatus,
    applicationStatus,
  };
}
