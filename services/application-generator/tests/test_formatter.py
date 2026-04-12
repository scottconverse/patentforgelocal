"""Tests for USPTO paragraph numbering and IDS table formatting."""

from src.formatter import apply_paragraph_numbering, format_ids_table
from src.models import PriorArtItem


class TestParagraphNumbering:
    def test_single_section(self):
        text = "First paragraph.\n\nSecond paragraph."
        result, next_num = apply_paragraph_numbering(text, start=1)
        assert result == "[0001] First paragraph.\n\n[0002] Second paragraph."
        assert next_num == 3

    def test_continuity_across_sections(self):
        bg = "Background paragraph."
        summary = "Summary paragraph."
        bg_result, next_num = apply_paragraph_numbering(bg, start=1)
        summary_result, next_num2 = apply_paragraph_numbering(summary, start=next_num)
        assert bg_result == "[0001] Background paragraph."
        assert summary_result == "[0002] Summary paragraph."
        assert next_num2 == 3

    def test_empty_section(self):
        result, next_num = apply_paragraph_numbering("", start=1)
        assert result == ""
        assert next_num == 1

    def test_single_paragraph(self):
        result, next_num = apply_paragraph_numbering("One paragraph only.", start=5)
        assert result == "[0005] One paragraph only."
        assert next_num == 6

    def test_strips_existing_whitespace(self):
        text = "  Padded paragraph.  \n\n  Another.  "
        result, next_num = apply_paragraph_numbering(text, start=1)
        assert "[0001] Padded paragraph." in result
        assert "[0002] Another." in result

    def test_strips_markdown_headers(self):
        text = "# Background\n\nFirst paragraph.\n\n## History\n\nSecond paragraph."
        result, next_num = apply_paragraph_numbering(text, start=1)
        assert "# Background" not in result
        assert "## History" not in result
        assert "[0001] First paragraph." in result
        assert "[0002] Second paragraph." in result
        assert next_num == 3


class TestIdsTable:
    def test_formats_prior_art_items(self):
        items = [
            PriorArtItem(patent_number="US10123456", title="Widget System", abstract="A widget"),
            PriorArtItem(patent_number="US20200012345", title="Gadget Method", abstract="A gadget"),
        ]
        table = format_ids_table(items)
        assert "US10123456" in table
        assert "Widget System" in table
        assert "US20200012345" in table
        assert "Gadget Method" in table
        assert "Ref" in table

    def test_empty_list(self):
        table = format_ids_table([])
        assert table == ""

    def test_truncates_long_titles(self):
        items = [PriorArtItem(patent_number="US1", title="A" * 200)]
        table = format_ids_table(items)
        assert len(table) > 0
        assert "US1" in table
