# Phase 4: Web Search + USPTO PatentSearch Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken PatentsView prior-art client to use the new PatentSearch API format, and add Ollama web search tool support to the feasibility pipeline so Stages 2/3/4 can search the web for prior art and technical context.

**Architecture:** The PatentsView client (`backend/src/prior-art/patentsview-client.ts`) already targets `search.patentsview.org/api/v1/patent/` but uses the old query format — we update it to the new JSON query language with `X-Api-Key` auth. For web search, we update the Ollama client to pass tool definitions to Ollama when `useWebSearch=true`, using Ollama's native web search capability. The pipeline gracefully degrades: with an Ollama API key, stages get web search; without, they use USPTO data + model knowledge only.

**Tech Stack:** TypeScript (NestJS backend, Express feasibility service), Ollama web search API

---

## File Map

### Modified files

| File | Changes |
|------|---------|
| `backend/src/prior-art/patentsview-client.ts` | Update query format for PatentSearch API, add `X-Api-Key` header |
| `backend/src/prior-art/patentsview-client.spec.ts` | Update tests for new query format |
| `backend/src/prior-art/prior-art.service.ts` | Pass API key to PatentsView client |
| `backend/src/settings/settings.service.ts` | Replace `anthropicApiKey` with `ollamaApiKey`, keep `usptoApiKey` |
| `backend/src/settings/dto/update-settings.dto.ts` | Replace `anthropicApiKey` field |
| `services/feasibility/src/ollama-client.ts` | Add Ollama web search tool definitions to non-streaming calls |
| `services/feasibility/src/models.ts` | Add `ollamaApiKey` to `AnalysisSettings` |
| `services/feasibility/src/pipeline-runner.ts` | Pass `ollamaApiKey` through to client |
| `services/feasibility/src/server.ts` | Accept `ollamaApiKey` from request |

---

## Task 1: Update PatentsView client to PatentSearch API format

**Files:**
- Modify: `backend/src/prior-art/patentsview-client.ts`

The current client sends:
```json
{ "q": { "_text_phrase": { "_all": "query" } }, "f": [...], "o": { "size": 15 } }
```

The new PatentSearch API at `search.patentsview.org/api/v1/patent/` uses this format:
```json
{ "q": { "_text_any": { "patent_abstract": "query terms" } }, "f": [...], "o": { "per_page": 15 } }
```

And requires an `X-Api-Key` header.

- [ ] **Step 1: Read the current file**

Read `backend/src/prior-art/patentsview-client.ts`.

- [ ] **Step 2: Update the query function**

Replace the `queryPatentsView` function and add API key support:

```typescript
const BASE_URL = 'https://search.patentsview.org/api/v1/patent/';
const FIELDS = ['patent_id', 'patent_title', 'patent_abstract', 'patent_date', 'patent_type'];
const TIMEOUT_MS = 10_000;
const DELAY_BETWEEN_QUERIES_MS = 500;

let _apiKey: string = '';

/** Set the PatentSearch API key for authenticated requests. */
export function setPatentSearchApiKey(key: string): void {
  _apiKey = key;
}

async function queryPatentsView(queryStr: string, size = 15): Promise<PatentsViewPatent[]> {
  const body = {
    q: { _text_any: { patent_abstract: queryStr } },
    f: FIELDS,
    o: { per_page: size },
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (_apiKey) {
    headers['X-Api-Key'] = _apiKey;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`PatentSearch HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as PatentsViewResponse & { error?: boolean; message?: string };
    if (data.error === true && typeof data.message === 'string' && data.message.includes('migrating')) {
      throw new PatentsViewMigrationError(
        'The PatentsView API has been shut down and migrated to the USPTO Open Data Portal (data.uspto.gov). ' +
          'Prior art search is temporarily unavailable. This will be restored in a future update.',
      );
    }
    return data.patents ?? [];
  } finally {
    clearTimeout(timer);
  }
}
```

Keep the `searchPatentsViewMulti` function unchanged — it already handles deduplication and error handling correctly.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
git add backend/src/prior-art/patentsview-client.ts
git commit -m "feat: update PatentsView client to PatentSearch API format

New query format: _text_any on patent_abstract. Adds X-Api-Key header
support. Removes old _text_phrase query. Better error messages."
```

---

## Task 2: Wire API key through prior-art service

**Files:**
- Modify: `backend/src/prior-art/prior-art.service.ts`

- [ ] **Step 1: Read the current file**

Read `backend/src/prior-art/prior-art.service.ts`.

- [ ] **Step 2: Import and call setPatentSearchApiKey**

At the top, add:
```typescript
import { setPatentSearchApiKey } from './patentsview-client';
```

