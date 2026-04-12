import { StreamResult } from './models';

const BASE_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const MAX_RETRIES = 3;
const RATE_LIMIT_DELAYS = [60_000, 90_000, 120_000];
const SERVER_ERROR_DELAYS = [30_000, 45_000, 60_000];

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

export async function streamMessage(params: {
  apiKey: string;
  systemPrompt: string;
  userMessage: string;
  model: string;
  maxTokens: number;
  useWebSearch?: boolean;
  webSearchMaxUses?: number;
  onToken?: (text: string) => void;
  onStatus?: (status: string) => void;
  signal?: AbortSignal;
}): Promise<StreamResult> {
  const {
    apiKey,
    systemPrompt,
    userMessage,
    model,
    maxTokens,
    useWebSearch = false,
    webSearchMaxUses = 5,
    onToken,
    onStatus,
    signal,
  } = params;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
  };
  // Extended thinking is only available on Sonnet/Opus, not Haiku
  if (!model.includes('haiku')) {
    headers['anthropic-beta'] = 'interleaved-thinking-2025-05-14';
  }

  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    stream: true,
    system: [{ type: 'text', text: systemPrompt }],
    messages: [{ role: 'user', content: userMessage }],
  };

  if (useWebSearch) {
    requestBody.tools = [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: webSearchMaxUses,
      },
    ];
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    let response: Response;
    try {
      response = await fetch(BASE_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = SERVER_ERROR_DELAYS[attempt];
        onStatus?.(`Connection error. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay, signal);
        continue;
      }
      throw err;
    }

    // Handle rate limit (429)
    if (response.status === 429) {
      if (attempt < MAX_RETRIES - 1) {
        const delay = RATE_LIMIT_DELAYS[attempt];
        onStatus?.(`Rate limited. Waiting ${delay / 1000}s before retry... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay, signal);
        continue;
      }
      const body = await response.text();
      throw new Error(`Rate limit exceeded after ${MAX_RETRIES} attempts: ${body}`);
    }

    // Handle server errors (502/503)
    if (response.status === 502 || response.status === 503) {
      if (attempt < MAX_RETRIES - 1) {
        const delay = SERVER_ERROR_DELAYS[attempt];
        onStatus?.(`Server error ${response.status}. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay, signal);
        continue;
      }
      const body = await response.text();
      throw new Error(`Server error ${response.status} after ${MAX_RETRIES} attempts: ${body}`);
    }

    // Handle other non-2xx errors
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${body}`);
    }

    // Parse the SSE stream
    return await parseStream(response, onToken, onStatus, signal);
  }

  throw lastError ?? new Error('Max retries exceeded');
}

async function parseStream(
  response: Response,
  onToken?: (text: string) => void,
  onStatus?: (status: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let text = '';
  let webSearchUsed = false;
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

      // Process complete lines
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === '') continue;
        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice('data: '.length);
        if (data === '[DONE]') continue;

        let event: any;
        try {
          event = JSON.parse(data);
        } catch {
          // Not valid JSON, skip
          continue;
        }

        const eventType: string = event.type ?? '';

        if (eventType === 'message_start') {
          const usage = event.message?.usage ?? {};
          if (typeof usage.input_tokens === 'number') {
            inputTokens = usage.input_tokens;
          }
        } else if (eventType === 'content_block_delta') {
          const delta = event.delta ?? {};
          if (delta.type === 'text_delta' && typeof delta.text === 'string') {
            text += delta.text;
            onToken?.(delta.text);
          }
        } else if (eventType === 'content_block_start') {
          const block = event.content_block ?? {};
          if (block.type === 'server_tool_use') {
            webSearchUsed = true;
            onStatus?.('Searching the web...');
          }
        } else if (eventType === 'message_delta') {
          const usage = event.usage ?? {};
          if (typeof usage.output_tokens === 'number') {
            outputTokens = usage.output_tokens;
          }
        } else if (eventType === 'error') {
          const err = event.error ?? {};
          throw new Error(`Anthropic stream error: ${err.message ?? JSON.stringify(err)}`);
        }
      }
    }

    // Flush any remaining buffer
    if (buffer.trim().startsWith('data: ')) {
      const data = buffer.trim().slice('data: '.length);
      if (data !== '[DONE]') {
        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta') {
            const delta = event.delta ?? {};
            if (delta.type === 'text_delta' && typeof delta.text === 'string') {
              text += delta.text;
              onToken?.(delta.text);
            }
          } else if (event.type === 'message_delta') {
            const usage = event.usage ?? {};
            if (typeof usage.output_tokens === 'number') {
              outputTokens = usage.output_tokens;
            }
          }
        } catch {
          // Ignore parse errors on partial buffer
        }
      }
    }
  } finally {
    try { reader.cancel(); } catch { /* ignore */ }
  }

  return { text, webSearchUsed, inputTokens, outputTokens };
}
