"""
LangGraph state machine for the compliance checking pipeline.

Flow: written_description -> definiteness -> formalities -> eligibility -> finalize
"""

from __future__ import annotations
import json
from typing import Callable

from langgraph.graph import StateGraph, END

from .models import GraphState, ComplianceResponse, ComplianceResultItem
from .agents.written_description import run_written_description
from .agents.definiteness import run_definiteness
from .agents.formalities import run_formalities
from .agents.eligibility import run_eligibility


async def finalize(state: GraphState) -> GraphState:
    """Aggregate results from all checkers. Scrub API key."""
    state.api_key = ""
    state.step = "finalize_complete"
    return state


def build_graph() -> StateGraph:
    """Build the compliance checking pipeline."""
    graph = StateGraph(GraphState)

    graph.add_node("written_description", run_written_description)
    graph.add_node("definiteness", run_definiteness)
    graph.add_node("formalities", run_formalities)
    graph.add_node("eligibility", run_eligibility)
    graph.add_node("finalize", finalize)

    graph.set_entry_point("written_description")
    graph.add_edge("written_description", "definiteness")
    graph.add_edge("definiteness", "formalities")
    graph.add_edge("formalities", "eligibility")
    graph.add_edge("eligibility", "finalize")
    graph.add_edge("finalize", END)

    return graph


async def run_compliance_pipeline(
    claims_text: str,
    specification_text: str,
    invention_narrative: str,
    api_key: str,
    default_model: str,
    prior_art_context: str = "",
    max_tokens: int = 16000,
    on_step: Callable[[str, str], None] | None = None,
) -> ComplianceResponse:
    """Run all four compliance checks and return aggregated results."""
    # Build and compile per-request so that agent references resolve at call time.
    # This keeps the pipeline testable (mock patches take effect) and avoids
    # stale function references across module reloads.
    pipeline = build_graph().compile()

    initial_state = GraphState(
        claims_text=claims_text,
        specification_text=specification_text,
        invention_narrative=invention_narrative,
        prior_art_context=prior_art_context,
        api_key=api_key,
        default_model=default_model,
        max_tokens=max_tokens,
    )

    state_dict: dict = initial_state.model_dump()
    async for step_output in pipeline.astream(state_dict):
        for node_name, node_state in step_output.items():
            if isinstance(node_state, dict):
                state_dict = node_state
            else:
                state_dict = node_state.model_dump() if hasattr(node_state, 'model_dump') else dict(node_state)
            if on_step:
                on_step(node_name, state_dict.get("step", ""))

    # Aggregate results from all checkers
    all_results: list[ComplianceResultItem] = []
    for field in ["written_description_results", "definiteness_results", "formalities_results", "eligibility_results"]:
        raw = state_dict.get(field, "[]")
        try:
            items = json.loads(raw) if isinstance(raw, str) else raw
            for item in items:
                all_results.append(ComplianceResultItem(**item) if isinstance(item, dict) else item)
        except (json.JSONDecodeError, TypeError):
            pass

    return ComplianceResponse(
        results=all_results,
        total_input_tokens=state_dict.get("total_input_tokens", 0),
        total_output_tokens=state_dict.get("total_output_tokens", 0),
        total_estimated_cost_usd=state_dict.get("total_estimated_cost_usd", 0.0),
        status="COMPLETE",
    )