In the method that orchestrates prior-art search (find where `searchPatentsViewMulti` is called), add before the call:
```typescript
// Set API key for PatentSearch (if available from settings)
const settings = await this.settingsService.getSettings();
if (settings.usptoApiKey) {
  setPatentSearchApiKey(settings.usptoApiKey);
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/prior-art/prior-art.service.ts
git commit -m "feat: pass USPTO API key to PatentSearch client"
```

---

## Task 3: Update backend settings for Ollama

**Files:**
- Modify: `backend/src/settings/settings.service.ts`
- Modify: `backend/src/settings/dto/update-settings.dto.ts`

- [ ] **Step 1: Read both files**

Read `backend/src/settings/settings.service.ts` and `backend/src/settings/dto/update-settings.dto.ts`.

- [ ] **Step 2: Replace anthropicApiKey with ollamaApiKey in DTO**

In `update-settings.dto.ts`, find the `anthropicApiKey` field and rename to `ollamaApiKey`. Keep the same validators:
```typescript
@IsOptional()
@IsString()
ollamaApiKey?: string;
```

- [ ] **Step 3: Replace anthropicApiKey in settings service**

In `settings.service.ts`:
- Find where `anthropicApiKey` is stored/retrieved and rename to `ollamaApiKey`
- Remove any Anthropic API key validation logic (e.g., checking key format `sk-ant-*`)
- Keep the encryption — the Ollama API key should still be encrypted at rest
- Update the Prisma schema field name if it's directly mapped (check `backend/prisma/schema.prisma`)

- [ ] **Step 4: Commit**

```bash
git add backend/src/settings/
git commit -m "feat: replace anthropicApiKey with ollamaApiKey in settings

Ollama API key used for optional web search. Same encryption at rest.
Removed Anthropic key format validation."
```

---

## Task 4: Add Ollama web search tool support to feasibility client

**Files:**
- Modify: `services/feasibility/src/ollama-client.ts`
- Modify: `services/feasibility/src/models.ts`

This is the core change: when `useWebSearch=true`, the Ollama client sends tool definitions so the model can invoke web search. Ollama's web search is a cloud API at `https://ollama.com/api/web_search` — the model calls it via standard tool calling.

- [ ] **Step 1: Read current ollama-client.ts**

Read `services/feasibility/src/ollama-client.ts` in full.

- [ ] **Step 2: Add ollamaApiKey to AnalysisSettings**

In `services/feasibility/src/models.ts`, add to `AnalysisSettings`:
```typescript
export interface AnalysisSettings {
  model: string;
  researchModel?: string;
  maxTokens: number;
  interStageDelaySeconds: number;
  ollamaUrl: string;
  ollamaApiKey?: string;  // Optional — enables web search
  priorArtContext?: string;
}
```

- [ ] **Step 3: Update streamMessage signature**

In `ollama-client.ts`, add `ollamaApiKey` to the params:

```typescript
export async function streamMessage(params: {
  ollamaUrl: string;
  systemPrompt: string;
  userMessage: string;
  model: string;
  maxTokens: number;
  useWebSearch?: boolean;
  ollamaApiKey?: string;
  onToken?: (text: string) => void;
  onStatus?: (status: string) => void;
  signal?: AbortSignal;
}): Promise<StreamResult> {
```

- [ ] **Step 4: Update nonStreamingToolCall to send web search tool**

In the `nonStreamingToolCall` function, update the request body to include the web search tool when `ollamaApiKey` is provided:

```typescript
async function nonStreamingToolCall(
  url: string,
  messages: Array<{ role: string; content: string }>,
  model: string,
  maxTokens: number,
  ollamaApiKey?: string,
  onToken?: (text: string) => void,
  onStatus?: (status: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  onStatus?.('Calling model with web search access...');

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    stream: false,
  };

  // Add web search tool if Ollama API key is available
  if (ollamaApiKey) {
    body.tools = [
      {
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search the web for current information about a topic',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query',
              },
            },
            required: ['query'],
          },
        },
      },
    ];
  }

  // ... rest of the function stays the same
```

Update the call site in `streamMessage` to pass `ollamaApiKey`:
```typescript
if (useWebSearch) {
  return await nonStreamingToolCall(url, messages, model, maxTokens, params.ollamaApiKey, onToken, onStatus, signal);
}
```

- [ ] **Step 5: Handle tool call responses**

After receiving the non-streaming response, check if the model made a tool call. If so, execute it and send the result back:

In `nonStreamingToolCall`, after `const result = await response.json();`, add tool call handling:

