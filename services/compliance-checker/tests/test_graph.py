"""Tests for compliance checking LangGraph pipeline."""

import json
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from src.graph import build_graph, run_compliance_pipeline
from src.models import GraphState, ComplianceResponse


class TestGraphStructure:
    def test_graph_compiles(self):
        graph = build_graph()
        compiled = graph.compile()
        assert compiled is not None

    def test_graph_has_expected_nodes(self):
        graph = build_graph()
        node_names = set(graph.nodes.keys())
        assert "written_description" in node_names
        assert "definiteness" in node_names
        assert "formalities" in node_names
        assert "eligibility" in node_names
        assert "finalize" in node_names


def _make_mock_agent(field_name: str, results: list[dict]):
    """Create a coroutine that sets the given state field and accumulates cost."""
    async def mock_agent(state):
        if isinstance(state, dict):
            state[field_name] = json.dumps(results)
            state["total_input_tokens"] = state.get("total_input_tokens", 0) + 100
            state["total_output_tokens"] = state.get("total_output_tokens", 0) + 200
            return state
        setattr(state, field_name, json.dumps(results))
        state.total_input_tokens += 100
        state.total_output_tokens += 200
        return state
    return mock_agent


class TestCompliancePipeline:
    @patch("src.graph.run_eligibility")
    @patch("src.graph.run_formalities")
    @patch("src.graph.run_definiteness")
    @patch("src.graph.run_written_description")
    async def test_all_checks_run_and_aggregate(self, mock_wd, mock_def, mock_form, mock_elig):
        pass_result = [{"rule": "test", "status": "PASS", "claim_number": 1, "detail": "OK"}]
        mock_wd.side_effect = _make_mock_agent("written_description_results", pass_result)
        mock_def.side_effect = _make_mock_agent("definiteness_results", pass_result)
        mock_form.side_effect = _make_mock_agent("formalities_results", pass_result)
        mock_elig.side_effect = _make_mock_agent("eligibility_results", pass_result)

        result = await run_compliance_pipeline(
            claims_text="1. A method.",
            specification_text="The invention...",
            invention_narrative="A system.",
            api_key="test-key",
            default_model="claude-sonnet-4-20250514",
        )

        assert isinstance(result, ComplianceResponse)
        assert result.status == "COMPLETE"
        assert len(result.results) == 4
        assert result.overall_pass is True

    @patch("src.graph.run_eligibility")
    @patch("src.graph.run_formalities")
    @patch("src.graph.run_definiteness")
    @patch("src.graph.run_written_description")
    async def test_failure_detected(self, mock_wd, mock_def, mock_form, mock_elig):
        fail_result = [{"rule": "112b", "status": "FAIL", "claim_number": 1, "detail": "Bad"}]
        pass_result = [{"rule": "test", "status": "PASS", "claim_number": 1, "detail": "OK"}]
        mock_wd.side_effect = _make_mock_agent("written_description_results", pass_result)
        mock_def.side_effect = _make_mock_agent("definiteness_results", fail_result)
        mock_form.side_effect = _make_mock_agent("formalities_results", pass_result)
        mock_elig.side_effect = _make_mock_agent("eligibility_results", pass_result)

        result = await run_compliance_pipeline(
            claims_text="1. A method.",
            specification_text="",
            invention_narrative="",
            api_key="test-key",
            default_model="claude-sonnet-4-20250514",
        )

        assert result.overall_pass is False
        assert any(r.status == "FAIL" for r in result.results)

    @patch("src.graph.run_eligibility")
    @patch("src.graph.run_formalities")
    @patch("src.graph.run_definiteness")
    @patch("src.graph.run_written_description")
    async def test_cost_aggregated(self, mock_wd, mock_def, mock_form, mock_elig):
        pass_result = [{"rule": "test", "status": "PASS", "claim_number": 1, "detail": "OK"}]
        mock_wd.side_effect = _make_mock_agent("written_description_results", pass_result)
        mock_def.side_effect = _make_mock_agent("definiteness_results", pass_result)
        mock_form.side_effect = _make_mock_agent("formalities_results", pass_result)
        mock_elig.side_effect = _make_mock_agent("eligibility_results", pass_result)

        result = await run_compliance_pipeline(
            claims_text="1. A method.",
            specification_text="",
            invention_narrative="",
            api_key="test-key",
            default_model="claude-sonnet-4-20250514",
        )

        assert result.total_input_tokens == 400
        assert result.total_output_tokens == 800

    @patch("src.graph.run_eligibility")
    @patch("src.graph.run_formalities")
    @patch("src.graph.run_definiteness")
    @patch("src.graph.run_written_description")
    async def test_on_step_callback(self, mock_wd, mock_def, mock_form, mock_elig):
        pass_result = [{"rule": "test", "status": "PASS", "claim_number": 1, "detail": "OK"}]
        mock_wd.side_effect = _make_mock_agent("written_description_results", pass_result)
        mock_def.side_effect = _make_mock_agent("definiteness_results", pass_result)
        mock_form.side_effect = _make_mock_agent("formalities_results", pass_result)
        mock_elig.side_effect = _make_mock_agent("eligibility_results", pass_result)

        steps = []
        result = await run_compliance_pipeline(
            claims_text="1. A method.",
            specification_text="",
            invention_narrative="",
            api_key="test-key",
            default_model="claude-sonnet-4-20250514",
            on_step=lambda name, step: steps.append(name),
        )

        assert len(steps) >= 4  # At least one per checker + finalize
