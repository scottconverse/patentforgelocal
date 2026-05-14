# Phase 1 State — claim-drafter (PatentForgeLocal v0.4)

Status as of 2026-05-14. This document exists so the next operator does not
re-request a "Phase 1 skeleton scaffold" task on a service that is already past
Phase 1.

## Phase 1 contract (per v0.4-SCOPE.md L195-201)

The Phase 1 acceptance contract is:

1. FastAPI server on port 3002 with health check
2. LangGraph state machine with placeholder agents
3. Pydantic models for request/response
4. Docker Compose integration
5. Basic test suite with mocked agents

All five items are satisfied in this fork. Specifically:

| Phase 1 item | Where it lives | Notes |
|---|---|---|
| FastAPI server on port 3002 | `src/server.py` | PORT from env (default 3002); Dockerfile binds 3002 |
| Health check | `src/server.py` — `GET /health` and `GET /healthz` (alias) | `/healthz` added 2026-05-14 to match Kubernetes-style probes; `/health` is the original path used by docker-compose healthcheck |
| LangGraph state machine | `src/graph.py` | Real implementation, past the "placeholder" Phase 1 bar |
| Three agent nodes | `src/agents/{planner,writer,examiner}.py` | Real Ollama-backed implementations, past placeholder |
| Pydantic models | `src/models.py` | `ClaimDraftRequest`, `ClaimDraftResult`, `Claim`, plus `PriorArt`, `DraftSettings`, `GraphState` |
| prompts/ | `src/prompts/{planner,writer,examiner,common-rules}.md` | CC BY-SA 4.0 prompt files authored |
| parser.py | `src/parser.py` | Claim-text parser covered by 22 passing tests |
| Dockerfile | `services/claim-drafter/Dockerfile` | python:3.12-slim, EXPOSE 3002 |
| docker-compose entry | `docker-compose.yml` → `claim-drafter` | Healthcheck currently hits `/health`; `/healthz` alias also available |
| Test suite | `tests/` | 87 collected; 82 in non-Ollama scope pass; 4 in `test_auth.py` hang on missing Ollama (see below) |

## Beyond Phase 1

This service already contains substantial Phase 2-4 work inherited from the upstream PatentForge fork and migrated to Ollama in commits `7a90aba` / `c291adb` / `d5bd05b` / `67aba0d` / `e29c3ac` / `836c8ee` / `5749c24`. The server version string is `0.5.0`. The service includes:

- SSE streaming endpoint (`/draft` returns event-stream with keepalive)
- Synchronous endpoint (`/draft/sync`) for simple integration
- Internal-service auth via `X-Internal-Secret` header (env-gated; dev mode disables when secret unset)
- Prompt-hash integrity surface in `/health` body
- Cost tracking, retry logic with exponential backoff
- 87-test suite covering models, parser, retry, cost, graph, three agents, SSE streaming, auth

## Known pre-existing issue — test_auth.py hang

Four tests in `tests/test_auth.py` POST to `/draft/sync`, which executes the full LangGraph pipeline against an Ollama URL provided in the request body. When Ollama is not running on the host, the retry path does not short-circuit connection-refused fast enough on Windows, and the tests hang for several minutes per case. Running `pytest -q` from a clean clone without Ollama therefore appears to hang.

**Workaround for CI / local-dev without Ollama:** `pytest -q --ignore=tests/test_auth.py` produces 82 passes in ~1.5s.

**Proper fix (out of scope for this Phase 1 work):**
- mock the OpenAI/httpx client at module boundary in test_auth.py so it never touches the network, or
- use `httpx.MockTransport` / `respx` to inject a fast connection-refused response, or
- set a short connect timeout (e.g. 250ms) in the retry helper specifically when `OLLAMA_HOST` points to localhost during pytest runs.

Filing this here so the Phase 5 (backend adapter) or test-infra-hardening cycle can address it without re-discovering the cause.

## Phase 1 sign-off

- Acceptance criteria from the v0.4 scope: **all five met**.
- Verification at `2026-05-14T20:55Z`: `pytest -q --ignore=tests/test_auth.py` → 86 passed in 1.88s (82 pre-existing + 4 new in `test_health.py`).
- No greenfield rewrite was performed; the existing implementation was preserved.

The next live phase to work is **Phase 5** (backend adapter) per `v0.4-SCOPE.md` L223-228. Phase 2, 3, 4 are already implemented in the fork at commit history above.
