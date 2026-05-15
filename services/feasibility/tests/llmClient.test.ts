/**
 * Tests for the LLMClient wrapper (feasibility service).
 *
 * Verifies provider dispatch (LOCAL → ollama-client.streamMessage, CLOUD → typed error).
 * Per merge-decisions.md #16: dedicated dispatch test for this service.
 *
 * Mocks `streamMessage` from ollama-client so LOCAL dispatch doesn't need
 * a real Ollama instance.
 */

import { streamLLM, LLMClientCloudNotImplementedError } from '../src/llmClient';
import * as ollamaClient from '../src/ollama-client';
import type { AnalysisSettings, StreamResult } from '../src/models';

const baseSettings: AnalysisSettings = {
  model: 'gemma4:e4b',
  maxTokens: 1024,
  interStageDelaySeconds: 0,
  ollamaUrl: 'http://127.0.0.1:11434',
};

const stubResult: StreamResult = {
  text: 'stubbed response',
  webSearchUsed: false,
  inputTokens: 10,
  outputTokens: 20,
};

describe('streamLLM provider dispatch', () => {
  let streamMessageSpy: jest.SpyInstance;

  beforeEach(() => {
    streamMessageSpy = jest
      .spyOn(ollamaClient, 'streamMessage')
      .mockResolvedValue(stubResult);
  });

  afterEach(() => {
    streamMessageSpy.mockRestore();
  });

  test('LOCAL routes through ollama-client.streamMessage with correct args', async () => {
    const settings: AnalysisSettings = { ...baseSettings, provider: 'LOCAL' };

    const result = await streamLLM(settings, {
      systemPrompt: 'sys',
      userMessage: 'user',
      model: 'gemma4:e4b',
      maxTokens: 2048,
      useWebSearch: true,
    });

    expect(streamMessageSpy).toHaveBeenCalledTimes(1);
    const callArgs = streamMessageSpy.mock.calls[0][0];
    expect(callArgs.ollamaUrl).toBe('http://127.0.0.1:11434');
    expect(callArgs.systemPrompt).toBe('sys');
    expect(callArgs.userMessage).toBe('user');
    expect(callArgs.model).toBe('gemma4:e4b');
    expect(callArgs.maxTokens).toBe(2048);
    expect(callArgs.useWebSearch).toBe(true);
    expect(result).toEqual(stubResult);
  });

  test('default provider is LOCAL when omitted (backward compat)', async () => {
    // No provider field set — must dispatch to LOCAL.
    const settings: AnalysisSettings = { ...baseSettings };

    await streamLLM(settings, {
      systemPrompt: 'sys',
      userMessage: 'user',
      model: 'gemma4:e4b',
      maxTokens: 1024,
    });

    expect(streamMessageSpy).toHaveBeenCalledTimes(1);
  });

  test('CLOUD throws LLMClientCloudNotImplementedError (typed, not silent)', async () => {
    const settings: AnalysisSettings = {
      ...baseSettings,
      provider: 'CLOUD',
      apiKey: 'sk-test-abc',
    };

    await expect(
      streamLLM(settings, {
        systemPrompt: 'sys',
        userMessage: 'user',
        model: 'claude-haiku-4-5',
        maxTokens: 1024,
      }),
    ).rejects.toThrow(LLMClientCloudNotImplementedError);

    // Did NOT fall back to ollama-client
    expect(streamMessageSpy).not.toHaveBeenCalled();
  });

  test('CLOUD error message mentions Run 4 (the run that wires it up)', async () => {
    const settings: AnalysisSettings = { ...baseSettings, provider: 'CLOUD' };

    try {
      await streamLLM(settings, {
        systemPrompt: 's',
        userMessage: 'u',
        model: 'm',
        maxTokens: 1,
      });
      fail('expected throw');
    } catch (err) {
      expect((err as Error).message).toMatch(/Run 4/);
      expect((err as Error).name).toBe('LLMClientCloudNotImplementedError');
    }
  });

  test('unknown provider throws generic error', async () => {
    const settings = {
      ...baseSettings,
      provider: 'WEIRD',
    } as unknown as AnalysisSettings;

    await expect(
      streamLLM(settings, {
        systemPrompt: 's',
        userMessage: 'u',
        model: 'm',
        maxTokens: 1,
      }),
    ).rejects.toThrow(/Unknown provider/);

    expect(streamMessageSpy).not.toHaveBeenCalled();
  });

  test('LOCAL preserves ollamaApiKey when set', async () => {
    const settings: AnalysisSettings = {
      ...baseSettings,
      provider: 'LOCAL',
      ollamaApiKey: 'ollama-secret',
    };

    await streamLLM(settings, {
      systemPrompt: 'sys',
      userMessage: 'user',
      model: 'gemma4:e4b',
      maxTokens: 1024,
    });

    const callArgs = streamMessageSpy.mock.calls[0][0];
    expect(callArgs.ollamaApiKey).toBe('ollama-secret');
  });
});
