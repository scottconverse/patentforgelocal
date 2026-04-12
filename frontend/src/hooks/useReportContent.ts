import { useState, useEffect } from 'react';
import { api } from '../api';
import { ViewMode } from './useProjectDetail';

/**
 * Lazily loads the full report markdown and pre-rendered HTML when the
 * user navigates to the report view. Skips loading if a historical report
 * is already being displayed.
 */
export function useReportContent(
  viewMode: ViewMode,
  projectId: string | undefined,
  historicalReport: string | null,
) {
  const [fullReportContent, setFullReportContent] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);

  useEffect(() => {
    if (viewMode === 'report' && projectId && !historicalReport && !fullReportContent) {
      api.feasibility
        .getReport(projectId)
        .then((data) => {
          setFullReportContent(data.report || null);
          setReportHtml(data.html || null);
        })
        .catch((_err) => {
          // Report load failure is non-fatal — UI already shows "Loading report..." fallback
        });
    }
  }, [viewMode, projectId, historicalReport, fullReportContent]);

  /** The report to display — historical takes priority over latest. */
  const reportContent = historicalReport ?? fullReportContent;

  return { reportContent, reportHtml };
}
