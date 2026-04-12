"""
LangGraph state machine for the claim drafting pipeline.

Flow: plan → draft → examine → (revise if needed) → finalize
"""

from __future__ import annotations
from typing import AsyncGenerator, Literal, Callable

from langgraph.graph import StateGraph, END

from .models import GraphState, Claim, ClaimDraftResult
from .agents.planner import run_planner
from .agents.writer import run_writer
from .agents.examiner import run_examiner
from .parser import parse_claims


async def finalize(state: GraphState) -> GraphState:
    """
    Parse the final claims text into structured Claim objects.
    Uses revised claims if available, otherwise the original draft.
    Scrubs the API key from state so it doesn't persist in checkpoints or tracebacks.
    """
    raw = state.revised_claims_raw or state.draft_claims_raw
    state.claims = parse_claims(raw)
    state.api_key = ""  # Scrub — no longer needed after all agents have run
    state.step = "finalize_complete"
    return state


def should_revise(state: GraphState) -> Literal["revise", "finalize"]:
    """Conditional edge: revise if examiner says so, otherwise finalize."""
    if state.needs_revision and not state.revised_claims_raw:
        return "revise"
    return "finalize"


def build_graph() -> StateGraph:
    """Build the LangGraph claim drafting pipeline."""
    graph = StateGraph(GraphState)

    # Add nodes
    graph.add_node("plan", run_planner)
    graph.add_node("draft", run_writer)
    graph.add_node("examine", run_examiner)
    graph.add_node("revise", run_writer)  # Same agent, revision mode
    graph.add_node("finalize", finalize)

    # Add edges
    graph.set_entry_point("plan")
    graph.add_edge("plan", "draft")
    graph.add_edge("draft", "examine")
    graph.add_conditional_edges("examine", should_revise)
    graph.add_edge("revise", "finalize")
    graph.add_edge("finalize", END)

    return graph


# Compiled graph (reused across requests)
claim_pipeline = build_graph().compile()


async def run_claim_pipeline(
    invention_narrative: str,
    feasibility_stage_5: str,
    feasibility_stage_6: str,
    prior_art_context: str,
    api_key: str,
    default_model: str = "claude-sonnet-4-20250514",
    research_model: str = "",
    max_tokens: int = 16000,
    on_step: 'Callable[[str, str], None] | None' = None,  # (node_name, step_name) — no state dict exposed
) -> ClaimDraftResult:
    """
    Run the full claim drafting pipeline and return structured results.

    Args:
        on_step: Optional callback called after each step with (step_name, state).
    """
    initial_state = GraphState(
        invention_narrative=invention_narrative,
        feasibility_stage_5=feasibility_stage_5,
        feasibility_stage_6=feasibility_stage_6,
        prior_art_context=prior_art_context,
        api_key=api_key,
        default_model=default_model,
        research_model=research_model,
        max_tokens=max_tokens,
    )

    # LangGraph astream yields {node_name: state_dict} — state is a dict, not a Pydantic model
    state_dict: dict = initial_state.model_dump()
    async for step_output in claim_pipeline.astream(state_dict):
        for node_name, node_state in step_output.items():
            if isinstance(node_state, dict):
                state_dict = node_state
            else:
                state_dict = node_state.model_dump() if hasattr(node_state, 'model_dump') else dict(node_state)
            if on_step:
                # Pass only the node name and step, NOT the full state (contains api_key)
                on_step(node_name, state_dict.get("step", ""))
            if state_dict.get("error"):
                return ClaimDraftResult(
                    status="ERROR",
                    error_message=state_dict["error"],
                    planner_strategy=state_dict.get("planner_strategy", ""),
                    examiner_feedback=state_dict.get("examiner_feedback", ""),
                    total_input_tokens=state_dict.get("total_input_tokens", 0),
                    total_output_tokens=state_dict.get("total_output_tokens", 0),
                    total_estimated_cost_usd=state_dict.get("total_estimated_cost_usd", 0.0),
                )

    # Convert final state dict back to claims
    claims = state_dict.get("claims", [])
    # Claims may be dicts (from LangGraph serialization) — convert to Claim objects
    parsed_claims = []
    for c in claims:
        if isinstance(c, dict):
            parsed_claims.append(Claim(**c))
        else:
            parsed_claims.append(c)

    return ClaimDraftResult(
        claims=parsed_claims,
        claim_count=len(parsed_claims),
        specification_language=state_dict.get("specification_language", ""),
        planner_strategy=state_dict.get("planner_strategy", ""),
        examiner_feedback=state_dict.get("examiner_feedback", ""),
        revision_notes=state_dict.get("revision_notes", ""),
        total_input_tokens=state_dict.get("total_input_tokens", 0),
        total_output_tokens=state_dict.get("total_output_tokens", 0),
        total_estimated_cost_usd=state_dict.get("total_estimated_cost_usd", 0.0),
        status="COMPLETE",
    )


