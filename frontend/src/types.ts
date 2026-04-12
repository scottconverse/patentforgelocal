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

export interface AppSettings {
  id: string;
  anthropicApiKey: string;
  defaultModel: string;
  researchModel: string;
  maxTokens: number;
  interStageDelaySeconds: number;
  exportPath: string;
  autoExport: boolean;
  costCapUsd: number;
  usptoApiKey: string;
  encryptionHealthy?: boolean;
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
