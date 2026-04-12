"""
USPTO formatting: paragraph numbering and IDS table generation.
"""

from __future__ import annotations
from .models import PriorArtItem


def apply_paragraph_numbering(text: str, start: int = 1) -> tuple[str, int]:
    """
    Apply USPTO paragraph numbering [NNNN] to each paragraph.
    Strips markdown headers and inline formatting before numbering.
    """
    if not text or not text.strip():
        return "", start

    # Strip markdown headers (lines starting with #)
    lines = text.split("\n")
    cleaned_lines = [line for line in lines if not line.strip().startswith("#")]
    text = "\n".join(cleaned_lines)

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    numbered = []
    num = start
    for para in paragraphs:
        numbered.append(f"[{num:04d}] {para}")
        num += 1
    return "\n\n".join(numbered), num


def format_ids_table(items: list[PriorArtItem]) -> str:
    """
    Format prior art results as an Information Disclosure Statement table.

    Returns empty string if no items.
    """
    if not items:
        return ""

    lines = []
    lines.append("| Ref | Patent/Publication Number | Title |")
    lines.append("|-----|--------------------------|-------|")
    for i, item in enumerate(items, 1):
        title = item.title[:120] + "..." if len(item.title) > 120 else item.title
        lines.append(f"| {i} | {item.patent_number} | {title} |")
    return "\n".join(lines)