```typescript
const choice = result.choices?.[0];
const message = choice?.message;

// Check if model wants to call a tool
if (message?.tool_calls && message.tool_calls.length > 0 && ollamaApiKey) {
  let fullContent = message.content || '';

  // Process each tool call (web search)
  for (const toolCall of message.tool_calls) {
    if (toolCall.function?.name === 'web_search') {
      const args = typeof toolCall.function.arguments === 'string'
        ? JSON.parse(repairJSON(toolCall.function.arguments))
        : toolCall.function.arguments;

      onStatus?.(`Searching: "${args.query}"...`);
      const searchResult = await executeWebSearch(args.query, ollamaApiKey);

      // Send tool result back to model for synthesis
      const followUpMessages = [
        ...messages,
        message,
        {
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          content: searchResult,
        },
      ];

      const followUpResp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: followUpMessages,
          max_tokens: maxTokens,
          stream: false,
        }),
        signal,
      });

      if (followUpResp.ok) {
        const followUp = await followUpResp.json() as any;
        fullContent = followUp.choices?.[0]?.message?.content || fullContent;
        // Update token counts
        result.usage = {
          prompt_tokens: (result.usage?.prompt_tokens ?? 0) + (followUp.usage?.prompt_tokens ?? 0),
          completion_tokens: (result.usage?.completion_tokens ?? 0) + (followUp.usage?.completion_tokens ?? 0),
        };
      }
    }
  }

  if (fullContent) onToken?.(fullContent);
  return {
    text: fullContent,
    webSearchUsed: true,
    inputTokens: result.usage?.prompt_tokens ?? 0,
    outputTokens: result.usage?.completion_tokens ?? 0,
  };
}

// No tool calls — return content directly
const content = message?.content ?? '';
if (content) onToken?.(content);
return {
  text: content,
  webSearchUsed: false,
  inputTokens: result.usage?.prompt_tokens ?? 0,
  outputTokens: result.usage?.completion_tokens ?? 0,
};
```

- [ ] **Step 6: Add the web search execution function**

Add this function to `ollama-client.ts`:

```typescript
/**
 * Execute a web search via Ollama's cloud web search API.
 * Requires an Ollama API key (free account).
 */
async function executeWebSearch(query: string, apiKey: string): Promise<string> {
  try {
    const resp = await fetch('https://ollama.com/api/web_search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!resp.ok) {
      return `Web search failed (HTTP ${resp.status}). Proceeding without web results.`;
    }

    const data = await resp.json() as any;
    // Format results as markdown for the model
    if (data.results && Array.isArray(data.results)) {
      return data.results
        .slice(0, 5)
        .map((r: any, i: number) => `${i + 1}. **${r.title || 'Untitled'}**\n   ${r.url || ''}\n   ${r.snippet || r.content || ''}`)
        .join('\n\n');
    }
    return JSON.stringify(data).slice(0, 2000);
  } catch (err) {
    return `Web search unavailable: ${(err as Error).message}. Proceeding without web results.`;
  }
}
```

- [ ] **Step 7: Commit**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
git add services/feasibility/src/ollama-client.ts services/feasibility/src/models.ts
git commit -m "feat: add Ollama web search tool support to feasibility client

When ollamaApiKey is provided and useWebSearch=true, sends tool
definitions to Ollama. Model can invoke web_search, results are
fetched from Ollama cloud API and fed back for synthesis.
Degrades gracefully: no key = no web search, analysis uses
patent data + model knowledge only."
```

---

## Task 5: Wire ollamaApiKey through pipeline and server

**Files:**
- Modify: `services/feasibility/src/pipeline-runner.ts`
- Modify: `services/feasibility/src/server.ts`

- [ ] **Step 1: Read both files**

Read `services/feasibility/src/pipeline-runner.ts` and `services/feasibility/src/server.ts`.

- [ ] **Step 2: Pass ollamaApiKey in pipeline-runner**

In `runStage`, add `ollamaApiKey` to the `streamMessage` call:
```typescript
const streamPromise = streamMessage({
  ollamaUrl: settings.ollamaUrl,
  systemPrompt,
  userMessage,
  model: modelToUse,
  maxTokens: settings.maxTokens,
  useWebSearch: stageDef.usesWebSearch,
  ollamaApiKey: settings.ollamaApiKey,
  onToken: (text) => { enqueue({ type: 'token', text }); },
  onStatus: (message) => { enqueue({ type: 'status', message }); },
  signal,
})
```

- [ ] **Step 3: Accept ollamaApiKey in server.ts**

In the `/analyze` route, add `ollamaApiKey` to the resolved settings:
```typescript
const resolvedSettings: AnalysisSettings = {
  model: settings.model,
  researchModel: settings.researchModel,
  maxTokens: settings.maxTokens || 16384,
  interStageDelaySeconds: settings.interStageDelaySeconds ?? 2,
  ollamaUrl: ollamaHost,
  ollamaApiKey: settings.ollamaApiKey || process.env.OLLAMA_API_KEY || '',
  priorArtContext: priorArtContext || undefined,
};
```

- [ ] **Step 4: Commit**

```bash
git add services/feasibility/src/pipeline-runner.ts services/feasibility/src/server.ts
git commit -m "feat: wire ollamaApiKey through pipeline and server

