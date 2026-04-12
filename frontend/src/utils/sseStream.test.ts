import { describe, it, expect, vi } from 'vitest';
import { parseSSEStream, startSSEStream, SSEEvent } from './sseStream';

/**
 * Helper: create a mock Response whose body is a ReadableStream
 * that emits the given string chunks.
 */
function mockResponse(chunks: string[], status = 200): Response {
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(new TextEncoder().encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    body: stream,
    text: async () => chunks.join(''),
  } as unknown as Response;
}

describe('parseSSEStream', () => {
  it('parses a single SSE event', async () => {
    const response = mockResponse([
      'event: step\ndata: {"step":"plan","status":"complete"}\n\n',
    ]);

    const events: SSEEvent[] = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('step');
    expect(events[0].data).toEqual({ step: 'plan', status: 'complete' });
  });

  it('parses multiple events from a single chunk', async () => {
    const response = mockResponse([
      'event: step\ndata: {"step":"plan","status":"complete"}\n\nevent: step\ndata: {"step":"draft","status":"running"}\n\n',
    ]);

    const events: SSEEvent[] = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0].data.step).toBe('plan');
    expect(events[1].data.step).toBe('draft');
  });

  it('handles events split across multiple chunks', async () => {
    const response = mockResponse([
      'event: step\n',
      'data: {"step":"plan","status":"complete"}\n\n',
    ]);

    const events: SSEEvent[] = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('step');
    expect(events[0].data.step).toBe('plan');
  });

  it('handles a data line split in the middle of JSON', async () => {
    const response = mockResponse([
      'event: complete\ndata: {"message":"hel',
      'lo world"}\n\n',
    ]);

    const events: SSEEvent[] = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('complete');
    expect(events[0].data.message).toBe('hello world');
  });

  it('skips non-JSON data lines', async () => {
    const response = mockResponse([
      'event: step\ndata: not-json\nevent: step\ndata: {"step":"ok"}\n\n',
    ]);

    const events: SSEEvent[] = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].data.step).toBe('ok');
  });

  it('falls back to data.type when event line is missing', async () => {
    const response = mockResponse([
      'data: {"type":"step","step":"plan"}\n\n',
    ]);

    const events: SSEEvent[] = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('step');
  });

  it('uses "message" as default event type', async () => {
    const response = mockResponse([
      'data: {"value":42}\n\n',
    ]);

    const events: SSEEvent[] = [];
    for await (const event of parseSSEStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('message');
  });

  it('throws when response body is null', async () => {
    const response = { body: null } as unknown as Response;

    const gen = parseSSEStream(response);
    await expect(gen.next()).rejects.toThrow('Response body is null');
  });

  it('stops when abort signal is triggered', async () => {
    const controller = new AbortController();
    // Create a stream that emits one event then hangs
    let pullCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(ctrl) {
        pullCount++;
        if (pullCount === 1) {
          ctrl.enqueue(new TextEncoder().encode('event: step\ndata: {"step":"plan"}\n\n'));
        } else {
          // Simulate a hanging stream — abort will break the loop
          await new Promise((resolve) => setTimeout(resolve, 10000));
        }
      },
    });

    const response = { ok: true, status: 200, body: stream } as unknown as Response;

    const events: SSEEvent[] = [];
    // Abort after first event
    setTimeout(() => controller.abort(), 50);

    for await (const event of parseSSEStream(response, controller.signal)) {
      events.push(event);
      if (events.length === 1) break; // Safety: don't wait for second event
    }

    expect(events).toHaveLength(1);
    expect(events[0].data.step).toBe('plan');
  });
});

describe('startSSEStream', () => {
  it('throws on non-ok response', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse(['{"error":"Bad request"}'], 400),
    );

    try {
      await expect(startSSEStream('/api/test', { body: {} })).rejects.toThrow(
        'Stream request failed (400)',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns a working stream on ok response', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      mockResponse(['event: complete\ndata: {"done":true}\n\n']),
    );

    try {
      const { stream } = await startSSEStream('/api/test');
      const events: SSEEvent[] = [];
      for await (const event of stream) {
        events.push(event);
      }
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('complete');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('sends JSON body with correct headers', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(['event: complete\ndata: {"ok":true}\n\n']),
    );
    globalThis.fetch = fetchMock;

    try {
      await startSSEStream('/api/test', { body: { foo: 'bar' } });
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{"foo":"bar"}',
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
