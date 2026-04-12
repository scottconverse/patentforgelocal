# Phase 2: Context-Mode Integration + LLM Client Swap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Anthropic API client in the feasibility service with an Ollama-compatible client, and integrate context-mode for intelligent stage output compression so the 6-stage pipeline works within Gemma 4's effective context window (32-64K tokens on 32GB RAM).

**Architecture:** The feasibility service (`services/feasibility/`) has a 6-stage async generator pipeline. Each stage calls `streamMessage()` from `anthropic-client.ts`. We replace that with `ollama-client.ts` targeting `http://127.0.0.1:11434/v1/chat/completions` (OpenAI-compatible). We also add a `context-manager.ts` that wraps context-mode's `ContentStore` to index each stage's output after completion and retrieve relevant chunks for later stages — replacing the current approach of concatenating ALL prior outputs verbatim (which can exceed 150K tokens by Stage 6).

**Tech Stack:** TypeScript, Node.js, Ollama OpenAI-compatible API, context-mode (better-sqlite3 + FTS5), Express

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `services/feasibility/src/ollama-client.ts` | Streaming LLM client targeting Ollama's OpenAI-compatible API |
| `services/feasibility/src/context-manager.ts` | Wraps context-mode's ContentStore for stage output indexing and smart retrieval |
| `services/feasibility/tests/ollama-client.test.ts` | Tests for Ollama client with mock HTTP server |
| `services/feasibility/tests/context-manager.test.ts` | Tests for context manager indexing and search |
| `scripts/bundle-context-mode.sh` | Copies context-mode's ContentStore into the feasibility service |

### Modified files

| File | Changes |
|------|---------|
| `services/feasibility/src/models.ts` | Remove Anthropic pricing, add Ollama model type, remove `apiKey` from `AnalysisSettings`, add `ollamaUrl` |
| `services/feasibility/src/pipeline-runner.ts` | Import `ollama-client` instead of `anthropic-client`, integrate context-manager for stage output compression |
| `services/feasibility/src/server.ts` | Remove `apiKey` requirement, add `ollamaUrl` default, update health check name |
| `services/feasibility/package.json` | Add `better-sqlite3` dependency, remove any Anthropic references |

### Deleted files

| File | Reason |
|------|--------|
| `services/feasibility/src/anthropic-client.ts` | Replaced by `ollama-client.ts` |

---

## Task 1: Create `ollama-client.ts`

**Files:**
- Create: `services/feasibility/src/ollama-client.ts`
- Test: `services/feasibility/tests/ollama-client.test.ts`

This replaces `anthropic-client.ts`. It targets Ollama's OpenAI-compatible endpoint at `http://127.0.0.1:11434/v1/chat/completions`. Key differences from the Anthropic client:
- No API key needed (local server)
- No rate limit retry (no rate limits locally)
- Keep error retry for genuine failures (connection errors, Ollama restart)
- Streaming via SSE for content generation
- Non-streaming for tool-call turns (Gemma 4 streaming bug workaround)
- JSON repair for malformed tool call responses

- [ ] **Step 1: Create the Ollama client**

Create `services/feasibility/src/ollama-client.ts`:

```typescript
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
 * Attempt to repair malformed JSON from tool call responses.
 * Gemma 4 occasionally produces truncated or malformed JSON in tool calls.
 */
function repairJSON(text: string): string {
  let cleaned = text.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // Try parsing as-is
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    // Try closing unclosed braces/brackets
    let braces = 0;
    let brackets = 0;
    let inString = false;
    let escape = false;
    for (const ch of cleaned) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') braces++;
      if (ch === '}') braces--;
      if (ch === '[') brackets++;
      if (ch === ']') brackets--;
    }
    while (brackets > 0) { cleaned += ']'; brackets--; }
    while (braces > 0) { cleaned += '}'; braces--; }

    try {
      JSON.parse(cleaned);
      return cleaned;
    } catch {
      return text; // Return original if repair fails
    }
  }
}

export async function streamMessage(params: {
  ollamaUrl: string;
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

  const baseUrl = ollamaUrl.replace(/\/$/, '');
  const url = `${baseUrl}/v1/chat/completions`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userMessage },
  ];

  // For tool-calling turns, use non-streaming to avoid Gemma 4 streaming bug
  if (useWebSearch) {
    return await nonStreamingToolCall(url, messages, model, maxTokens, onToken, onStatus, signal);
  }

  // Standard streaming for content generation
  return await streamingCall(url, messages, model, maxTokens, onToken, onStatus, signal);
}

async function streamingCall(
  url: string,
  messages: Array<{ role: string; content: string }>,
  model: string,
  maxTokens: number,
  onToken?: (text: string) => void,
  onStatus?: (status: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const body = {
    model,
    messages,
    max_tokens: maxTokens,
    stream: true,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt];
        onStatus?.(`Connection error. Retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay, signal);
        continue;
      }
      throw err;
    }

    if (!response.ok) {
      const errBody = await response.text();
      if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt];
        onStatus?.(`Ollama error ${response.status}. Retrying in ${delay / 1000}s...`);
        await sleep(delay, signal);
        continue;
      }
      throw new Error(`Ollama API error ${response.status}: ${errBody}`);
    }

    return await parseOpenAIStream(response, onToken, signal);
  }

  throw lastError ?? new Error('Max retries exceeded');
}

