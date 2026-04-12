"""
PatentForge Application Generator — FastAPI server.

Endpoints:
  GET  /health           — Health check with prompt hashes
  POST /generate         — Run application generation (SSE stream)
  POST /generate/sync    — Run application generation (blocking)
  POST /export/docx      — Export to Word
  POST /export/markdown  — Export to Markdown
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
from fastapi.responses import Response
from sse_starlette.sse import EventSourceResponse

from .models import ApplicationGenerateRequest, ApplicationGenerateResult, ExportRequest

app = FastAPI(title="PatentForge Application Generator", version="0.6.0")

INTERNAL_SECRET = os.environ.get("INTERNAL_SERVICE_SECRET", "")
ANTHROPIC_API_KEY_ENV = os.environ.get("ANTHROPIC_API_KEY", "")


def resolve_api_key(request_key: str) -> str:
    # Prefer the explicitly-configured key from Settings (passed in the request body).
    # Fall back to the ANTHROPIC_API_KEY environment variable only when no key was provided
    # in the request. This prevents a stale or incorrect env var from silently overriding
    # the key the user configured through the UI.
    return request_key or ANTHROPIC_API_KEY_ENV


api_key_header = APIKeyHeader(name="X-Internal-Secret", auto_error=False)


async def verify_internal_secret(key: str | None = Depends(api_key_header)):
    if not INTERNAL_SECRET:
        return
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
        "service": "patentforge-application-generator",
        "version": "0.6.0",
        "promptHashes": _compute_prompt_hashes(),
    }


def _build_prior_art_context(request: ApplicationGenerateRequest) -> str:
    parts = []
    for pa in request.prior_art_results:
        part = f"**{pa.patent_number}** — {pa.title}"
        if pa.abstract:
            part += f"\nAbstract: {pa.abstract[:400]}"
        if pa.claims_text:
            part += f"\nClaims:\n{pa.claims_text[:2000]}"
        parts.append(part)
    ctx = "\n\n".join(parts) if parts else "(No prior art results available)"
    if len(ctx) > 50_000:
        ctx = ctx[:50_000] + "\n\n(truncated)"
    return ctx


_STEP_DETAILS: dict[str, str] = {
    "background": "Background section generated",
    "summary": "Summary section generated",
    "detailed_description": "Detailed description generated",
    "abstract": "Abstract generated",
    "figures": "Figure descriptions generated",
    "format_ids": "IDS table formatted",
    "finalize": "Output finalized",
}

KEEPALIVE_INTERVAL_SECONDS = 20


@app.post("/generate", dependencies=[Depends(verify_internal_secret)])
async def generate_application(request: ApplicationGenerateRequest):
    # Import here to avoid circular import at module load (graph.py imports models which is fine,
    # but graph.py also imports agents which import prompts — all must exist)
    from .graph import run_application_pipeline

    prior_art_context = _build_prior_art_context(request)

    # Queue bridges the sync on_step callback to the async event_stream generator.
    # Each item is either a dict (SSE event) or None (sentinel signaling completion).
    queue: asyncio.Queue = asyncio.Queue()

    def on_step(node_name: str, step: str):
        detail = _STEP_DETAILS.get(node_name, f"{node_name} completed")
        queue.put_nowait({
            "event": "step",
            "data": json.dumps({"step": node_name, "status": "complete", "detail": detail}),
        })

    async def run_pipeline():
        try:
            result = await run_application_pipeline(
                invention_narrative=request.invention_narrative,
                feasibility_stage_1=request.feasibility_stage_1,
                feasibility_stage_5=request.feasibility_stage_5,
                feasibility_stage_6=request.feasibility_stage_6,
                prior_art_context=prior_art_context,
                prior_art_results=request.prior_art_results,
                claims_text=request.claims_text,
                spec_language=request.spec_language,
                api_key=resolve_api_key(request.settings.api_key),
                default_model=request.settings.default_model,
                research_model=request.settings.research_model,
                max_tokens=request.settings.max_tokens,
                on_step=on_step,
            )
            queue.put_nowait({"event": "complete", "data": result.model_dump_json()})
        except Exception as e:
            queue.put_nowait({"event": "error", "data": json.dumps({"message": str(e)})})
        finally:
            queue.put_nowait(None)  # sentinel

    async def event_stream():
        task = asyncio.create_task(run_pipeline())
        try:
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=KEEPALIVE_INTERVAL_SECONDS)
                except asyncio.TimeoutError:
                    yield {"comment": "keepalive"}
                    continue
                if item is None:
                    break
                yield item
        finally:
            if not task.done():
                task.cancel()

    return EventSourceResponse(event_stream())


@app.post("/generate/sync", response_model=ApplicationGenerateResult, dependencies=[Depends(verify_internal_secret)])
async def generate_application_sync(request: ApplicationGenerateRequest):
    from .graph import run_application_pipeline

    prior_art_context = _build_prior_art_context(request)
    return await run_application_pipeline(
        invention_narrative=request.invention_narrative,
        feasibility_stage_1=request.feasibility_stage_1,
        feasibility_stage_5=request.feasibility_stage_5,
        feasibility_stage_6=request.feasibility_stage_6,
        prior_art_context=prior_art_context,
        prior_art_results=request.prior_art_results,
        claims_text=request.claims_text,
        spec_language=request.spec_language,
        api_key=resolve_api_key(request.settings.api_key),
        default_model=request.settings.default_model,
        research_model=request.settings.research_model,
        max_tokens=request.settings.max_tokens,
    )


@app.post("/export/docx", dependencies=[Depends(verify_internal_secret)])
async def export_to_docx(request: ExportRequest):
    from .exporter import export_docx

    docx_bytes = export_docx(request)
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="patent-application.docx"'},
    )


@app.post("/export/markdown", dependencies=[Depends(verify_internal_secret)])
async def export_to_markdown(request: ExportRequest):
    from .exporter import export_markdown

    md = export_markdown(request)
    return Response(content=md, media_type="text/markdown")


if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "3003"))
    uvicorn.run(app, host=host, port=port)
