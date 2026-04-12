"""
PatentForge Compliance Checker — FastAPI server.

Endpoints:
  GET  /health          — Service health check with prompt hashes
  POST /check           — Run the compliance checking pipeline (sync)
  POST /check/stream    — Run the pipeline with SSE progress events
"""

from __future__ import annotations
import json
import hashlib
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from sse_starlette.sse import EventSourceResponse

from .models import ComplianceRequest, ComplianceResponse
from .graph import run_compliance_pipeline

app = FastAPI(title="PatentForge Compliance Checker", version="0.5.0")

INTERNAL_SECRET = os.environ.get("INTERNAL_SERVICE_SECRET", "")
ANTHROPIC_API_KEY_ENV = os.environ.get("ANTHROPIC_API_KEY", "")


def resolve_api_key(request_key: str) -> str:
    """Use env var if set, otherwise fall back to request body value."""
    return ANTHROPIC_API_KEY_ENV or request_key


api_key_header = APIKeyHeader(name="X-Internal-Secret", auto_error=False)


async def verify_internal_secret(key: str | None = Depends(api_key_header)):
    """Reject requests without valid internal secret (when secret is configured)."""
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
        "service": "patentforge-compliance-checker",
        "promptHashes": _compute_prompt_hashes(),
    }


@app.post("/check", response_model=ComplianceResponse, dependencies=[Depends(verify_internal_secret)])
async def check_compliance(request: ComplianceRequest):
    """Run the compliance checking pipeline synchronously. Returns the complete result."""
    claims_parts = []
    for c in request.claims:
        if c.claim_type == "INDEPENDENT":
            prefix = f"Claim {c.claim_number} (Independent):"
        else:
            prefix = f"Claim {c.claim_number} (Dependent on Claim {c.parent_claim_number}):"
        claims_parts.append(f"{prefix}\n{c.text}")
    claims_text = "\n\n".join(claims_parts)

    return await run_compliance_pipeline(
        claims_text=claims_text,
        specification_text=request.specification_text,
        invention_narrative=request.invention_narrative,
        prior_art_context=request.prior_art_context,
        api_key=resolve_api_key(request.settings.api_key),
        default_model=request.settings.default_model,
        max_tokens=request.settings.max_tokens,
    )


# -- Mapping from LangGraph node names to SSE step metadata -----------------

_STEP_META = {
    "eligibility": {
        "step": "eligibility",
        "detail": "35 USC 101 eligibility check complete",
        "results_field": "eligibility_results",
    },
    "definiteness": {
        "step": "definiteness",
        "detail": "35 USC 112(b) definiteness check complete",
        "results_field": "definiteness_results",
    },
    "written_description": {
        "step": "written_description",
        "detail": "35 USC 112(a) written description check complete",
        "results_field": "written_description_results",
    },
    "formalities": {
        "step": "formalities",
        "detail": "MPEP 608 formalities check complete",
        "results_field": "formalities_results",
    },
}

_SSE_KEEPALIVE_SECONDS = 20


@app.post("/check/stream", dependencies=[Depends(verify_internal_secret)])
async def check_compliance_stream(request: ComplianceRequest):
    """Run the compliance pipeline, streaming progress via SSE."""

    claims_parts = []
    for c in request.claims:
        if c.claim_type == "INDEPENDENT":
            prefix = f"Claim {c.claim_number} (Independent):"
        else:
            prefix = f"Claim {c.claim_number} (Dependent on Claim {c.parent_claim_number}):"
        claims_parts.append(f"{prefix}\n{c.text}")
    claims_text = "\n\n".join(claims_parts)

    async def _event_generator():
        from .graph import build_graph
        from .models import GraphState, ComplianceResultItem

        pipeline = build_graph().compile()
        initial_state = GraphState(
            claims_text=claims_text,
            specification_text=request.specification_text,
            invention_narrative=request.invention_narrative,
            prior_art_context=request.prior_art_context,
            api_key=resolve_api_key(request.settings.api_key),
            default_model=request.settings.default_model,
            max_tokens=request.settings.max_tokens,
        )

        state_dict: dict = initial_state.model_dump()
        try:
            async for step_output in pipeline.astream(state_dict):
                for node_name, node_state in step_output.items():
                    if isinstance(node_state, dict):
                        state_dict = node_state
                    else:
                        state_dict = (
                            node_state.model_dump()
                            if hasattr(node_state, "model_dump")
                            else dict(node_state)
                        )

                    meta = _STEP_META.get(node_name)
                    if meta is None:
                        continue

                    # Count results for this step
                    results_field = meta["results_field"]
                    raw = state_dict.get(results_field, "[]")
                    try:
                        items = json.loads(raw) if isinstance(raw, str) else raw
                        results_count = len(items) if isinstance(items, list) else 0
                    except (json.JSONDecodeError, TypeError):
                        results_count = 0

                    yield {
                        "event": "step",
                        "data": json.dumps({
                            "step": meta["step"],
                            "status": "complete",
                            "detail": meta["detail"],
                            "results_count": results_count,
                        }),
                    }

            # Aggregate final results (same logic as run_compliance_pipeline)
            all_results: list[ComplianceResultItem] = []
            for field in [
                "written_description_results",
                "definiteness_results",
                "formalities_results",
                "eligibility_results",
            ]:
                raw = state_dict.get(field, "[]")
                try:
                    items = json.loads(raw) if isinstance(raw, str) else raw
                    for item in items:
                        all_results.append(
                            ComplianceResultItem(**item) if isinstance(item, dict) else item
                        )
                except (json.JSONDecodeError, TypeError):
                    pass

            # Scrub API key from state before final response
            response = ComplianceResponse(
                results=all_results,
                total_input_tokens=state_dict.get("total_input_tokens", 0),
                total_output_tokens=state_dict.get("total_output_tokens", 0),
                total_estimated_cost_usd=state_dict.get("total_estimated_cost_usd", 0.0),
                status="COMPLETE",
            )

            yield {
                "event": "complete",
                "data": response.model_dump_json(),
            }

        except Exception as exc:
            yield {
                "event": "error",
                "data": json.dumps({"message": str(exc)}),
            }

    return EventSourceResponse(
        _event_generator(),
        ping=_SSE_KEEPALIVE_SECONDS,
    )


if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "3004"))
    uvicorn.run(app, host=host, port=port)