async function parseOpenAIStream(
  response: Response,
  onToken?: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  if (!response.body) throw new Error('Response body is null');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let text = '';
  let promptTokens = 0;
  let completionTokens = 0;
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
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        let event: any;
        try { event = JSON.parse(data); } catch { continue; }

        // OpenAI-compatible format
        const delta = event.choices?.[0]?.delta;
        if (delta?.content) {
          text += delta.content;
          onToken?.(delta.content);
        }

        // Usage in the final chunk
        if (event.usage) {
          promptTokens = event.usage.prompt_tokens ?? promptTokens;
          completionTokens = event.usage.completion_tokens ?? completionTokens;
        }
      }
    }
  } finally {
    try { reader.cancel(); } catch { /* ignore */ }
  }

  return { text, webSearchUsed: false, inputTokens: promptTokens, outputTokens: completionTokens };
}

async function nonStreamingToolCall(
  url: string,
  messages: Array<{ role: string; content: string }>,
  model: string,
  maxTokens: number,
  onToken?: (text: string) => void,
  onStatus?: (status: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  onStatus?.('Calling model with tool access (non-streaming)...');

  const body = {
    model,
    messages,
    max_tokens: maxTokens,
    stream: false,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAYS[attempt], signal);
        continue;
      }
      throw err;
    }

    if (!response.ok) {
      const errBody = await response.text();
      if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAYS[attempt], signal);
        continue;
      }
      throw new Error(`Ollama API error ${response.status}: ${errBody}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content ?? '';

    // Emit the full response as a single token event
    if (content) {
      onToken?.(content);
    }

    return {
      text: content,
      webSearchUsed: false,
      inputTokens: result.usage?.prompt_tokens ?? 0,
      outputTokens: result.usage?.completion_tokens ?? 0,
    };
  }

  throw lastError ?? new Error('Max retries exceeded');
}

export { repairJSON };
```

- [ ] **Step 2: Run the TypeScript compiler to check for errors**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/services/feasibility
npx tsc --noEmit src/ollama-client.ts 2>&1
```

Note: this may fail if `node_modules` isn't installed yet. If so, run `npm install` first.

- [ ] **Step 3: Commit**

```bash
git add services/feasibility/src/ollama-client.ts
git commit -m "feat: add Ollama LLM client for feasibility service

OpenAI-compatible streaming client targeting localhost:11434.
Non-streaming mode for tool-call turns (Gemma 4 workaround).
JSON repair for malformed tool responses. Retry on connection errors."
```

---

## Task 2: Create `context-manager.ts`

**Files:**
- Create: `services/feasibility/src/context-manager.ts`

This wraps context-mode's `ContentStore` class to provide stage output indexing and smart retrieval for the pipeline. Instead of importing from an installed package, we use a lightweight SQLite FTS5 implementation directly — avoiding the full context-mode dependency tree.

- [ ] **Step 1: Create the context manager**

Create `services/feasibility/src/context-manager.ts`:

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/**
 * ContextManager provides stage output indexing and retrieval for the
 * PatentForgeLocal pipeline. It uses SQLite FTS5 to index stage outputs
 * and retrieve relevant chunks for later stages, keeping prompt size
 * within Gemma 4's effective context window.
 *
 * This is a simplified, self-contained implementation inspired by
 * context-mode's ContentStore, without the full MCP dependency tree.
 */
export class ContextManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stage_outputs (
        stage_number INTEGER PRIMARY KEY,
        stage_name TEXT NOT NULL,
        output TEXT NOT NULL,
        indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS stage_chunks USING fts5(
        stage_number,
        chunk_index,
        content,
        tokenize='porter'
      );
    `);
  }

  /**
   * Index a stage's output. Splits into chunks of ~2000 chars at
   * paragraph boundaries for granular retrieval.
   */
  indexStageOutput(stageNumber: number, stageName: string, output: string): void {
    // Upsert the raw output
    this.db.prepare(`
      INSERT OR REPLACE INTO stage_outputs (stage_number, stage_name, output, indexed_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(stageNumber, stageName, output);

    // Delete old chunks for this stage
    this.db.prepare(`DELETE FROM stage_chunks WHERE stage_number = ?`).run(String(stageNumber));

    // Chunk the output
    const chunks = this.chunkText(output, 2000);
    const insert = this.db.prepare(`
      INSERT INTO stage_chunks (stage_number, chunk_index, content)
      VALUES (?, ?, ?)
    `);

    const insertAll = this.db.transaction((chunks: string[]) => {
      for (let i = 0; i < chunks.length; i++) {
        insert.run(String(stageNumber), String(i), chunks[i]);
      }
    });
    insertAll(chunks);
  }

  /**
   * Retrieve the full output of a specific stage.
   */
  getFullOutput(stageNumber: number): string | null {
    const row = this.db.prepare(
      `SELECT output FROM stage_outputs WHERE stage_number = ?`
    ).get(stageNumber) as { output: string } | undefined;
    return row?.output ?? null;
  }

  /**
   * Search indexed stage outputs for chunks relevant to a query.
   * Returns the top-K most relevant chunks with their stage numbers.
   */
  searchRelevant(queries: string[], limit: number = 5): Array<{ stageNumber: number; content: string; rank: number }> {
    const results: Array<{ stageNumber: number; content: string; rank: number }> = [];

    for (const query of queries) {
      // Escape FTS5 special characters
      const safeQuery = query.replace(/['"*()]/g, ' ').trim();
      if (!safeQuery) continue;

      try {
        const rows = this.db.prepare(`
          SELECT stage_number, content, rank
          FROM stage_chunks
          WHERE stage_chunks MATCH ?
          ORDER BY rank
          LIMIT ?
        `).all(safeQuery, limit) as Array<{ stage_number: string; content: string; rank: number }>;

        for (const row of rows) {
          results.push({
            stageNumber: parseInt(row.stage_number, 10),
            content: row.content,
            rank: row.rank,
          });
        }
      } catch {
        // FTS5 query syntax error — skip this query
      }
    }

    // Deduplicate by content, keep best rank
    const seen = new Map<string, typeof results[0]>();
    for (const r of results) {
      const key = `${r.stageNumber}:${r.content.slice(0, 100)}`;
      const existing = seen.get(key);
      if (!existing || r.rank < existing.rank) {
        seen.set(key, r);
      }
    }

    return Array.from(seen.values())
      .sort((a, b) => a.rank - b.rank)
      .slice(0, limit);
  }

  /**
   * Build compressed context for a stage by combining:
   * 1. Full output from the immediately previous stage (most relevant)
   * 2. Relevant chunks from earlier stages via FTS5 search
   *
   * This replaces the current approach of concatenating ALL prior outputs.
   */
  buildStageContext(
    currentStage: number,
    searchQueries: string[],
    maxChunks: number = 10,
  ): Map<number, string> {
    const context = new Map<number, string>();

    // Always include full output from the previous stage
    if (currentStage > 1) {
      const prevOutput = this.getFullOutput(currentStage - 1);
      if (prevOutput) {
        context.set(currentStage - 1, prevOutput);
      }
    }

    // For stages 1-3, context is small enough — include all prior outputs
    if (currentStage <= 3) {
      for (let s = 1; s < currentStage; s++) {
        if (!context.has(s)) {
          const output = this.getFullOutput(s);
          if (output) context.set(s, output);
        }
      }
      return context;
    }

    // For stages 4+, use search to get relevant chunks from earlier stages
    const relevantChunks = this.searchRelevant(searchQueries, maxChunks);

    // Group chunks by stage
    const chunksByStage = new Map<number, string[]>();
    for (const chunk of relevantChunks) {
      // Skip chunks from the previous stage (already included in full)
      if (chunk.stageNumber === currentStage - 1) continue;
      if (!chunksByStage.has(chunk.stageNumber)) {
        chunksByStage.set(chunk.stageNumber, []);
      }
      chunksByStage.get(chunk.stageNumber)!.push(chunk.content);
    }

    // Add compressed chunks to context
    for (const [stage, chunks] of chunksByStage) {
      if (!context.has(stage)) {
        context.set(stage, chunks.join('\n\n---\n\n'));
      }
    }

    return context;
  }

  /**
   * Clear all indexed data (e.g., for a new analysis run).
   */
  clear(): void {
    this.db.exec(`DELETE FROM stage_outputs`);
    this.db.exec(`DELETE FROM stage_chunks`);
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  /**
   * Split text into chunks at paragraph boundaries.
   */
  private chunkText(text: string, maxChunkSize: number): string[] {
    const paragraphs = text.split(/\n\n+/);
    const chunks: string[] = [];
    let current = '';

    for (const para of paragraphs) {
      if (current.length + para.length + 2 > maxChunkSize && current.length > 0) {
        chunks.push(current.trim());
        current = '';
      }
      current += (current ? '\n\n' : '') + para;
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    // If no chunks were created (single paragraph), return the whole text
    if (chunks.length === 0 && text.trim()) {
      chunks.push(text.trim());
    }

    return chunks;
  }
}
```

- [ ] **Step 2: Add `better-sqlite3` to package.json**

In `services/feasibility/package.json`, add to dependencies:
```json
"better-sqlite3": "^11.0.0"
```

And to devDependencies:
```json
"@types/better-sqlite3": "^7.6.0"
```

- [ ] **Step 3: Install dependencies**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/services/feasibility
npm install
```

- [ ] **Step 4: Commit**

```bash
git add services/feasibility/src/context-manager.ts services/feasibility/package.json services/feasibility/package-lock.json
git commit -m "feat: add context-manager for stage output compression

SQLite FTS5-based indexing of stage outputs. For stages 1-3, includes all
prior outputs (small enough). For stages 4+, uses search to retrieve only
relevant chunks from earlier stages. Previous stage always included in full."
```

---

## Task 3: Update `models.ts`

**Files:**
- Modify: `services/feasibility/src/models.ts`

Remove Anthropic pricing, replace `apiKey` with `ollamaUrl` in settings.

- [ ] **Step 1: Read the current file**

Read `services/feasibility/src/models.ts`.

- [ ] **Step 2: Apply changes**

Replace `AnalysisSettings` interface — remove `apiKey`, add `ollamaUrl`:
```typescript
export interface AnalysisSettings {
  model: string;
  researchModel?: string;
  maxTokens: number;
  interStageDelaySeconds: number;
  ollamaUrl: string;
  priorArtContext?: string;
}
```

Remove the `MODEL_PRICING` constant and the `estimateCost` function entirely. Replace with a simple token counter:
```typescript
/**
 * Token usage tracking (no dollar costs for local inference).
 */
export function formatTokenUsage(inputTokens: number, outputTokens: number): string {
  return `${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out`;
}
```

- [ ] **Step 3: Commit**

```bash
git add services/feasibility/src/models.ts
git commit -m "feat: update models.ts for Ollama — remove pricing, add ollamaUrl

AnalysisSettings now uses ollamaUrl instead of apiKey. Anthropic model
pricing removed (local inference has no per-token cost). Token usage
tracking retained for monitoring."
```

---

## Task 4: Update `pipeline-runner.ts`

**Files:**
- Modify: `services/feasibility/src/pipeline-runner.ts`

Switch from `anthropic-client` to `ollama-client` and integrate context-manager.

- [ ] **Step 1: Read the current file**

Read `services/feasibility/src/pipeline-runner.ts`.

- [ ] **Step 2: Update imports**

Replace:
```typescript
import { streamMessage } from './anthropic-client';
```
with:
```typescript
import { streamMessage } from './ollama-client';
```

Remove `estimateCost` from the models import:
```typescript
import {
  AnalysisSettings,
  StageResult,
  STAGE_DEFINITIONS,
  InventionInput,
  toNarrative,
} from './models';
```

Add context-manager import:
```typescript
import { ContextManager } from './context-manager';
import path from 'path';
```

- [ ] **Step 3: Update `buildUserMessage` to accept a context map from ContextManager**

The existing `buildUserMessage` function directly reads from `previousOutputs`. For stages 4+, we want it to use the context-manager's compressed output instead. The simplest change: keep the function signature the same — the caller (runPipeline) will pass either full outputs or compressed outputs via the same `previousOutputs` map.

No change needed to `buildUserMessage` itself — the compression happens before it's called.

- [ ] **Step 4: Add search queries per stage**

Add this constant after the imports:
```typescript
/**
 * Search queries used by context-manager to retrieve relevant chunks
 * from earlier stages when building compressed context for stages 4+.
 */
const STAGE_SEARCH_QUERIES: Record<number, string[]> = {
  4: [
    'novel features invention',
    'prior art patents found',
    'patentability assessment novelty',
    'technical claims scope',
  ],
  5: [
    'patentability conclusion',
    'claim strategy recommendations',
    'prior art gaps opportunities',
    'IP protection filing strategy',
  ],
  6: [
    'invention technical summary',
    'prior art key findings',
    'patentability analysis results',
    'deep dive conclusions',
    'IP strategy recommendations',
  ],
};
```

- [ ] **Step 5: Update `runStage` to use `ollamaUrl` instead of `apiKey`**

In the `runStage` function, change the `streamMessage` call:
```typescript
const streamPromise = streamMessage({
  ollamaUrl: settings.ollamaUrl,
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
```

- [ ] **Step 6: Remove `estimatedCostUsd` from stage result**

In `runStage`, remove the `estimateCost` call. Change the return:
```typescript
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
  estimatedCostUsd: 0,
} satisfies StageResult;
```

- [ ] **Step 7: Integrate context-manager into `runPipeline`**

In `runPipeline`, add context-manager initialization and usage. After the `previousOutputs` declaration, add:

```typescript
// Context manager for intelligent stage output compression
const dataDir = process.env.CONTEXT_DB_DIR || path.join(process.cwd(), 'data', 'context-db');
const contextMgr = new ContextManager(path.join(dataDir, 'pipeline.db'));

// Clear previous run data for a fresh analysis
if (startFromStage === 1) {
  contextMgr.clear();
}
```

After `previousOutputs.set(stageDef.number, stageResult.outputText);` (where stage output is stored), add indexing:

```typescript
// Index the stage output for smart retrieval by later stages
contextMgr.indexStageOutput(stageDef.number, stageDef.name, stageResult.outputText);
```

Before the `runStage` call, add context compression for stages 4+:

```typescript
// For stages 4+, use context-manager to build compressed context
let stageOutputs = previousOutputs;
const searchQueries = STAGE_SEARCH_QUERIES[stageDef.number];
if (searchQueries && stageDef.number >= 4) {
  const compressed = contextMgr.buildStageContext(stageDef.number, searchQueries);
  stageOutputs = new Map([...previousOutputs, ...compressed]);
}
```

And pass `stageOutputs` to `runStage` instead of `previousOutputs`.

At the end of `runPipeline` (after the for loop, before the final yield), add:
```typescript
contextMgr.close();
```

Also add `contextMgr.close()` in all early return paths (error, cancel).

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/services/feasibility
npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add services/feasibility/src/pipeline-runner.ts
git commit -m "feat: integrate Ollama client and context-manager into pipeline

Pipeline now calls Ollama instead of Anthropic. Stages 1-3 use full prior
outputs (small enough). Stages 4+ use FTS5 search to retrieve only relevant
chunks from earlier stages, keeping prompts within Gemma 4 context window."
```

---

## Task 5: Update `server.ts`

**Files:**
- Modify: `services/feasibility/src/server.ts`

- [ ] **Step 1: Read the current file**

Read `services/feasibility/src/server.ts`.

- [ ] **Step 2: Remove apiKey requirement, add ollamaUrl default**

In the `/analyze` route handler, remove the API key check:
```typescript
// DELETE this block:
// if (!settings?.apiKey) {
//   res.status(400).json({ error: 'settings.apiKey is required' });
//   return;
// }
```

Update `resolvedSettings` to use `ollamaUrl`:
```typescript
const resolvedSettings: AnalysisSettings = {
  model: settings.model,
  researchModel: settings.researchModel,
  maxTokens: settings.maxTokens || 16384,
  interStageDelaySeconds: settings.interStageDelaySeconds ?? 2,
  ollamaUrl: settings.ollamaUrl || process.env.OLLAMA_HOST
    ? `http://${process.env.OLLAMA_HOST}`
    : 'http://127.0.0.1:11434',
  priorArtContext: priorArtContext || undefined,
};
```

Note: reduced default `maxTokens` from 32000 to 16384 (Gemma 4 26B works better with smaller generation windows) and `interStageDelaySeconds` from 5 to 2 (no rate limits locally).

Update the health check service name:
```typescript
res.json({ status: 'ok', service: 'patentforgelocal-feasibility', promptHashes: getPromptHashes() });
```

- [ ] **Step 3: Commit**

```bash
git add services/feasibility/src/server.ts
git commit -m "feat: update feasibility server for Ollama — remove apiKey, add ollamaUrl

No API key required for local Ollama. Default maxTokens reduced to 16384
for Gemma 4. Inter-stage delay reduced to 2s (no rate limits locally).
Ollama URL defaults to OLLAMA_HOST env var or 127.0.0.1:11434."
```

---

## Task 6: Delete `anthropic-client.ts`

**Files:**
- Delete: `services/feasibility/src/anthropic-client.ts`

- [ ] **Step 1: Delete the file**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/services/feasibility
rm src/anthropic-client.ts
```

- [ ] **Step 2: Verify no remaining imports**

```bash
grep -r "anthropic-client" services/feasibility/src/ --include="*.ts"
grep -r "anthropic" services/feasibility/src/ --include="*.ts"
```

Expected: no results.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove anthropic-client.ts — replaced by ollama-client.ts"
```

---

## Task 7: Write tests

**Files:**
- Create: `services/feasibility/tests/ollama-client.test.ts`
- Create: `services/feasibility/tests/context-manager.test.ts`

- [ ] **Step 1: Create Ollama client tests**

Create `services/feasibility/tests/ollama-client.test.ts`:

```typescript
import http from 'http';
import { streamMessage, repairJSON } from '../src/ollama-client';

function createMockServer(handler: http.RequestListener): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => server.close(),
      });
    });
  });
}

