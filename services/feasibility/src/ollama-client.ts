import { StreamResult } from './models';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [5_000, 10_000, 15_000];

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
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
 * Attempt to repair malformed JSON from LLM tool-call responses.
 * Handles common issues: trailing commas, unescaped newlines in strings,
 * truncated output (missing closing braces/brackets).
 */
export function repairJSON(raw: string): string {
  let s = raw.trim();

  // Strip markdown code fences if present
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, '$1');

  // Count unmatched braces/brackets and close them
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;

  for (const ch of s) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') braces++;
    else if (ch === '}') braces--;
    else if (ch === '[') brackets++;
    else if (ch === ']') brackets--;
  }

  // Close unclosed strings
  if (inString) s += '"';

  // Close unclosed brackets/braces
  while (brackets > 0) { s += ']'; brackets--; }
  while (braces > 0) { s += '}'; braces--; }

  return s;
}

export async function streamMessage(params: {
  ollamaUrl: string;
  systemPrompt: string;
  userMessage: string;
  model: string;
  maxTokens: number;
  useWebSearch?: boolean;
  onToken?: (text: string) => void;
  onStatus?: (status: string) => void;
  signal?: AbortSignal;
}): Promise<StreamResult> {
  const {
    ollamaUrl,
    systemPrompt,
    userMessage,
    model,
    maxTokens,
    useWebSearch = false,
    onToken,
    onStatus,
    signal,
  } = params;

  const endpoint = `${ollamaUrl.replace(/\/+$/, '')}/v1/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userMessage },
  ];

  // Use non-streaming for tool-call turns (Gemma 4 streaming bug workaround)
  const shouldStream = !useWebSearch;

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    stream: shouldStream,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt];
        onStatus?.(`Connection error: ${err.message}. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay, signal);
        continue;
      }
      throw new Error(`Ollama connection failed after ${MAX_RETRIES} attempts: ${err.message}`);
    }

    // Retry on 5xx server errors
    if (response.status >= 500) {
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt];
        onStatus?.(`Server error ${response.status}. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay, signal);
        continue;
      }
      const body = await response.text();
      throw new Error(`Ollama server error ${response.status} after ${MAX_RETRIES} attempts: ${body}`);
    }

    // Non-retryable errors
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${body}`);
    }

    if (shouldStream) {
      return await parseStream(response, onToken, onStatus, signal);
    } else {
      return await parseNonStreaming(response);
    }
  }

  throw lastError ?? new Error('Max retries exceeded');
}

async function parseStream(
  response: Response,
  onToken?: (text: string) => void,
  _onStatus?: (status: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) {
        reader.cancel();
        throw new DOMException('Aborted', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice('data: '.length);
        if (data === '[DONE]') continue;

        let event: any;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }

        const choices = event.choices ?? [];
        if (choices.length > 0) {
          const delta = choices[0].delta ?? {};
          if (typeof delta.content === 'string') {
            text += delta.content;
            onToken?.(delta.content);
          }
        }

        const usage = event.usage;
        if (usage) {
          if (typeof usage.prompt_tokens === 'number') {
            inputTokens = usage.prompt_tokens;
          }
          if (typeof usage.completion_tokens === 'number') {
            outputTokens = usage.completion_tokens;
          }
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim().startsWith('data: ')) {
      const data = buffer.trim().slice('data: '.length);
      if (data !== '[DONE]') {
        try {
          const event = JSON.parse(data);
          const choices = event.choices ?? [];
          if (choices.length > 0) {
            const delta = choices[0].delta ?? {};
            if (typeof delta.content === 'string') {
              text += delta.content;
              onToken?.(delta.content);
            }
          }
          const usage = event.usage;
          if (usage) {
            if (typeof usage.prompt_tokens === 'number') inputTokens = usage.prompt_tokens;
            if (typeof usage.completion_tokens === 'number') outputTokens = usage.completion_tokens;
          }
        } catch {
          // Ignore parse errors on partial buffer
        }
      }
    }
  } finally {
    try { reader.cancel(); } catch { /* ignore */ }
  }

  return { text, webSearchUsed: false, inputTokens, outputTokens };
}

async function parseNonStreaming(response: Response): Promise<StreamResult> {
  const body = await response.json();

  const choices = body.choices ?? [];
  const text = choices.length > 0 ? (choices[0].message?.content ?? '') : '';
  const usage = body.usage ?? {};

  return {
    text,
    webSearchUsed: true,
    inputTokens: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0,
    outputTokens: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0,
  };
}