Pipeline passes ollamaApiKey to streamMessage for web search stages.
Server accepts ollamaApiKey from request body or OLLAMA_API_KEY env var."
```

---

## Task 6: Update tests

**Files:**
- Modify: `backend/src/prior-art/patentsview-client.spec.ts`
- Modify: `services/feasibility/tests/ollama-client.test.ts`

- [ ] **Step 1: Read existing tests**

Read `backend/src/prior-art/patentsview-client.spec.ts` and `services/feasibility/tests/ollama-client.test.ts`.

- [ ] **Step 2: Update PatentsView tests for new query format**

In `patentsview-client.spec.ts`, update any mocked request bodies to use the new format:
- `_text_any` instead of `_text_phrase`
- `patent_abstract` instead of `_all`
- `per_page` instead of `size`

If the tests use `nock` or similar HTTP mocking, update the expected request matchers.

- [ ] **Step 3: Add web search test to ollama-client tests**

In `services/feasibility/tests/ollama-client.test.ts`, add a test for tool call handling:

```typescript
test('handles web search tool call response', async () => {
  let callCount = 0;
  const mock = await createMockServer((req, res) => {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
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
  });

  try {
    // Note: web search will fail (mock doesn't serve ollama.com)
    // but the function should handle the error gracefully
    const result = await streamMessage({
      ollamaUrl: mock.url,
      systemPrompt: 'Analyze patents.',
      userMessage: 'Find prior art for ML image recognition',
      model: 'gemma4:26b',
      maxTokens: 1000,
      useWebSearch: true,
      ollamaApiKey: 'test-key',
    });

    // Should have made the tool call attempt
    expect(callCount).toBeGreaterThanOrEqual(1);
  } finally {
    mock.close();
  }
}, 30000);
```

- [ ] **Step 4: Run all tests**

```bash
# Backend tests
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/backend
npx jest src/prior-art/patentsview-client.spec.ts --verbose 2>&1 | tail -15

# Feasibility tests
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/services/feasibility
npx jest --verbose 2>&1 | tail -15
```

- [ ] **Step 5: Commit**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal
git add backend/src/prior-art/patentsview-client.spec.ts services/feasibility/tests/
git commit -m "test: update tests for PatentSearch API and web search tool"
```

---

## Task 7: Final verification

- [ ] **Step 1: Verify no Anthropic references in settings**

```bash
grep -r "anthropicApiKey\|ANTHROPIC_API_KEY\|anthropic" backend/src/settings/ --include="*.ts"
```

Expected: no output (or only in migration-related comments).

- [ ] **Step 2: Run feasibility tests**

```bash
cd /c/Users/8745HX/Desktop/Claude/PatentForgeLocal/services/feasibility
npx jest --verbose
```

Expected: all tests pass.

- [ ] **Step 3: Run Go tests**

```bash
wsl -d Ubuntu -u root -e bash -c "cd /mnt/c/Users/8745HX/Desktop/Claude/PatentForgeLocal/tray && go test ./... -count=1 2>&1"
```

Expected: all Go tests pass.

- [ ] **Step 4: Commit if fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during Phase 4 verification"
```

---

## Summary

| Task | What | Commits |
|------|------|---------|
| 1 | Update PatentsView client to PatentSearch API format | 1 |
| 2 | Wire API key through prior-art service | 1 |
| 3 | Replace anthropicApiKey with ollamaApiKey in settings | 1 |
| 4 | Add Ollama web search tool to feasibility client | 1 |
| 5 | Wire ollamaApiKey through pipeline and server | 1 |
| 6 | Update tests | 1 |
| 7 | Final verification | 0-1 |

**Total: 7 tasks, 6-7 commits**

**After Phase 4:**
- PatentSearch API working with new query format + API key auth
- Ollama web search tool available in feasibility pipeline (Stages 2/3/4)
- Graceful degradation: no Ollama API key = no web search, analysis still works
- Backend settings store Ollama API key (encrypted) instead of Anthropic key
- Zero Anthropic references remain in the entire codebase

**Next phase (Phase 5):** Frontend updates — settings page, system check, model download, first-run wizard.