describe('repairJSON', () => {
  test('passes valid JSON through unchanged', () => {
    expect(repairJSON('{"key": "value"}')).toBe('{"key": "value"}');
  });

  test('strips markdown code fences', () => {
    const result = repairJSON('```json\n{"key": "value"}\n```');
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  test('closes unclosed braces', () => {
    const result = repairJSON('{"key": "value"');
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  test('returns original if unfixable', () => {
    const broken = 'not json at all {{{';
    expect(repairJSON(broken)).toBeTruthy();
  });
});

describe('streamMessage', () => {
  test('streaming call returns text and token counts', async () => {
    const mock = await createMockServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
      res.write('data: {"choices":[{"delta":{"content":" World"}}]}\n\n');
      res.write('data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    });

    try {
      const tokens: string[] = [];
      const result = await streamMessage({
        ollamaUrl: mock.url,
        systemPrompt: 'You are helpful.',
        userMessage: 'Hi',
        model: 'gemma4:26b',
        maxTokens: 100,
        onToken: (t) => tokens.push(t),
      });

      expect(result.text).toBe('Hello World');
      expect(tokens).toEqual(['Hello', ' World']);
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(5);
      expect(result.webSearchUsed).toBe(false);
    } finally {
      mock.close();
    }
  });

  test('non-streaming call for tool use', async () => {
    const mock = await createMockServer((req, res) => {
      let body = '';
      req.on('data', (c) => body += c);
      req.on('end', () => {
        const parsed = JSON.parse(body);
        // Should be non-streaming when useWebSearch is true
        expect(parsed.stream).toBe(false);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{ message: { content: 'Search result analysis...' } }],
          usage: { prompt_tokens: 20, completion_tokens: 15 },
        }));
      });
    });

    try {
      const result = await streamMessage({
        ollamaUrl: mock.url,
        systemPrompt: 'Search and analyze.',
        userMessage: 'Find patents',
        model: 'gemma4:26b',
        maxTokens: 100,
        useWebSearch: true,
      });

      expect(result.text).toBe('Search result analysis...');
      expect(result.inputTokens).toBe(20);
      expect(result.outputTokens).toBe(15);
    } finally {
      mock.close();
    }
  });

  test('retries on server error', async () => {
    let attempts = 0;
    const mock = await createMockServer((req, res) => {
      attempts++;
      if (attempts < 2) {
        res.writeHead(500);
        res.end('Internal error');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    });

    try {
      const result = await streamMessage({
        ollamaUrl: mock.url,
        systemPrompt: 'test',
        userMessage: 'test',
        model: 'gemma4:26b',
        maxTokens: 100,
      });
      expect(result.text).toBe('OK');
      expect(attempts).toBe(2);
    } finally {
      mock.close();
    }
  }, 30000);

  test('throws on persistent failure', async () => {
    const mock = await createMockServer((req, res) => {
      res.writeHead(500);
      res.end('Always fails');
    });

    try {
      await expect(streamMessage({
        ollamaUrl: mock.url,
        systemPrompt: 'test',
        userMessage: 'test',
        model: 'gemma4:26b',
        maxTokens: 100,
      })).rejects.toThrow('Ollama API error 500');
    } finally {
      mock.close();
    }
  }, 60000);
});
```

- [ ] **Step 2: Create context manager tests**

Create `services/feasibility/tests/context-manager.test.ts`:

```typescript
import { ContextManager } from '../src/context-manager';
import path from 'path';
import os from 'os';
import fs from 'fs';

function createTempManager(): { mgr: ContextManager; cleanup: () => void } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const mgr = new ContextManager(dbPath);
  return {
    mgr,
    cleanup: () => {
      mgr.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

describe('ContextManager', () => {
  test('indexes and retrieves full stage output', () => {
    const { mgr, cleanup } = createTempManager();
    try {
      mgr.indexStageOutput(1, 'Technical Intake', 'The invention is a novel widget.');
      const output = mgr.getFullOutput(1);
      expect(output).toBe('The invention is a novel widget.');
    } finally {
      cleanup();
    }
  });

  test('returns null for missing stage', () => {
    const { mgr, cleanup } = createTempManager();
    try {
      expect(mgr.getFullOutput(99)).toBeNull();
    } finally {
      cleanup();
    }
  });

  test('overwrites stage output on re-index', () => {
    const { mgr, cleanup } = createTempManager();
    try {
      mgr.indexStageOutput(1, 'Stage 1', 'Version 1');
      mgr.indexStageOutput(1, 'Stage 1', 'Version 2');
      expect(mgr.getFullOutput(1)).toBe('Version 2');
    } finally {
      cleanup();
    }
  });

  test('searches across indexed stages', () => {
    const { mgr, cleanup } = createTempManager();
    try {
      mgr.indexStageOutput(1, 'Intake', 'The invention uses machine learning for image recognition.');
      mgr.indexStageOutput(2, 'Prior Art', 'US Patent 9,123,456 covers neural network image classification.');
      mgr.indexStageOutput(3, 'Analysis', 'The novelty lies in the specific training approach used.');

      const results = mgr.searchRelevant(['machine learning image'], 3);
      expect(results.length).toBeGreaterThan(0);
      // Should find content from stages that mention machine learning and image
      expect(results.some(r => r.content.includes('machine learning'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('buildStageContext includes full previous stage for stages 1-3', () => {
    const { mgr, cleanup } = createTempManager();
    try {
      mgr.indexStageOutput(1, 'Intake', 'Stage 1 full output here');
      mgr.indexStageOutput(2, 'Prior Art', 'Stage 2 full output here');

      const context = mgr.buildStageContext(3, ['test query']);
      // Should include both stage 1 and 2 in full
      expect(context.get(1)).toBe('Stage 1 full output here');
      expect(context.get(2)).toBe('Stage 2 full output here');
    } finally {
      cleanup();
    }
  });

  test('buildStageContext uses search for stages 4+', () => {
    const { mgr, cleanup } = createTempManager();
    try {
      mgr.indexStageOutput(1, 'Intake', 'Technical analysis of the widget invention.');
      mgr.indexStageOutput(2, 'Prior Art', 'Patent search found related prior art.');
      mgr.indexStageOutput(3, 'Analysis', 'The patentability analysis shows novelty in the approach.');

      const context = mgr.buildStageContext(4, ['patentability novelty']);
      // Should include stage 3 in full (previous stage)
      expect(context.has(3)).toBe(true);
      // Should have some content (either from search or stage 3)
      expect(context.size).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  test('clear removes all data', () => {
    const { mgr, cleanup } = createTempManager();
    try {
      mgr.indexStageOutput(1, 'Intake', 'Some content');
      mgr.clear();
      expect(mgr.getFullOutput(1)).toBeNull();
    } finally {
      cleanup();
    }
  });

  test('chunks long text at paragraph boundaries', () => {
    const { mgr, cleanup } = createTempManager();
    try {
      // Create text with multiple paragraphs
      const paragraphs = Array.from({ length: 20 }, (_, i) =>
        `Paragraph ${i + 1}: ${' '.padEnd(200, 'x')}`
      ).join('\n\n');

      mgr.indexStageOutput(1, 'Intake', paragraphs);

      // Should be able to search within chunks
      const results = mgr.searchRelevant(['Paragraph 15'], 1);
      expect(results.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });
});
```

- [ ] **Step 3: Add test script to package.json**

In `services/feasibility/package.json`, add to scripts:
```json
"test": "node --experimental-vm-modules node_modules/.bin/jest --config jest.config.js"
```

Create `services/feasibility/jest.config.js`:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
};
```

Add to devDependencies:
```json
"jest": "^29.0.0",
"ts-jest": "^29.0.0",
"@types/jest": "^29.0.0"
```

- [ ] **Step 4: Install and run tests**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/services/feasibility
npm install
npx jest --verbose
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/feasibility/tests/ services/feasibility/jest.config.js services/feasibility/package.json services/feasibility/package-lock.json
git commit -m "test: add tests for Ollama client and context manager

Ollama client: streaming, non-streaming tool calls, retry on error,
persistent failure. Context manager: index/retrieve, overwrite, FTS5
search, stage context building, clear, chunking."
```

---

## Task 8: Integration verification

- [ ] **Step 1: Verify TypeScript compiles**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/services/feasibility
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Verify no Anthropic references remain**

```bash
grep -r "anthropic\|Anthropic\|ANTHROPIC" services/feasibility/src/ --include="*.ts"
```

Expected: no results.

- [ ] **Step 3: Run full test suite**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/services/feasibility
npx jest --verbose
```

Expected: all tests pass.

- [ ] **Step 4: Verify Go tray app still builds**

```bash
wsl -d Ubuntu -u root -e bash -c "cd /mnt/c/Users/8745HX/Desktop/Claude/PatentForgeLocal/tray && go test ./... -count=1 2>&1"
```

Expected: all Go tests still pass.

- [ ] **Step 5: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during Phase 2 integration verification"
```

---

## Summary

| Task | What it does | Commits |
|------|-------------|---------|
| 1 | Create `ollama-client.ts` | 1 |
| 2 | Create `context-manager.ts` + add better-sqlite3 | 1 |
| 3 | Update `models.ts` — remove pricing, add ollamaUrl | 1 |
| 4 | Update `pipeline-runner.ts` — Ollama + context-manager | 1 |
| 5 | Update `server.ts` — remove apiKey requirement | 1 |
| 6 | Delete `anthropic-client.ts` | 1 |
| 7 | Write tests (Ollama client + context manager) | 1 |
| 8 | Integration verification | 0-1 |

**Total: 8 tasks, 7-8 commits**

**After Phase 2, the repo has:**
- Ollama-compatible LLM client (streaming + non-streaming for tool calls)
- Context-mode integration for intelligent stage output compression
- No Anthropic dependencies in the feasibility service
- Test coverage for client and context manager
- Full pipeline ready to run against local Gemma 4

**Next phase (Phase 3):** LLM client swap for Python services (claim-drafter, application-generator, compliance-checker) + web search integration.