def _build_step_detail(node_name: str, state_dict: dict) -> str:
    """Build a human-readable detail string for a completed node."""
    if node_name == "plan":
        return "Claim strategy planned"
    elif node_name == "draft":
        raw = state_dict.get("draft_claims_raw", "")
        # Count claims by looking for "Claim N." patterns
        claim_count = raw.count("\nClaim ") + (1 if raw.startswith("Claim ") else 0)
        if claim_count > 0:
            return f"{claim_count} claims drafted"
        return "Claims drafted"
    elif node_name == "examine":
        return "Claims reviewed"
    elif node_name == "revise":
        return "Claims revised"
    elif node_name == "finalize":
        claims = state_dict.get("claims", [])
        return f"{len(claims)} claims finalized"
    return f"{node_name} complete"


async def stream_claim_pipeline(
    invention_narrative: str,
    feasibility_stage_5: str,
    feasibility_stage_6: str,
    prior_art_context: str,
    api_key: str,
    default_model: str = "claude-sonnet-4-20250514",
    research_model: str = "",
    max_tokens: int = 16000,
) -> AsyncGenerator[dict, None]:
    """
    Stream the claim pipeline, yielding SSE-ready dicts as each node completes.

    Yields dicts with either:
      - {"event": "step", "node": str, "detail": str}  — after each node
      - {"event": "complete", "result": ClaimDraftResult}  — final result
      - {"event": "error", "message": str}  — on pipeline error
    """
    initial_state = GraphState(
        invention_narrative=invention_narrative,
        feasibility_stage_5=feasibility_stage_5,
        feasibility_stage_6=feasibility_stage_6,
        prior_art_context=prior_art_context,
        api_key=api_key,
        default_model=default_model,
        research_model=research_model,
        max_tokens=max_tokens,
    )

    state_dict: dict = initial_state.model_dump()
    async for step_output in claim_pipeline.astream(state_dict):
        for node_name, node_state in step_output.items():
            if isinstance(node_state, dict):
                state_dict = node_state
            else:
                state_dict = node_state.model_dump() if hasattr(node_state, 'model_dump') else dict(node_state)

            # Check for error — yield error event and stop
            if state_dict.get("error"):
                result = ClaimDraftResult(
                    status="ERROR",
                    error_message=state_dict["error"],
                    planner_strategy=state_dict.get("planner_strategy", ""),
                    examiner_feedback=state_dict.get("examiner_feedback", ""),
                    total_input_tokens=state_dict.get("total_input_tokens", 0),
                    total_output_tokens=state_dict.get("total_output_tokens", 0),
                    total_estimated_cost_usd=state_dict.get("total_estimated_cost_usd", 0.0),
                )
                yield {"event": "error", "message": state_dict["error"]}
                return

            # Yield step event for this node
            detail = _build_step_detail(node_name, state_dict)
            yield {"event": "step", "node": node_name, "detail": detail}

    # Build final result
    claims = state_dict.get("claims", [])
    parsed_claims = []
    for c in claims:
        if isinstance(c, dict):
            parsed_claims.append(Claim(**c))
        else:
            parsed_claims.append(c)

    result = ClaimDraftResult(
        claims=parsed_claims,
        claim_count=len(parsed_claims),
        specification_language=state_dict.get("specification_language", ""),
        planner_strategy=state_dict.get("planner_strategy", ""),
        examiner_feedback=state_dict.get("examiner_feedback", ""),
        revision_notes=state_dict.get("revision_notes", ""),
        total_input_tokens=state_dict.get("total_input_tokens", 0),
        total_output_tokens=state_dict.get("total_output_tokens", 0),
        total_estimated_cost_usd=state_dict.get("total_estimated_cost_usd", 0.0),
        status="COMPLETE",
    )
    yield {"event": "complete", "result": result}
