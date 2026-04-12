import { PriorArtSearch, PatentDetail } from './types';

const BASE = '/api';

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text();
      let message = text;
      try {
        const json = JSON.parse(text);
        message = json.message || json.error || text;
      } catch {
        /* not JSON — use raw text */
      }
      throw new Error(message);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (e: any) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new Error('Request timed out. The server may be busy — try again in a moment.');
    }
    throw e;
  }
}

export const api = {
  projects: {
    list: () => req<any[]>('GET', '/projects'),
    create: (title: string) => req<any>('POST', '/projects', { title }),
    get: (id: string) => req<any>('GET', `/projects/${id}`),
    delete: (id: string) => req<void>('DELETE', `/projects/${id}`),
  },
  invention: {
    get: (projectId: string) => req<any>('GET', `/projects/${projectId}/invention`),
    upsert: (projectId: string, data: unknown) => req<any>('PUT', `/projects/${projectId}/invention`, data),
  },
  priorArt: {
    get: (projectId: string) => req<PriorArtSearch>('GET', `/projects/${projectId}/prior-art`),
    status: (projectId: string) =>
      req<{ status: string; resultCount: number; completedAt: string | null }>(
        'GET',
        `/projects/${projectId}/prior-art/status`,
      ),
  },
  feasibility: {
    start: (projectId: string, body?: { narrative?: string }) =>
      req<any>('POST', `/projects/${projectId}/feasibility/run`, body ?? {}),
    get: (projectId: string) => req<any>('GET', `/projects/${projectId}/feasibility`),
    cancel: (projectId: string) => req<any>('POST', `/projects/${projectId}/feasibility/cancel`),
    patchRun: (projectId: string, data: { status?: string; finalReport?: string; runId?: string }) =>
      req<any>('PATCH', `/projects/${projectId}/feasibility/run`, data),
    patchStage: (projectId: string, stageNumber: number, data: Record<string, unknown>) =>
      req<any>('PATCH', `/projects/${projectId}/feasibility/stages/${stageNumber}`, data),
    exportToDisk: (projectId: string) =>
      req<{ folderPath: string; mdFile: string; htmlFile: string }>(
        'POST',
        `/projects/${projectId}/feasibility/export`,
      ),
    exportToDocx: async (projectId: string): Promise<Blob> => {
      const res = await fetch(`${BASE}/projects/${projectId}/feasibility/export/docx`);
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          const json = JSON.parse(text);
          message = json.message || json.error || text;
        } catch {
          /* not JSON — use raw text */
        }
        throw new Error(message);
      }
      return res.blob();
    },
    getReport: (projectId: string) =>
      req<{ report: string | null; html: string | null }>('GET', `/projects/${projectId}/feasibility/report`),
    getReportHtml: async (projectId: string): Promise<string> => {
      const res = await fetch(`${BASE}/projects/${projectId}/feasibility/report/html`);
      if (!res.ok) throw new Error(`Failed to load report: ${res.status}`);
      return res.text();
    },
    getExportHtml: async (projectId: string): Promise<string> => {
      const res = await fetch(`${BASE}/projects/${projectId}/feasibility/export/html`);
      if (!res.ok) throw new Error(`Failed to load export: ${res.status}`);
      return res.text();
    },
    costEstimate: (projectId: string) =>
      req<{
        hasHistory: boolean;
        runsUsed: number;
        stagesUsed: number;
        avgInputTokens: number;
        avgOutputTokens: number;
        avgCostPerStage: number;
      }>('GET', `/projects/${projectId}/feasibility/cost-estimate`),
    runs: (projectId: string) => req<any[]>('GET', `/projects/${projectId}/feasibility/runs`),
    getVersion: (projectId: string, version: number) =>
      req<any>('GET', `/projects/${projectId}/feasibility/${version}`),
    rerunFromStage: (projectId: string, fromStage: number) =>
      req<any>('POST', `/projects/${projectId}/feasibility/rerun`, { fromStage }),
  },
  patents: {
    getDetail: (patentNumber: string) => req<PatentDetail>('GET', `/patents/${patentNumber}`),
    getClaims: (patentNumber: string) =>
      req<{ claimsText: string | null; claimCount: number | null }>('GET', `/patents/${patentNumber}/claims`),
    getFamily: (patentNumber: string) =>
      req<
        Array<{
          patentNumber: string | null;
          applicationNumber: string | null;
          relationship: string;
          filingDate: string | null;
          grantDate: string | null;
          title: string | null;
          status: string | null;
        }>
      >('GET', `/patents/${patentNumber}/family`),
  },
  claimDraft: {
    start: (projectId: string) => req<any>('POST', `/projects/${projectId}/claims/draft`),
    getLatest: (projectId: string) => req<any>('GET', `/projects/${projectId}/claims`),
    getVersion: (projectId: string, version: number) => req<any>('GET', `/projects/${projectId}/claims/${version}`),
    updateClaim: (projectId: string, claimId: string, text: string) =>
      req<any>('PUT', `/projects/${projectId}/claims/edit/${claimId}`, { text }),
    regenerateClaim: (projectId: string, claimNumber: number) =>
      req<any>('POST', `/projects/${projectId}/claims/${claimNumber}/regenerate`),
    getClaimText: (projectId: string, claimId: string) =>
      req<{ text: string }>('GET', `/projects/${projectId}/claims/text/${claimId}`),
    exportToDocx: async (projectId: string): Promise<Blob> => {
      const res = await fetch(`${BASE}/projects/${projectId}/claims/export/docx`);
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          const json = JSON.parse(text);
          message = json.message || json.error || text;
        } catch {
          /* not JSON — use raw text */
        }
        throw new Error(message);
      }
      return res.blob();
    },
  },
  compliance: {
    startCheck: (projectId: string, draftVersion?: number) =>
      req<any>('POST', `/projects/${projectId}/compliance/check`, draftVersion ? { draftVersion } : {}),
    getLatest: (projectId: string) => req<any>('GET', `/projects/${projectId}/compliance`),
    getVersion: (projectId: string, version: number) => req<any>('GET', `/projects/${projectId}/compliance/${version}`),
    exportToDocx: async (projectId: string): Promise<Blob> => {
      const res = await fetch(`${BASE}/projects/${projectId}/compliance/export/docx`);
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          const json = JSON.parse(text);
          message = json.message || json.error || text;
        } catch {
          /* not JSON — use raw text */
        }
        throw new Error(message);
      }
      return res.blob();
    },
  },
  application: {
    start: (projectId: string) => req<any>('POST', `/projects/${projectId}/application/generate`),
    getLatest: (projectId: string) => req<any>('GET', `/projects/${projectId}/application`),
    getVersion: (projectId: string, version: number) =>
      req<any>('GET', `/projects/${projectId}/application/${version}`),
    updateSection: (projectId: string, name: string, text: string) =>
      req<any>('PUT', `/projects/${projectId}/application/sections/${name}`, { text }),
    exportDocx: async (projectId: string): Promise<Blob> => {
      const res = await fetch(`${BASE}/projects/${projectId}/application/export/docx`);
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          const json = JSON.parse(text);
          message = json.message || json.error || text;
        } catch {
          /* not JSON — use raw text */
        }
        throw new Error(message);
      }
      return res.blob();
    },
    exportMarkdown: (projectId: string) => req<string>('GET', `/projects/${projectId}/application/export/markdown`),
  },
  settings: {
    get: () => req<any>('GET', '/settings'),
    update: (data: unknown) => req<any>('PUT', '/settings', data),
    validateKey: (apiKey: string) =>
      req<{ valid: boolean; error?: string }>('POST', '/settings/validate-api-key', { apiKey }),
    odpUsage: () =>
      req<{
        thisWeek: {
          totalQueries: number;
          totalResults: number;
          rateLimitHits: number;
          errorCount: number;
          callCount: number;
        };
        lastUsed: string | null;
        weeklyLimits: { patentFileWrapperDocs: number; metadataRetrievals: number };
      }>('GET', '/settings/odp-usage'),
  },
};
