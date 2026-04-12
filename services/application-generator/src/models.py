"""
Pydantic models for the application generator service.
"""

from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field, field_validator


class PriorArtItem(BaseModel):
    patent_number: str
    title: str
    abstract: str | None = None
    relevance_score: float = 0.0
    claims_text: str | None = None


class GenerateSettings(BaseModel):
    api_key: str = ""
    default_model: str
    research_model: str = ""
    max_tokens: int = 32000


class ApplicationGenerateRequest(BaseModel):
    invention_narrative: str = Field(max_length=100_000)
    feasibility_stage_1: str = Field(default="", max_length=200_000)
    feasibility_stage_5: str = Field(default="", max_length=200_000)
    feasibility_stage_6: str = Field(default="", max_length=200_000)
    prior_art_results: list[PriorArtItem] = Field(default_factory=list)
    claims_text: str = Field(default="", max_length=200_000)
    spec_language: str = Field(default="", max_length=200_000)
    settings: GenerateSettings

    @field_validator("prior_art_results")
    @classmethod
    def cap_prior_art(cls, v: list[PriorArtItem]) -> list[PriorArtItem]:
        if len(v) > 20:
            raise ValueError("Maximum 20 prior art results allowed")
        return v


class ApplicationGenerateResult(BaseModel):
    title: str = ""
    cross_references: str = ""
    background: str = ""
    summary: str = ""
    detailed_description: str = ""
    claims: str = ""
    abstract: str = ""
    figure_descriptions: str = ""
    ids_table: str = ""
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_estimated_cost_usd: float = 0.0
    status: Literal["SUCCESS", "ERROR"] = "SUCCESS"
    error_message: str | None = None


class ExportRequest(BaseModel):
    title: str = ""
    cross_references: str = ""
    background: str = ""
    summary: str = ""
    detailed_description: str = ""
    claims: str = ""
    abstract: str = ""
    figure_descriptions: str = ""
    ids_table: str = ""


class GraphState(BaseModel):
    invention_narrative: str = ""
    feasibility_stage_1: str = ""
    feasibility_stage_5: str = ""
    feasibility_stage_6: str = ""
    prior_art_context: str = ""
    claims_text: str = ""
    spec_language: str = ""
    api_key: str = ""
    default_model: str = ""
    research_model: str = ""
    max_tokens: int = 32000

    background: str = ""
    summary: str = ""
    detailed_description: str = ""
    abstract: str = ""
    figure_descriptions: str = ""

    cross_references: str = ""
    ids_table: str = ""

    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_estimated_cost_usd: float = 0.0

    step: str = ""
    error: str | None = None
