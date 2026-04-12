"""
PatentForge Claim Drafter — FastAPI server.

Endpoints:
  GET  /health          — Service health check with prompt hashes
  POST /draft           — Run the claim drafting pipeline (SSE stream)
"""

from __future__ import annotations
import asyncio
import json
import hashlib
import os
from pathlib import Path

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from sse_starlette.sse import EventSourceResponse

from .models import ClaimDraftRequest, ClaimDraftResult
from .graph import run_claim_pipeline, stream_claim_pipeline

app = FastAPI(title="PatentForge Claim Drafter", version="0.5.0")

# Internal service auth — only the NestJS backend should call this service.
# Set INTERNAL_SERVICE_SECRET env var to enable. When not set, auth is disabled (dev mode).
INTERNAL_SECRET = os.environ.get("INTERNAL_SERVICE_SECRET", "")

# API key: prefer environment variable over request body.
# This prevents the key from flowing through HTTP request bodies.
ANTHROPIC_API_KEY_ENV = os.environ.get("ANTHROPIC_API_KEY", "")


def resolve_api_key(request_key: str) -> str:
    """Use env var if set, otherwise fall back to request body value."""
    return ANTHROPIC_API_KEY_ENV or request_key

api_key_header = APIKeyHeader(name="X-Internal-Secret", auto_error=False)


async def verify_internal_secret(key: str | None = Depends(api_key_header)):
    """Reject requests without valid internal secret (when secret is configured)."""
    if not INTERNAL_SECRET:
        return  # Auth disabled in dev mode
    if key != INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Invalid or missing internal service secret")


_allowed_origins = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ── Prompt integrity hashes ───────────────────────────────────────────────────

PROMPTS_DIR = Path(__file__).parent / "prompts"


def _compute_prompt_hashes() -> dict[str, str]:
    hashes = {}
    if PROMPTS_DIR.exists():
        for f in sorted(PROMPTS_DIR.glob("*.md")):
            content = f.read_text(encoding="utf-8")
            h = hashlib.sha256(content.encode()).hexdigest()[:16]
            hashes[f.name] = h
    return hashes


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "patentforge-claim-drafter",
        "promptHashes": _compute_prompt_hashes(),
    }


# ── Claim drafting endpoint ──────────────────────────────────────────────────

@app.post("/draft", dependencies=[Depends(verify_internal_secret)])
async def draft_claims(request: ClaimDraftRequest):
    """
    Run the claim drafting pipeline. Returns SSE stream with progress events.
    Final event contains the complete ClaimDraftResult.
    """
    # Build prior art context string
    prior_art_parts = []
    for pa in request.prior_art_results:
        part = f"**{pa.patent_number}** — {pa.title}"
        if pa.abstract:
            part += f"\nAbstract: {pa.abstract[:400]}"
        if pa.claims_text:
            part += f"\nClaims:\n{pa.claims_text[:2000]}"
        prior_art_parts.append(part)
    prior_art_context = "\n\n".join(prior_art_parts) if prior_art_parts else "(No prior art results available)"
    # Cap total context size to prevent oversized prompts
    if len(prior_art_context) > 50_000:
        prior_art_context = prior_art_context[:50_000] + "\n\n(truncated — prior art context exceeds 50K characters)"

    # Keepalive interval in seconds — emit SSE comment to prevent proxy/browser
    # timeouts during long first-token waits (matches feasibility service pattern).
    KEEPALIVE_INTERVAL_S = 20

    async def event_stream():
        import time
        last_event_time = time.monotonic()

        try:
            pipeline = stream_claim_pipeline(
                invention_narrative=request.invention_narrative,
                feasibility_stage_5=request.feasibility_stage_5,
                feasibility_stage_6=request.feasibility_stage_6,
                prior_art_context=prior_art_context,
                api_key=resolve_api_key(request.settings.api_key),
                default_model=request.settings.default_model,
                research_model=request.settings.research_model,
                max_tokens=request.settings.max_tokens,
            )

            # We use asyncio.wait_for with a timeout to interleave keepalives
            # between long-running pipeline nodes.
            aiter = pipeline.__aiter__()
            while True:
                try:
                    remaining = KEEPALIVE_INTERVAL_S - (time.monotonic() - last_event_time)
                    if remaining <= 0:
                        remaining = KEEPALIVE_INTERVAL_S

                    event = await asyncio.wait_for(aiter.__anext__(), timeout=remaining)
                except asyncio.TimeoutError:
                    # No event within keepalive interval — send keepalive comment
                    yield {"comment": "keepalive"}
                    last_event_time = time.monotonic()
                    continue
                except StopAsyncIteration:
                    break

                last_event_time = time.monotonic()

                if event["event"] == "step":
                    yield {
                        "event": "step",
                        "data": json.dumps({
                            "step": event["node"],
                            "status": "complete",
                            "detail": event["detail"],
                        }),
                    }
                elif event["event"] == "complete":
                    result = event["result"]
                    yield {
                        "event": "complete",
                        "data": result.model_dump_json(),
                    }
                elif event["event"] == "error":
                    yield {
                        "event": "error",
                        "data": json.dumps({"message": event["message"]}),
                    }
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps({"message": str(e)}),
            }

    return EventSourceResponse(event_stream())


# ── Synchronous draft endpoint (for simpler integration) ─────────────────────

@app.post("/draft/sync", response_model=ClaimDraftResult, dependencies=[Depends(verify_internal_secret)])
async def draft_claims_sync(request: ClaimDraftRequest):
    """
    Run the claim drafting pipeline synchronously. Returns the complete result.
    Use /draft for SSE streaming in production.
    """
    prior_art_parts = []
    for pa in request.prior_art_results:
        part = f"**{pa.patent_number}** — {pa.title}"
        if pa.abstract:
            part += f"\nAbstract: {pa.abstract[:400]}"
        if pa.claims_text:
            part += f"\nClaims:\n{pa.claims_text[:2000]}"
        prior_art_parts.append(part)
    prior_art_context = "\n\n".join(prior_art_parts) if prior_art_parts else "(No prior art results available)"
    # Cap total context size to prevent oversized prompts
    if len(prior_art_context) > 50_000:
        prior_art_context = prior_art_context[:50_000] + "\n\n(truncated — prior art context exceeds 50K characters)"

    return await run_claim_pipeline(
        invention_narrative=request.invention_narrative,
        feasibility_stage_5=request.feasibility_stage_5,
        feasibility_stage_6=request.feasibility_stage_6,
        prior_art_context=prior_art_context,
        api_key=resolve_api_key(request.settings.api_key),
        default_model=request.settings.default_model,
        research_model=request.settings.research_model,
        max_tokens=request.settings.max_tokens,
    )


if __name__ == "__main__":
    import uvicorn
    # Bind to localhost only in local mode. Docker overrides via Dockerfile CMD.
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "3002"))
    uvicorn.run(app, host=host, port=port)
