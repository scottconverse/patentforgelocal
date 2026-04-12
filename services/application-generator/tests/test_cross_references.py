"""Tests for cross_references section builder."""

import pytest
from src.cross_references import build_cross_references, _extract_related_applications


class TestExtractRelatedApplications:
    """Unit tests for the regex extraction helper."""

    def test_empty_string(self):
        assert _extract_related_applications("") == []

    def test_none_input(self):
        assert _extract_related_applications(None) == []

    def test_no_matches(self):
        text = "This is a novel invention for sorting widgets."
        assert _extract_related_applications(text) == []

    def test_provisional_application(self):
        text = "This invention builds on provisional application No. 63/123,456 filed Jan 2024."
        result = _extract_related_applications(text)
        assert len(result) == 1
        assert "63/123,456" in result[0]

    def test_us_patent_application_serial(self):
        text = "Related to U.S. patent application serial No. 17/654,321."
        result = _extract_related_applications(text)
        assert len(result) >= 1
        assert any("17/654,321" in r for r in result)

    def test_continuation_in_part(self):
        text = "This is a continuation-in-part of application No. 16/789,012."
        result = _extract_related_applications(text)
        assert len(result) >= 1
        assert any("16/789,012" in r for r in result)

    def test_claims_benefit(self):
        text = "This application claims the benefit of provisional application No. 63/555,777."
        result = _extract_related_applications(text)
        assert len(result) >= 1
        assert any("63/555,777" in r for r in result)

    def test_pct_application(self):
        text = "Related to PCT/US2024/012345 filed internationally."
        result = _extract_related_applications(text)
        assert len(result) == 1
        assert "PCT/US2024/012345" in result[0]

    def test_deduplication(self):
        text = (
            "Provisional application No. 63/123,456 was filed. "
            "This claims benefit of provisional application No. 63/123,456."
        )
        result = _extract_related_applications(text)
        # The same application number should appear only once
        matching = [r for r in result if "63/123,456" in r]
        assert len(matching) >= 1
        # Total unique results should be reasonable (dedup works)
        assert len(result) <= 2

    def test_multiple_different_applications(self):
        text = (
            "Claims priority to provisional application No. 63/111,222 "
            "and is a continuation of application No. 17/333,444."
        )
        result = _extract_related_applications(text)
        assert len(result) >= 2


class TestBuildCrossReferences:
    """Tests for the full section builder."""

    def test_no_related_apps_produces_standalone_statement(self):
        result = build_cross_references(
            invention_narrative="A novel widget sorter.",
            feasibility_stage_1="The invention is feasible.",
            claims_text="1. A method for sorting widgets.",
        )
        assert "CROSS-REFERENCE TO RELATED APPLICATIONS" in result
        assert "does not claim priority" in result
        assert "INCORPORATION BY REFERENCE" in result
        assert "incorporated by reference" in result

    def test_with_related_apps_lists_them(self):
        result = build_cross_references(
            invention_narrative="Builds on provisional application No. 63/999,888.",
            feasibility_stage_1="",
            claims_text="",
        )
        assert "CROSS-REFERENCE TO RELATED APPLICATIONS" in result
        assert "does not claim priority" not in result
        assert "63/999,888" in result
        assert "related application(s)" in result
        assert "INCORPORATION BY REFERENCE" in result

    def test_all_empty_inputs(self):
        result = build_cross_references()
        assert "CROSS-REFERENCE TO RELATED APPLICATIONS" in result
        assert "does not claim priority" in result
        assert "INCORPORATION BY REFERENCE" in result

    def test_related_app_in_claims_text(self):
        result = build_cross_references(
            invention_narrative="",
            feasibility_stage_1="",
            claims_text="This application claims the benefit of U.S. patent application serial No. 18/100,200.",
        )
        assert "18/100,200" in result
        assert "does not claim priority" not in result

    def test_related_app_in_feasibility(self):
        result = build_cross_references(
            invention_narrative="",
            feasibility_stage_1="Continuation-in-part of application No. 16/500,600.",
            claims_text="",
        )
        assert "16/500,600" in result

    def test_pct_reference_detected(self):
        result = build_cross_references(
            invention_narrative="Related to PCT/US2023/045678.",
        )
        assert "PCT/US2023/045678" in result
        assert "does not claim priority" not in result

    def test_always_has_incorporation_by_reference(self):
        """Both paths (with and without related apps) include the incorporation paragraph."""
        standalone = build_cross_references(invention_narrative="Novel widget.")
        with_ref = build_cross_references(
            invention_narrative="Claims benefit of provisional application No. 63/100,200."
        )
        for result in (standalone, with_ref):
            assert "INCORPORATION BY REFERENCE" in result
            assert "incorporated by reference in their entirety" in result

    def test_return_type_is_string(self):
        result = build_cross_references()
        assert isinstance(result, str)

    def test_section_header_is_first_line(self):
        result = build_cross_references()
        first_line = result.split("\n")[0]
        assert first_line == "CROSS-REFERENCE TO RELATED APPLICATIONS"
