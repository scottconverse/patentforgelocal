import http from 'http';
import { repairJSON, streamMessage } from '../src/ollama-client';

// Helper: create a local HTTP server that responds to POST /v1/chat/completions
function createMockServer(
  handler: (req: http.IncomingMessage, body: string, res: http.ServerResponse) => void,
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => handler(req, body, res));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ server, port: addr.port });
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// ─── repairJSON ─────────────────────────────────────────────

describe('repairJSON', () => {
  test('valid JSON passes through unchanged', () => {
    const input = '{"key": "value", "num": 42}';
    const result = repairJSON(input);
    expect(JSON.parse(result)).toEqual({ key: 'value', num: 42 });
  });

  test('strips markdown code fences', () => {
    const input = '```json\n{"hello": "world"}\n```';
    const result = repairJSON(input);
    expect(JSON.parse(result)).toEqual({ hello: 'world' });
  });

  test('strips code fences without language tag', () => {
    const input = '```\n{"a": 1}\n```';
    const result = repairJSON(input);
    expect(JSON.parse(result)).toEqual({ a: 1 });
  });

  test('closes unclosed braces', () => {
    const input = '{"key": "value"';
    const result = repairJSON(input);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  test('closes unclosed brackets', () => {
    const input = '["a", "b"';
    const result = repairJSON(input);
    expect(JSON.parse(result)).toEqual(['a', 'b']);
  });

  test('removes trailing commas', () => {
    const input = '{"a": 1, "b": 2, }';
    const result = repairJSON(input);
    expect(JSON.parse(result)).toEqual({ a: 1, b: 2 });
  });

  test('wraps plain text as valid JSON string', () => {
    const input = 'This is not JSON at all';
    const result = repairJSON(input);
    // jsonrepair wraps bare strings in quotes to produce valid JSON
    expect(result).toBe('"This is not JSON at all"');
    expect(JSON.parse(result)).toBe(input);
  });
});

// ─── streamMessage ──────────────────────────────────────────

describe('streamMessage', () => {
  test('streaming call returns text and token counts', async () => {
    const { server, port } = await createMockServer((_req, _body, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
      res.write(
        'data: {"choices":[{"delta":{"content":" World"}}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
      );
      res.write('data: [DONE]\n\n');
      res.end();
    });

    try {
      const tokens: string[] = [];
      const result = await streamMessage({
        ollamaUrl: `http://127.0.0.1:${port}`,
        systemPrompt: 'You are helpful.',
        userMessage: 'Say hello',
        model: 'test-model',
        maxTokens: 100,
        onToken: (t) => tokens.push(t),
      });

      expect(result.text).toBe('Hello World');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(5);
      expect(result.webSearchUsed).toBe(false);
      expect(tokens).toEqual(['Hello', ' World']);
    } finally {
      await closeServer(server);
    }
  }, 30_000);

  test('non-streaming tool call when useWebSearch=true', async () => {
    let capturedBody = '';

    const { server, port } = await createMockServer((_req, body, res) => {
      capturedBody = body;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: 'Search result here' } }],
          usage: { prompt_tokens: 20, completion_tokens: 15 },
        }),
      );
    });

    try {
      const result = await streamMessage({
        ollamaUrl: `http://127.0.0.1:${port}`,
        systemPrompt: 'System',
        userMessage: 'Search for patents',
        model: 'test-model',
        maxTokens: 200,
        useWebSearch: true,
      });

      expect(result.text).toBe('Search result here');
      // webSearchUsed is false because the model didn't actually invoke tool_calls
      expect(result.webSearchUsed).toBe(false);
      expect(result.inputTokens).toBe(20);
      expect(result.outputTokens).toBe(15);

      // Verify the request body had stream: false
      const parsed = JSON.parse(capturedBody);
      expect(parsed.stream).toBe(false);
    } finally {
      await closeServer(server);
    }
  }, 30_000);

  test('retries on server error then succeeds', async () => {
    let requestCount = 0;

    const { server, port } = await createMockServer((_req, _body, res) => {
      requestCount++;
      if (requestCount === 1) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }
      // Second request succeeds (non-streaming for simplicity via useWebSearch)
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: 'Recovered' } }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
      );
    });

    try {
      // Patch retry delays via monkey-patching the sleep to be instant
      // We use useWebSearch=true for simpler non-streaming response
      const statuses: string[] = [];
      const result = await streamMessage({
        ollamaUrl: `http://127.0.0.1:${port}`,
        systemPrompt: 'System',
        userMessage: 'Test retry',
        model: 'test-model',
        maxTokens: 100,
        useWebSearch: true,
        onStatus: (s) => statuses.push(s),
      });

      expect(requestCount).toBe(2);
      expect(result.text).toBe('Recovered');
      expect(statuses.length).toBeGreaterThanOrEqual(1);
      expect(statuses.some((s) => s.includes('Server error 500'))).toBe(true);
    } finally {
      await closeServer(server);
    }
  }, 60_000);

  test('handles web search tool call response', async () => {
    let callCount = 0;
    const { server, port } = await createMockServer((_req, body, res) => {
      callCount++;
      if (callCount === 1) {
        // First call: model returns a tool call
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{
            message: {
              content: '',
              tool_calls: [{
                id: 'call_1',
                function: {
                  name: 'web_search',
                  arguments: '{"query": "patent prior art machine learning"}',
                },
              }],
            },
          }],
          usage: { prompt_tokens: 100, completion_tokens: 10 },
        }));
      } else {
        // Second call: model synthesizes with search results
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{ message: { content: 'Analysis with web results...' } }],
          usage: { prompt_tokens: 200, completion_tokens: 50 },
        }));
      }
    });

    try {
      const result = await streamMessage({
        ollamaUrl: `http://127.0.0.1:${port}`,
        systemPrompt: 'Analyze patents.',
        userMessage: 'Find prior art',
        model: 'gemma4:e4b',
        maxTokens: 1000,
        useWebSearch: true,
        ollamaApiKey: 'test-key',
      });

      expect(callCount).toBeGreaterThanOrEqual(1);
      // The web search to ollama.com will fail in test (no real server)
      // but the tool call flow should still work and return something
      expect(result.text).toBeTruthy();
    } finally {
      await closeServer(server);
    }
  }, 30_000);

  test('non-streaming without ollamaApiKey does not send tools', async () => {
    let capturedBody = '';
    const { server, port } = await createMockServer((_req, body, res) => {
      capturedBody = body;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { content: 'No search needed.' } }],
        usage: { prompt_tokens: 50, completion_tokens: 20 },
      }));
    });

    try {
      const result = await streamMessage({
        ollamaUrl: `http://127.0.0.1:${port}`,
        systemPrompt: 'Test.',
        userMessage: 'Hello',
        model: 'gemma4:e4b',
        maxTokens: 100,
        useWebSearch: true,
        // NO ollamaApiKey
      });
      expect(result.text).toBe('No search needed.');

      // Verify the request body did NOT have tools when no API key
      const parsed = JSON.parse(capturedBody);
      expect(parsed.tools).toBeUndefined();
    } finally {
      await closeServer(server);
    }
  }, 30_000);

  test('throws on persistent failure after all retries', async () => {
    const { server, port } = await createMockServer((_req, _body, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Persistent failure');
    });

    try {
      await expect(
        streamMessage({
          ollamaUrl: `http://127.0.0.1:${port}`,
          systemPrompt: 'System',
          userMessage: 'Fail test',
          model: 'test-model',
          maxTokens: 100,
          useWebSearch: true,
        }),
      ).rejects.toThrow(/after 3 attempts|error 500/);
    } finally {
      await closeServer(server);
    }
  }, 60_000);
});
