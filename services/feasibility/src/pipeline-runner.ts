import {
  AnalysisSettings,
  StageResult,
  STAGE_DEFINITIONS,
  InventionInput,
  toNarrative,
  estimateCost,
} from './models';
import { streamMessage } from './anthropic-client';
import { loadSystemPrompt } from './prompts/loader';

export type PipelineEvent =
  | { type: 'stage_start'; stage: number; name: string }
  | { type: 'token'; text: string }
  | { type: 'status'; message: string }
  | { type: 'stage_complete'; stage: number; output: string; model: string; webSearchUsed: boolean; inputTokens: number; outputTokens: number; estimatedCostUsd: number }
  | { type: 'pipeline_complete'; finalReport: string; stages: StageResult[] }
  | { type: 'error'; stage: number; message: string };

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ms <= 0) { resolve(); return; }
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

/**
 * Build the user message for a given stage, exactly matching C# PipelineRunner.BuildUserMessage.
 */
function buildUserMessage(
  stageNumber: number,
  input: InventionInput,
  previousOutputs: Map<number, string>,
  settings?: AnalysisSettings,
): string {
  const narrative = input.rawNarrative || toNarrative(input);
  const stage1 = previousOutputs.get(1) ?? '';
  const stage2 = previousOutputs.get(2) ?? '';
  const stage3 = previousOutputs.get(3) ?? '';
  const stage4 = previousOutputs.get(4) ?? '';

  switch (stageNumber) {
    case 1:
      return `Analyze this invention:\n\n${narrative}`;

    case 2: {
      const priorArtSection = settings?.priorArtContext
        ? `\n\n---\n\n## PatentsView Prior Art Results\n\nThe following patents were retrieved from the USPTO PatentsView database and are relevant to this invention. Reference them by patent number in your analysis.\n\n${settings.priorArtContext}`
        : '';
      return (
        `## Invention (Technical Restatement from Stage 1)\n\n${stage1}` +
        `\n\n## Original Inventor Description\n\n${narrative}` +
        priorArtSection
      );
    }

    case 3:
      return (
        `## Technical Restatement\n\n${stage1}` +
        `\n\n## Prior Art Found\n\n${stage2 || 'No prior art search results available.'}` +
        `\n\n## Original Description\n\n${narrative}`
      );

    case 4:
      return (
        `## Technical Restatement\n\n${stage1}` +
        `\n\n## Prior Art Found\n\n${stage2}` +
        `\n\n## Patentability Analysis\n\n${stage3}` +
        `\n\n## Original Description\n\n${narrative}`
      );

    case 5:
      return (
        `## Technical Restatement\n\n${stage1}` +
        `\n\n## Prior Art Found\n\n${stage2}` +
        `\n\n## Patentability Analysis\n\n${stage3}` +
        `\n\n## AI & 3D Print Deep Dive\n\n${stage4}` +
        `\n\n## Original Description\n\n${narrative}`
      );

    case 6: {
      const stage5 = previousOutputs.get(5) ?? '';
      return (
        `## Original Inventor Description\n\n${narrative}` +
        `\n\n## Stage 1: Technical Intake & Restatement\n\n${stage1}` +
        `\n\n## Stage 2: Prior Art Research\n\n${stage2}` +
        `\n\n## Stage 3: Patentability Analysis\n\n${stage3}` +
        `\n\n## Stage 4: Deep Dive Analysis\n\n${stage4}` +
        `\n\n## Stage 5: IP Strategy & Recommendations\n\n${stage5}`
      );
    }

    default:
      throw new Error(`Unknown stage number: ${stageNumber}`);
  }
}

/**
 * Run a single stage with real-time token streaming via a generator.
 * Uses a shared event queue so callbacks can push events that the generator yields.
 */
