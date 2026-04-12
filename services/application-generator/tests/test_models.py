"""Tests for request/response model validation."""

import pytest
from pydantic import ValidationError
from src.models import ApplicationGenerateRequest, GenerateSettings, PriorArtItem


class TestRequestValidation:
    def test_valid_request(self):
        req = ApplicationGenerateRequest(
            invention_narrative="A novel widget",
            claims_text="1. A method of making widgets.",
            settings=GenerateSettings(default_model="claude-sonnet-4-20250514"),
        )
        assert req.invention_narrative == "A novel widget"

    def test_missing_model_rejected(self):
        with pytest.raises(ValidationError):
            ApplicationGenerateRequest(
                invention_narrative="test",
                settings=GenerateSettings(),
            )

    def test_too_many_prior_art_rejected(self):
        items = [PriorArtItem(patent_number=f"US{i}", title=f"Patent {i}") for i in range(21)]
        with pytest.raises(ValidationError, match="Maximum 20"):
            ApplicationGenerateRequest(
                invention_narrative="test",
                prior_art_results=items,
                settings=GenerateSettings(default_model="claude-sonnet-4-20250514"),
            )

    def test_twenty_prior_art_accepted(self):
        items = [PriorArtItem(patent_number=f"US{i}", title=f"Patent {i}") for i in range(20)]
        req = ApplicationGenerateRequest(
            invention_narrative="test",
            prior_art_results=items,
            settings=GenerateSettings(default_model="claude-sonnet-4-20250514"),
        )
        assert len(req.prior_art_results) == 20
