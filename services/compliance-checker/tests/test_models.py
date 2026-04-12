"""Tests for compliance checker Pydantic models."""

import pytest
from pydantic import ValidationError

from src.models import (
    ClaimItem,
    ComplianceSettings,
    ComplianceRequest,
    ComplianceResultItem,
    ComplianceResponse,
)


class TestClaimItem:
    def test_valid_claim(self):
        c = ClaimItem(claim_number=1, claim_type="INDEPENDENT", text="A method comprising...")
        assert c.claim_number == 1
        assert c.claim_type == "INDEPENDENT"

    def test_missing_text_fails(self):
        with pytest.raises(ValidationError):
            ClaimItem(claim_number=1, claim_type="INDEPENDENT", text="")

    def test_dependent_with_parent(self):
        c = ClaimItem(claim_number=2, claim_type="DEPENDENT", parent_claim_number=1, text="The method of claim 1")
        assert c.parent_claim_number == 1


class TestComplianceSettings:
    def test_model_required(self):
        s = ComplianceSettings(default_model="claude-sonnet-4-20250514")
        assert s.api_key == ""
        assert s.max_tokens == 16000

    def test_missing_model_fails(self):
        with pytest.raises(ValidationError):
            ComplianceSettings()


class TestComplianceRequest:
    def test_valid_request(self):
        req = ComplianceRequest(
            claims=[ClaimItem(claim_number=1, claim_type="INDEPENDENT", text="A method")],
            specification_text="The invention relates to...",
            invention_narrative="A system that...",
            settings=ComplianceSettings(default_model="claude-sonnet-4-20250514"),
        )
        assert len(req.claims) == 1

    def test_empty_claims_fails(self):
        with pytest.raises(ValidationError):
            ComplianceRequest(
                claims=[],
                specification_text="",
                invention_narrative="",
                settings=ComplianceSettings(default_model="claude-sonnet-4-20250514"),
            )

    def test_max_claims_cap(self):
        claims = [ClaimItem(claim_number=i, claim_type="INDEPENDENT", text=f"Claim {i}") for i in range(1, 52)]
        with pytest.raises(ValidationError, match="Maximum 50 claims"):
            ComplianceRequest(
                claims=claims,
                specification_text="",
                invention_narrative="",
                settings=ComplianceSettings(default_model="claude-sonnet-4-20250514"),
            )


class TestComplianceResultItem:
    def test_valid_result(self):
        r = ComplianceResultItem(
            rule="112b_definiteness",
            status="FAIL",
            claim_number=2,
            detail="'the processing unit' lacks antecedent basis",
            citation="MPEP 2173.05(e)",
            suggestion="Add 'a processing unit' to claim 1",
        )
        assert r.status == "FAIL"

    def test_invalid_status_fails(self):
        with pytest.raises(ValidationError):
            ComplianceResultItem(
                rule="112a", status="INVALID", detail="test"
            )

    def test_pass_without_suggestion(self):
        r = ComplianceResultItem(rule="112a", status="PASS", detail="All elements supported")
        assert r.suggestion is None


class TestComplianceResponse:
    def test_overall_pass_computed(self):
        r = ComplianceResponse(
            results=[
                ComplianceResultItem(rule="112a", status="PASS", detail="OK"),
                ComplianceResultItem(rule="112b", status="PASS", detail="OK"),
            ],
        )
        assert r.overall_pass is True

    def test_overall_fail_on_any_fail(self):
        r = ComplianceResponse(
            results=[
                ComplianceResultItem(rule="112a", status="PASS", detail="OK"),
                ComplianceResultItem(rule="112b", status="FAIL", detail="Bad"),
            ],
        )
        assert r.overall_pass is False

    def test_warn_does_not_cause_fail(self):
        r = ComplianceResponse(
            results=[
                ComplianceResultItem(rule="112a", status="PASS", detail="OK"),
                ComplianceResultItem(rule="608", status="WARN", detail="Deep chain"),
            ],
        )
        assert r.overall_pass is True

    def test_empty_results_is_not_pass(self):
        r = ComplianceResponse(results=[])
        assert r.overall_pass is False
