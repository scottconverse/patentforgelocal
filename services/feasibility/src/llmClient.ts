/**
 * Unified LLM client for the feasibility service.
 *
 * Dispatches on settings.provider:
 *   - LOCAL → ollama-client.streamMessage (existing implementation)
 *   - CLOUD → throws LLMClientCloudNotImplementedError (filled in by Run 4)
 *
 * This is the Node equivalent of the Python LLMClient introduced in Run 2.
 * In Python, LiteLLM provides both Ollama and Anthropic dispatch through one
 * call. Node has no equivalent first-party LiteLLM binding; the npm `litellm`
 * package is a thin proxy wrapper, and standing up the LiteLLM proxy as a
 * separate service is operational overhead that's better justified once the
 * Settings UI actually exposes the cloud-vs-local choice to users (Run 5).
 *
 * For Run 2, the abstraction layer is in place and LOCAL is fully functional.
 * CLOUD throws an explicit typed error rather than silently falling back, so
 * misconfigured callers fail loud. Run 4 (Prisma schema + AppSettings reshape)
 * adds the CLOUD branch using either @anthropic-ai/sdk directly or LiteLLM
 * proxy mode, depending on what falls out of that run's scope discussion.
 *
 * Tests mock at the LLMClient boundary, NOT at streamMessage internals.
 */

import { streamMessage } from './ollama-client';
import { AnalysisSettings, StreamResult } from './models';

export class LLMClientCloudNotImplementedError extends Error {
  constructor() {
    super(
      'CLOUD provider is wired but not yet implemented in feasibility service. ' +
      'The LLMClient dispatch layer exists; the Anthropic streaming + tool-call ' +
      'integration lands in merge plan Run 4 (concurrent with the Settings UI ' +
      'exposing the provider choice). For now, set provider=LOCAL.'
    );
    this.name = 'LLMClientCloudNotImplementedError';
  }
}

export interface LLMStreamParams {
  systemPrompt: string;
  userMessage: string;
  model: string;
  maxTokens: number;
  useWebSearch?: boolean;
  onToken?: (text: string) => void;
  onStatus?: (status: string) => void;
  signal?: AbortSignal;
}

/**
 * Provider-aware streaming LLM call.
 *
 * Returns a StreamResult shape identical to the existing ollama-client.streamMessage
 * so callers (pipeline-runner) don't see provider differences.
 */
export async function streamLLM(
  settings: AnalysisSettings,
  params: LLMStreamParams,
): Promise<StreamResult> {
  const provider = settings.provider ?? 'LOCAL';

  if (provider === 'LOCAL') {
    return streamMessage({
      ollamaUrl: settings.ollamaUrl,
      systemPrompt: params.systemPrompt,
      userMessage: params.userMessage,
      model: params.model,
      maxTokens: params.maxTokens,
      useWebSearch: params.useWebSearch,
      ollamaApiKey: settings.ollamaApiKey,
      onToken: params.onToken,
      onStatus: params.onStatus,
      signal: params.signal,
    });
  }

  if (provider === 'CLOUD') {
    throw new LLMClientCloudNotImplementedError();
  }

  throw new Error(`Unknown provider: ${String(provider)}. Expected 'LOCAL' or 'CLOUD'.`);
}
