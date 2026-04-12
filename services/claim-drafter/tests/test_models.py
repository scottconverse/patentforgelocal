"""
Tests for Pydantic models — serialization, defaults, and validation.
"""

from src.models import (
    Claim, ClaimDraftRequest, ClaimDraftResult, DraftSettings,
    GraphState, PriorArtItem,
)


class TestClaimModel:
    def test_independent_claim(self):
        c = Claim(
            claim_number=1,
            claim_type="INDEPENDENT",
            scope_level="BROAD",
            statutory_type="method",
            text="A method comprising: step a; and step b.",
        )
        assert c.claim_number == 1
        assert c.parent_claim_number is None

    def test_dependent_claim(self):
        c = Claim(
            claim_number=2,
            claim_type="DEPENDENT",
            parent_claim_number=1,
            text="The method of claim 1, wherein step a uses a processor.",
        )
        assert c.claim_type == "DEPENDENT"
        assert c.parent_claim_number == 1
        assert c.scope_level is None


class TestClaimDraftRequest:
    def test_minimal_request(self):
        req = ClaimDraftRequest(
            invention_narrative="A widget that does things.",
            settings=DraftSettings(api_key="test-key", default_model="claude-haiku-4-5-20251001"),
        )
        assert req.invention_narrative == "A widget that does things."
        assert req.prior_art_results == []
        assert req.settings.default_model == "claude-haiku-4-5-20251001"

    def test_request_with_prior_art(self):
        req = ClaimDraftRequest(
            invention_narrative="A widget.",
            prior_art_results=[
                PriorArtItem(
                    patent_number="US12345678",
                    title="Prior Widget",
                    abstract="An earlier widget.",
                    relevance_score=0.85,
                ),
            ],
            settings=DraftSettings(api_key="test-key", default_model="claude-haiku-4-5-20251001"),
        )
        assert len(req.prior_art_results) == 1
        assert req.prior_art_results[0].relevance_score == 0.85


class TestClaimDraftResult:
    def test_complete_result(self):
        result = ClaimDraftResult(
            claims=[
                Claim(claim_number=1, claim_type="INDEPENDENT", text="A method."),
            ],
            claim_count=1,
            planner_strategy="Plan here.",
            examiner_feedback="Looks adequate.",
            status="COMPLETE",
        )
        assert result.status == "COMPLETE"
        assert result.claim_count == 1

    def test_error_result(self):
        result = ClaimDraftResult(
            status="ERROR",
            error_message="API call failed.",
        )
        assert result.status == "ERROR"
        assert result.claims == []


class TestGraphState:
    def test_default_state(self):
        state = GraphState()
        assert state.step == "init"
        assert state.needs_revision is False
        assert state.claims == []
        assert state.error is None

    def test_state_with_inputs(self):
        state = GraphState(
            invention_narrative="A sensor network.",
            api_key="test-key",
            default_model="claude-opus-4-20250514",
        )
        assert state.default_model == "claude-opus-4-20250514"
