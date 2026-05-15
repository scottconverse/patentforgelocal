export type ProjectStatus =
  | 'INTAKE'
  | 'FEASIBILITY'
  | 'PRIOR_ART'
  | 'DRAFTING'
  | 'COMPLIANCE'
  | 'APPLICATION'
  | 'FILED'
  | 'ABANDONED';
export type RunStatus = 'PENDING' | 'RUNNING' | 'COMPLETE' | 'ERROR' | 'CANCELLED' | 'STALE';

export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  invention?: InventionInput;
  feasibility?: FeasibilityRun[];
}

export interface InventionInput {
  id: string;
  projectId: string;
  title: string;
  description: string;
  problemSolved?: string;
  howItWorks?: string;
  aiComponents?: string;
  threeDPrintComponents?: string;
  whatIsNovel?: string;
  currentAlternatives?: string;
  whatIsBuilt?: string;
  whatToProtect?: string;
  additionalNotes?: string;
}

export interface FeasibilityRun {
  id: string;
  projectId: string;
  version: number;
  status: RunStatus;
  startedAt?: string;
  completedAt?: string;
  finalReport?: string;
  stages: FeasibilityStage[];
}

export interface FeasibilityStage {
  id: string;
  feasibilityRunId: string;
  stageNumber: number;
  stageName: string;
  status: RunStatus;
  outputText?: string;
  model?: string;
  webSearchUsed: boolean;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}

/**
 * LLM provider routing — see `provider.types.ts` in the backend for the
 * three-layer-safety pattern (TS union + DTO @IsIn + SQLite CHECK).
 */
export type Provider = 'LOCAL' | 'CLOUD';

export const PROVIDERS: readonly Provider[] = ['LOCAL', 'CLOUD'] as const;

export function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value);
}

/**
 * Installer edition — mirrors backend `edition.types.ts`. Lean ships without
 * an Ollama runtime bundle; Full bundles Ollama + Gemma 4. The wizard reads
 * this on first launch to decide whether to show the Local/Cloud chooser.
 *
 * Introduced in PatentForge merge plan Run 6.
 */
export type InstallEdition = 'Lean' | 'Full';

export const INSTALL_EDITIONS: readonly InstallEdition[] = ['Lean', 'Full'] as const;

export function isInstallEdition(value: unknown): value is InstallEdition {
  return typeof value === 'string' && (INSTALL_EDITIONS as readonly string[]).includes(value);
}

export interface AppSettings {
  // Provider routing (added in merge plan Run 4 backend, Run 5 frontend)
  provider: Provider;
  cloudApiKey: string;
  cloudDefaultModel: string;
  localDefaultModel: string;

  // Install edition metadata (Run 6) — read-only mirror of <baseDir>/config/edition.txt
  // written by the installer. UI uses it to decide whether FirstRunWizard
  // shows the Local/Cloud chooser (Full) or skips straight to Cloud (Lean).
  // Defaults to 'Full' for in-place upgrades from a pre-Run-6 install.
  installEdition: InstallEdition;

  // Legacy / general
  // `ollamaApiKey` was repurposed pre-Run-4 as the Ollama-Cloud Web Search
  // token (distinct from local-Ollama auth). The Run 4 backend dropped the
  // column on a misreading of the field's purpose. The frontend keeps the
  // type field present so existing read paths don't crash; a follow-up issue
  // restores the column with a clearer name (e.g. `ollamaWebSearchApiKey`).
  ollamaApiKey: string;
  ollamaModel: string;
  ollamaUrl: string;
  modelReady: boolean;
  defaultModel: string;
  researchModel: string;
  maxTokens: number;
  interStageDelaySeconds: number;
  usptoApiKey: string;
  exportPath: string;
  autoExport: boolean;
  encryptionHealthy: boolean;
}

export interface FeasibilityRunSummary {
  id: string;
  version: number;
  status: RunStatus;
  startedAt?: string;
  completedAt?: string;
  totalCostUsd: number;
}

export type PriorArtStatus = 'PENDING' | 'RUNNING' | 'COMPLETE' | 'ERROR' | 'NONE';

export interface PriorArtSearch {
  id: string | null;
  projectId: string;
  version: number;
  status: PriorArtStatus;
  query: string | null;
  startedAt: string | null;
  completedAt: string | null;
  results: PriorArtResult[];
}

export interface PriorArtResult {
  id: string;
  searchId: string;
  patentNumber: string;
  title: string;
  abstract: string | null;
  relevanceScore: number;
  snippet: string | null;
  source: string;
}

export interface PatentDetail {
  patentNumber: string;
  title: string | null;
  abstract: string | null;
  filingDate: string | null;
  grantDate: string | null;
  assignee: string[];
  inventors: string[];
  cpcClassifications: { code: string; title: string }[];
  claimsText: string | null;
  claimCount: number | null;
  patentType: string | null;
}