async function* runStage(
  stageDef: (typeof STAGE_DEFINITIONS)[number],
  input: InventionInput,
  previousOutputs: Map<number, string>,
  settings: AnalysisSettings,
  signal?: AbortSignal,
): AsyncGenerator<PipelineEvent, StageResult | null, unknown> {
  // Event queue + resolve handle for the producer/consumer pattern
  const queue: PipelineEvent[] = [];
  let resolve: (() => void) | null = null;
  let streamDone = false;
  let streamError: Error | null = null;

  function enqueue(event: PipelineEvent) {
    queue.push(event);
    resolve?.();
    resolve = null;
  }

  const startedAt = new Date();
  const modelToUse =
    stageDef.number === 2 && settings.researchModel
      ? settings.researchModel
      : settings.model;

  const systemPrompt = loadSystemPrompt(stageDef.number);
  const userMessage = buildUserMessage(stageDef.number, input, previousOutputs, settings);

  // Kick off the stream in the background
  const streamPromise = streamMessage({
    apiKey: settings.apiKey,
    systemPrompt,
    userMessage,
    model: modelToUse,
    maxTokens: settings.maxTokens,
    useWebSearch: stageDef.usesWebSearch,
    webSearchMaxUses: stageDef.webSearchMaxUses,
    onToken: (text) => {
      enqueue({ type: 'token', text });
    },
    onStatus: (message) => {
      enqueue({ type: 'status', message });
    },
    signal,
  }).then(result => {
    streamDone = true;
    resolve?.();
    resolve = null;
    return result;
  }).catch(err => {
    streamError = err;
    streamDone = true;
    resolve?.();
    resolve = null;
    return null;
  });

  // Drain the queue until the stream finishes
  while (!streamDone || queue.length > 0) {
    while (queue.length > 0) {
      yield queue.shift()!;
    }
    if (!streamDone) {
      await new Promise<void>(r => { resolve = r; });
    }
  }

  if (streamError) {
    if ((streamError as any).name === 'AbortError') {
      return null; // signal cancellation to caller
    }
    throw streamError;
  }

  const result = await streamPromise;
  if (!result) return null;

  const estimatedCostUsd = estimateCost(modelToUse, result.inputTokens, result.outputTokens);

  return {
    stageNumber: stageDef.number,
    stageName: stageDef.name,
    status: 'COMPLETE',
    outputText: result.text,
    model: modelToUse,
    startedAt,
    completedAt: new Date(),
    webSearchUsed: result.webSearchUsed,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    estimatedCostUsd,
  } satisfies StageResult;
}

export async function* runPipeline(
  input: InventionInput,
  settings: AnalysisSettings,
  signal?: AbortSignal,
  startFromStage = 1,
  seedOutputs: Map<number, string> = new Map(),
): AsyncGenerator<PipelineEvent> {
  const completedStages: StageResult[] = [];
  // Pre-seed outputs from already-completed stages (resume mode)
  const previousOutputs = new Map<number, string>(seedOutputs);
  let finalReport = '';

  for (const stageDef of STAGE_DEFINITIONS) {
    // Skip stages already completed in a previous run (resume mode)
    if (stageDef.number < startFromStage) {
      continue;
    }

    if (signal?.aborted) {
      yield { type: 'error', stage: stageDef.number, message: 'Pipeline cancelled' };
      return;
    }

    // Inter-stage delay (skip before the first stage being run)
    if (stageDef.number > startFromStage && settings.interStageDelaySeconds > 0) {
      const delayMs = settings.interStageDelaySeconds * 1000;
      yield {
        type: 'status',
        message: `Waiting ${settings.interStageDelaySeconds}s before Stage ${stageDef.number}...`,
      };
      try {
        await sleep(delayMs, signal);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          yield { type: 'error', stage: stageDef.number, message: 'Pipeline cancelled' };
          return;
        }
        throw err;
      }
    }

    yield { type: 'stage_start', stage: stageDef.number, name: stageDef.name };

    let stageResult: StageResult | null = null;

    try {
      const stageGen = runStage(stageDef, input, previousOutputs, settings, signal);
      let next = await stageGen.next();
      while (!next.done) {
        yield next.value as PipelineEvent;
        next = await stageGen.next();
      }
      stageResult = (next.value as StageResult | null) ?? null;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        yield { type: 'error', stage: stageDef.number, message: 'Pipeline cancelled' };
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      yield { type: 'error', stage: stageDef.number, message };

      completedStages.push({
        stageNumber: stageDef.number,
        stageName: stageDef.name,
        status: 'ERROR',
        outputText: '',
        model: settings.model,
        startedAt: new Date(),
        completedAt: new Date(),
        webSearchUsed: false,
        errorMessage: message,
      });
      return;
    }

    // null result means cancelled
    if (!stageResult) {
      yield { type: 'error', stage: stageDef.number, message: 'Stage cancelled' };
      return;
    }

    previousOutputs.set(stageDef.number, stageResult.outputText);

    if (stageDef.number === 6) {
      finalReport = stageResult.outputText;
    }

    completedStages.push(stageResult);

    yield {
      type: 'stage_complete',
      stage: stageDef.number,
      output: stageResult.outputText,
      model: stageResult.model,
      webSearchUsed: stageResult.webSearchUsed,
      inputTokens: stageResult.inputTokens ?? 0,
      outputTokens: stageResult.outputTokens ?? 0,
      estimatedCostUsd: stageResult.estimatedCostUsd ?? 0,
    };
  }

  yield {
    type: 'pipeline_complete',
    finalReport,
    stages: completedStages,
  };
}
