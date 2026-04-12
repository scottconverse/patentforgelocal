export interface InventionInput {
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
  /** Pre-built narrative string — if set, pipeline uses this directly instead of calling toNarrative() */
  rawNarrative?: string;
}

export function toNarrative(input: InventionInput): string {
  const parts: string[] = [];
  function add(label: string, value?: string) {
    if (value && value.trim()) parts.push(`**${label}:** ${value.trim()}`);
  }
  add('Invention Title', input.title);
  add('Description', input.description);
  add('Problem Solved', input.problemSolved);
  add('How It Works', input.howItWorks);
  add('AI / ML Components', input.aiComponents);
  add('3D Printing / Physical Design Components', input.threeDPrintComponents);
  add('What I Believe Is Novel', input.whatIsNovel);
  add('Current Alternatives / Prior Solutions', input.currentAlternatives);
  add('What Has Been Built So Far', input.whatIsBuilt);
  add('What I Want Protected', input.whatToProtect);
  add('Additional Notes', input.additionalNotes);
  return parts.join('\n\n');
}

export type StageStatus = 'PENDING' | 'RUNNING' | 'COMPLETE' | 'ERROR' | 'CANCELLED';

export interface StageResult {
  stageNumber: number;
  stageName: string;
  status: StageStatus;
  outputText: string;
  model: string;
  startedAt: Date;
  completedAt?: Date;
  webSearchUsed: boolean;
  errorMessage?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}

export interface AnalysisResult {
  input: InventionInput;
  stages: StageResult[];
  startedAt: Date;
  completedAt?: Date;
  finalReport: string;
}

export interface StageDefinition {
  number: number;
  name: string;
  usesWebSearch: boolean;
  webSearchMaxUses: number;
}

export const STAGE_DEFINITIONS: StageDefinition[] = [
  { number: 1, name: 'Technical Intake & Restatement', usesWebSearch: false, webSearchMaxUses: 0 },
  { number: 2, name: 'Prior Art Research',             usesWebSearch: true,  webSearchMaxUses: 20 },
  { number: 3, name: 'Patentability Analysis',         usesWebSearch: true,  webSearchMaxUses: 5 },
  { number: 4, name: 'Deep Dive Analysis',             usesWebSearch: true,  webSearchMaxUses: 10 },
  { number: 5, name: 'IP Strategy & Recommendations',  usesWebSearch: false, webSearchMaxUses: 0 },
  { number: 6, name: 'Comprehensive Report',           usesWebSearch: false, webSearchMaxUses: 0 },
];

export const STAGE_NAMES: Record<number, string> = Object.fromEntries(
  STAGE_DEFINITIONS.map(s => [s.number, s.name])
);

export interface AnalysisSettings {
  model: string;
  researchModel?: string;
  maxTokens: number;
  interStageDelaySeconds: number;
  apiKey: string;
  priorArtContext?: string;
}

export interface StreamResult {
  text: string;
  webSearchUsed: boolean;
  inputTokens: number;
  outputTokens: number;
}

// Approximate pricing per million tokens (update as Anthropic changes rates)
export const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'claude-haiku-4-5-20251001': { inputPer1M: 0.80,  outputPer1M: 4.00  },
  'claude-haiku-3-20240307':   { inputPer1M: 0.25,  outputPer1M: 1.25  },
  'claude-sonnet-4-20250514':  { inputPer1M: 3.00,  outputPer1M: 15.00 },
  'claude-opus-4-20250514':    { inputPer1M: 15.00, outputPer1M: 75.00 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Find pricing — try exact match first, then partial match
  const pricing =
    MODEL_PRICING[model] ??
    Object.entries(MODEL_PRICING).find(([k]) => model.includes(k.split('-').slice(0, 3).join('-')))?.[1] ??
    { inputPer1M: 3.00, outputPer1M: 15.00 }; // fallback to Sonnet pricing
  return (inputTokens / 1_000_000) * pricing.inputPer1M +
         (outputTokens / 1_000_000) * pricing.outputPer1M;
}
