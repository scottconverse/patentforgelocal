"""
Pydantic models for the compliance checking service.
Defines request/response schemas and the LangGraph state.
"""

from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field, field_validator


# -- Request models ------------------------------------------------------------

class ClaimItem(BaseModel):
    """A single patent claim to check."""
    claim_number: int
    claim_type: Literal["INDEPENDENT", "DEPENDENT"]
    parent_claim_number: int | None = None
    text: str = Field(min_length=1, max_length=10_000)


class ComplianceSettings(BaseModel):
    """User settings forwarded from the backend."""
    api_key: str = ""
    default_model: str
    research_model: str = ""
    max_tokens: int = 16000


class ComplianceRequest(BaseModel):
    """Input to the compliance checking pipeline."""
    claims: list[ClaimItem] = Field(min_length=1)
    specification_text: str = Field(default="", max_length=200_000)
    invention_narrative: str = Field(default="", max_length=100_000)
    prior_art_context: str = Field(default="", max_length=50_000)
    settings: ComplianceSettings

    @field_validator('claims')
    @classmethod
    def cap_claims(cls, v: list[ClaimItem]) -> list[ClaimItem]:
        if len(v) > 50:
            raise ValueError('Maximum 50 claims allowed')
        return v


# -- Output models -------------------------------------------------------------

class ComplianceResultItem(BaseModel):
    """A single compliance check result."""
    rule: str
    status: Literal["PASS", "FAIL", "WARN"]
    claim_number: int | None = None
    detail: str
    citation: str | None = None
    suggestion: str | None = None


class ComplianceResponse(BaseModel):
    """Complete output of the compliance checking pipeline."""
    results: list[ComplianceResultItem] = Field(default_factory=list)
    overall_pass: bool = False
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_estimated_cost_usd: float = 0.0
    status: Literal["COMPLETE", "ERROR"] = "COMPLETE"
    error_message: str | None = None

    def model_post_init(self, __context) -> None:
        """Compute overall_pass from results."""
        if self.results:
            self.overall_pass = all(r.status != "FAIL" for r in self.results)


# -- LangGraph state -----------------------------------------------------------

class GraphState(BaseModel):
    """Shared state for the compliance checking LangGraph pipeline."""
    # Inputs
    claims_text: str = ""
    specification_text: str = ""
    invention_narrative: str = ""
    prior_art_context: str = ""
    api_key: str = ""
    default_model: str = ""
    max_tokens: int = 16000

    # Per-checker outputs (JSON strings of ComplianceResultItem lists)
    written_description_results: str = "[]"
    definiteness_results: str = "[]"
    formalities_results: str = "[]"
    eligibility_results: str = "[]"

    # Cost tracking
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_estimated_cost_usd: float = 0.0

    # Pipeline control
    step: str = "init"
    error: str | None = None
