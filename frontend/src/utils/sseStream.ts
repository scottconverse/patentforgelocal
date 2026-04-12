/**
 * Shared SSE (Server-Sent Events) stream parser.
 *
 * Reads a fetch Response body as a ReadableStream, parses SSE-formatted lines,
 * and yields structured {event, data} objects. Handles chunked delivery,
 * partial lines across chunks, and JSON parsing.
 *
 * Reference implementation: useFeasibilityRun.ts lines 414-634
 */

export interface SSEEvent {
  event: string;
  data: any;
}

/**
 * Parse an SSE stream from a fetch Response into an async generator of events.
 *
 * The SSE format expected:
 *   event: <type>\n
 *   data: <json>\n
 *   \n
 *
 * @param response - A fetch Response with a readable body stream
 * @param signal - Optional AbortSignal for cancellation
 * @yields SSEEvent objects with parsed event type and JSON data
 */
export async function* parseSSEStream(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
  if (!response.body) {
    throw new Error('Response body is null — SSE streaming requires a readable body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop()!; // keep incomplete last line in buffer

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          let data: any;
          try {
            data = JSON.parse(line.slice(6));
          } catch {
            // Non-JSON data line — skip
            continue;
          }

          const eventType = data.type || currentEvent || 'message';
          yield { event: eventType, data };
          currentEvent = '';
        }
        // Empty lines and other lines are ignored (SSE spec separators)
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Start an SSE stream request and return an async generator of events.
 *
 * Combines fetch + parseSSEStream into a single call. Throws on HTTP errors.
 *
 * @param url - The endpoint URL
 * @param options - Optional fetch options (method defaults to POST, body is JSON-stringified)
 * @param signal - Optional AbortSignal for cancellation
 */
export async function startSSEStream(
  url: string,
  options?: { method?: string; body?: unknown },
  signal?: AbortSignal,
): Promise<{ stream: AsyncGenerator<SSEEvent>; response: Response }> {
  const response = await fetch(url, {
    method: options?.method ?? 'POST',
    headers: options?.body ? { 'Content-Type': 'application/json' } : {},
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const json = JSON.parse(text);
      message = json.message || json.error || text;
    } catch {
      /* not JSON */
    }
    throw new Error(`Stream request failed (${response.status}): ${message}`);
  }

  const stream = parseSSEStream(response, signal);
  return { stream, response };
}
