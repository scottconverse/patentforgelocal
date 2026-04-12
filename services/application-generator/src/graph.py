"""
LangGraph pipeline for patent application generation.

Flow: background → summary → detailed_description → abstract → figures → format_ids → finalize
"""

from __future__ import annotations
from typing import Callable

from langgraph.graph import StateGraph, END

from .models import GraphState, ApplicationGenerateResult, PriorArtItem
from .agents.background import run_background
from .agents.summary import run_summary
from .agents.detailed_description import run_detailed_description
from .agents.abstract import run_abstract
from .agents.figures import run_figures
from .formatter import format_ids_table
from .cross_references import build_cross_references


async def format_ids(state: GraphState) -> dict:
    """Format prior art into IDS table. No LLM call."""
    return {"step": "format_ids"}


async def finalize(state: GraphState) -> GraphState:
    """Scrub API key and clean markdown artifacts from agent output."""

    def clean_section(text: str) -> str:
        if not text:
            return text
        lines = text.split("\n")
        cleaned = [line for line in lines if not line.strip().startswith("#")]
        text = "\n".join(cleaned)
        while text.startswith("\n"):
            text = text[1:]
        return text

    # Scrub API key from state — this propagates back into state_dict via the astream loop.
    # state_dict["api_key"] will be empty string after finalize runs. Do not access it downstream.
    state.api_key = ""
    state.background = clean_section(state.background)
    state.summary = clean_section(state.summary)
    state.detailed_description = clean_section(state.detailed_description)
    state.abstract = clean_section(state.abstract)
    state.figure_descriptions = clean_section(state.figure_descriptions)
    state.step = "finalize"
    return state


def build_graph() -> StateGraph:
    graph = StateGraph(GraphState)

    graph.add_node("background", run_background)
    graph.add_node("summary", run_summary)
    graph.add_node("detailed_description", run_detailed_description)
    graph.add_node("abstract", run_abstract)
    graph.add_node("figures", run_figures)
    graph.add_node("format_ids", format_ids)
    graph.add_node("finalize", finalize)

    graph.set_entry_point("background")
    graph.add_edge("background", "summary")
    graph.add_edge("summary", "detailed_description")
    graph.add_edge("detailed_description", "abstract")
    graph.add_edge("abstract", "figures")
    graph.add_edge("figures", "format_ids")
    graph.add_edge("format_ids", "finalize")
    graph.add_edge("finalize", END)

    return graph


application_pipeline = build_graph().compile()


async def run_application_pipeline(
    invention_narrative: str,
    feasibility_stage_1: str,
    feasibility_stage_5: str,
    feasibility_stage_6: str,
    prior_art_context: str,
    prior_art_results: list[PriorArtItem],
    claims_text: str,
    spec_language: str,
    api_key: str,
    default_model: str = "claude-sonnet-4-20250514",
    research_model: str = "",
    max_tokens: int = 32000,
    on_step: Callable[[str, str], None] | None = None,
) -> ApplicationGenerateResult:
    """Run the full application generation pipeline."""

    ids_table = format_ids_table(prior_art_results)
    cross_references = build_cross_references(
        invention_narrative=invention_narrative,
        feasibility_stage_1=feasibility_stage_1,
        claims_text=claims_text,
    )

    initial_state = GraphState(
        invention_narrative=invention_narrative,
        feasibility_stage_1=feasibility_stage_1,
        feasibility_stage_5=feasibility_stage_5,
        feasibility_stage_6=feasibility_stage_6,
        prior_art_context=prior_art_context,
        claims_text=claims_text,
        spec_language=spec_language,
        api_key=api_key,
        default_model=default_model,
        research_model=research_model,
        max_tokens=max_tokens,
        ids_table=ids_table,
        cross_references=cross_references,
    )

    state_dict: dict = initial_state.model_dump()
    # Accumulate state across all nodes using .update() (not assignment).
    # Agents must return the full accumulated GraphState (not partial dicts with None fields)
    # for this accumulation to be safe. Partial-dict nodes (e.g. format_ids) are safe because
    # they only add new keys — they do not set content fields to None.
    async for step_output in application_pipeline.astream(state_dict):
        for node_name, node_state in step_output.items():
            if isinstance(node_state, dict):
                state_dict.update(node_state)
            else:
                node_dict = node_state.model_dump() if hasattr(node_state, "model_dump") else dict(node_state)
                state_dict.update(node_dict)
            if on_step:
                on_step(node_name, state_dict.get("step", ""))
            if state_dict.get("error"):
                return ApplicationGenerateResult(
                    status="ERROR",
                    error_message=state_dict["error"],
                    background=state_dict.get("background", ""),
                    summary=state_dict.get("summary", ""),
                    detailed_description=state_dict.get("detailed_description", ""),
                    abstract=state_dict.get("abstract", ""),
                    figure_descriptions=state_dict.get("figure_descriptions", ""),
                    ids_table=state_dict.get("ids_table", ""),
                    total_input_tokens=state_dict.get("total_input_tokens", 0),
                    total_output_tokens=state_dict.get("total_output_tokens", 0),
                    total_estimated_cost_usd=state_dict.get("total_estimated_cost_usd", 0.0),
                )

    return ApplicationGenerateResult(
        title=state_dict.get("invention_narrative", "").split("\n")[0][:200].replace("Title: ", "").replace("title: ", ""),
        cross_references=state_dict.get("cross_references", ""),
        background=state_dict.get("background", ""),
        summary=state_dict.get("summary", ""),
        detailed_description=state_dict.get("detailed_description", ""),
        claims=state_dict.get("claims_text", ""),
        abstract=state_dict.get("abstract", ""),
        figure_descriptions=state_dict.get("figure_descriptions", ""),
        ids_table=state_dict.get("ids_table", ""),
        total_input_tokens=state_dict.get("total_input_tokens", 0),
        total_output_tokens=state_dict.get("total_output_tokens", 0),
        total_estimated_cost_usd=state_dict.get("total_estimated_cost_usd", 0.0),
        status="SUCCESS",
    )
