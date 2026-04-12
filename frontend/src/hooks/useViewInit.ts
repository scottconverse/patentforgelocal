import { useEffect, useRef } from 'react';
import { api } from '../api';
import { FeasibilityRun, RunStatus, Project, FeasibilityStage } from '../types';
import { ViewMode } from './useProjectDetail';
import { makePlaceholderStages } from './useFeasibilityRun';

/**
 * Determines the initial view mode when a project loads.
 *
 * Runs exactly once per project ID. Handles:
 * - Completed runs → overview
 * - Stale RUNNING runs → marks as ERROR, shows overview with re-run access
 * - No invention → invention form
 * - Default → overview
 */
export function useViewInit({
  project,
  loading,
  getLatestRun,
  setStages,
  setRunError,
  setViewMode,
  runIdRef,
}: {
  project: Project | null;
  loading: boolean;
  getLatestRun: (p: Project | null) => FeasibilityRun | null;
  setStages: (stages: FeasibilityStage[]) => void;
  setRunError: (err: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  runIdRef: React.MutableRefObject<string | null>;
}) {
  const projectLoadedRef = useRef<string | null>(null);

  // Reset the guard when the project ID changes (e.g. user navigates to a different project)
  // so view init runs again for the new project.
  useEffect(() => {
    if (project && projectLoadedRef.current && projectLoadedRef.current !== project.id) {
      projectLoadedRef.current = null;
    }
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!project || loading) return;
    // Only run view init once per project id to avoid resetting view on re-fetches
    // triggered by pipeline complete. Skip if already initialized for this project.
    if (projectLoadedRef.current === project.id) return;
    projectLoadedRef.current = project.id;

    const latestRunInit = getLatestRun(project);
    if (latestRunInit) {
      if (latestRunInit.status === 'COMPLETE' || latestRunInit.status === 'ERROR') {
        // The project GET response excludes outputText from stages (performance).
        // Load full stage data so stage cards are clickable (isClickable requires outputText).
        api.feasibility.get(project.id).then((fullRun) => {
          setStages(fullRun?.stages?.length ? fullRun.stages : (latestRunInit.stages?.length ? latestRunInit.stages : makePlaceholderStages()));
        }).catch(() => {
          setStages(latestRunInit.stages?.length ? latestRunInit.stages : makePlaceholderStages());
        });
        setViewMode('overview');
      } else if (latestRunInit.status === 'RUNNING') {
        // Stale RUNNING run — the pipeline died (browser closed, service crashed, etc.)
        // No active abort controller means nothing is actually streaming. Mark it ERROR
        // in the backend, load whatever partial stage output exists, and show overview.
        const partialStages = (latestRunInit.stages ?? []).map((s) => {
          if (s.status === 'RUNNING') {
            return {
              ...s,
              status: 'ERROR' as RunStatus,
              errorMessage: 'Pipeline interrupted — service was restarted or browser was closed.',
            };
          }
          if (s.status === 'PENDING') {
            return {
              ...s,
              status: 'ERROR' as RunStatus,
              errorMessage: s.startedAt ? 'Pipeline interrupted before completion.' : 'Not started — pipeline stopped before reaching this stage.',
            };
          }
          return s;
        });
        setStages(partialStages.length ? partialStages : makePlaceholderStages());
        setRunError(
          'Pipeline was interrupted (service restarted or browser closed). Partial results shown below. Click "Re-run" to try again.',
        );
        // Show overview (not report) so the user sees the error banner AND has
        // direct access to the Re-run button without navigating back first.
        setViewMode('overview');
        // Patch backend so it doesn't stay RUNNING forever
        api.feasibility
          .patchRun(project.id, { status: 'ERROR', runId: runIdRef.current || undefined })
          .catch(() => {/* non-fatal */});
      } else {
        setViewMode('overview');
      }
    } else if (!project.invention) {
      setViewMode('invention-form');
    } else {
      setViewMode('overview');
    }
  }, [project, loading, getLatestRun, setStages, setRunError, setViewMode, runIdRef]);
}
