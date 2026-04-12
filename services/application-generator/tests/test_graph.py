"""Tests for LangGraph pipeline structure."""

import pytest
from src.graph import build_graph, finalize
from src.models import GraphState


class TestGraphStructure:
    def test_graph_compiles(self):
        graph = build_graph()
        compiled = graph.compile()
        assert compiled is not None

    def test_graph_has_expected_nodes(self):
        graph = build_graph()
        node_names = set(graph.nodes.keys())
        expected = {"background", "summary", "detailed_description", "abstract", "figures", "format_ids", "finalize"}
        assert expected == node_names

    def test_graph_is_linear(self):
        graph = build_graph()
        compiled = graph.compile()
        assert compiled is not None


class TestFinalizeNode:
    @pytest.mark.asyncio
    async def test_finalize_returns_graph_state(self):
        """finalize() must return GraphState (not dict) for consistent LangGraph state handling."""
        state = GraphState(
            api_key="sk-ant-test",
            background="# Background\nSome background text.",
            summary="# Summary\nSome summary text.",
            step="figures",
        )
        result = await finalize(state)
        assert isinstance(result, GraphState)

    @pytest.mark.asyncio
    async def test_finalize_scrubs_api_key(self):
        state = GraphState(api_key="sk-ant-supersecret", background="text")
        result = await finalize(state)
        assert result.api_key == ""

    @pytest.mark.asyncio
    async def test_finalize_strips_heading_lines(self):
        """finalize() removes markdown heading lines (lines starting with #)."""
        state = GraphState(
            api_key="",
            background="# Background\nActual background content.",
            summary="## Summary Title\nSummary content.",
        )
        result = await finalize(state)
        assert not any(line.strip().startswith("#") for line in result.background.split("\n") if line.strip())
        assert not any(line.strip().startswith("#") for line in result.summary.split("\n") if line.strip())
        assert "Actual background content." in result.background
        assert "Summary content." in result.summary

    @pytest.mark.asyncio
    async def test_finalize_handles_empty_sections(self):
        """finalize() is a no-op for empty string sections."""
        state = GraphState(api_key="key", background="", summary="", abstract="")
        result = await finalize(state)
        assert result.background == ""
        assert result.summary == ""
        assert result.abstract == ""

    @pytest.mark.asyncio
    async def test_finalize_sets_step(self):
        state = GraphState(api_key="key", step="figures")
        result = await finalize(state)
        assert result.step == "finalize"

    @pytest.mark.asyncio
    async def test_finalize_preserves_cost_fields(self):
        """finalize() must preserve token counts and cost — not lose them."""
        state = GraphState(
            api_key="key",
            total_input_tokens=50_000,
            total_output_tokens=10_000,
            total_estimated_cost_usd=1.25,
        )
        result = await finalize(state)
        assert result.total_input_tokens == 50_000
        assert result.total_output_tokens == 10_000
        assert result.total_estimated_cost_usd == 1.25
