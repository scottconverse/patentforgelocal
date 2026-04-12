"""
Tests for the LangGraph state machine structure.
Verifies graph compilation, node names, and conditional routing.
"""

from src.graph import build_graph, should_revise
from src.models import GraphState


class TestGraphStructure:
    def test_graph_compiles(self):
        graph = build_graph()
        compiled = graph.compile()
        assert compiled is not None

    def test_graph_has_expected_nodes(self):
        graph = build_graph()
        # StateGraph stores nodes in .nodes dict
        node_names = set(graph.nodes.keys())
        assert "plan" in node_names
        assert "draft" in node_names
        assert "examine" in node_names
        assert "revise" in node_names
        assert "finalize" in node_names


class TestConditionalRouting:
    def test_routes_to_revise_when_needed(self):
        state = GraphState(needs_revision=True, revised_claims_raw="")
        assert should_revise(state) == "revise"

    def test_routes_to_finalize_when_no_revision_needed(self):
        state = GraphState(needs_revision=False)
        assert should_revise(state) == "finalize"

    def test_routes_to_finalize_after_revision_already_done(self):
        state = GraphState(
            needs_revision=True,
            revised_claims_raw="Already revised claims here.",
        )
        assert should_revise(state) == "finalize"
