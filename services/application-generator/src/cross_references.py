"""
Cross-references section builder for patent applications.

Constructs the CROSS-REFERENCE TO RELATED APPLICATIONS section from
existing pipeline input state. No LLM call — purely template-based.
"""

from __future__ import annotations

import re


# Patterns that suggest the narrative mentions related/prior applications
_PRIOR_APP_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"provisional\s+(?:patent\s+)?application\s+(?:no\.?\s*)?(\d[\d/,\-]+)", re.IGNORECASE),
    re.compile(r"(?:U\.?S\.?\s+)?(?:patent\s+)?application\s+(?:(?:serial\s+)?no\.?\s*)?(\d{2}/[\d,]+)", re.IGNORECASE),
    re.compile(r"continuation(?:-in-part)?\s+of\s+.*?(?:no\.?\s*)?(\d{2}/[\d,]+)", re.IGNORECASE),
    re.compile(r"claims?\s+(?:the\s+)?(?:benefit|priority)\s+(?:of|to)\s+.*?(\d{2}/[\d,]+)", re.IGNORECASE),
    re.compile(r"PCT[/ ](?:US|[A-Z]{2})\d{2,4}/\d+", re.IGNORECASE),
]


def _extract_related_applications(text: str) -> list[str]:
    """
    Scan text for mentions of related patent applications.

    Returns de-duplicated list of matched strings (the full match, not just
    the group) so the caller can present them in context.  When one match
    is a substring of another, only the longer (more specific) match is kept.
    """
    if not text:
        return []

    raw: list[str] = []
    for pattern in _PRIOR_APP_PATTERNS:
        for match in pattern.finditer(text):
            raw.append(match.group(0).strip())

    # De-duplicate: if match A is a substring of match B, keep only B.
    # First, sort longest-first so we can skip substrings efficiently.
    raw_sorted = sorted(raw, key=len, reverse=True)
    kept: list[str] = []
    kept_lower: list[str] = []
    for candidate in raw_sorted:
        cl = candidate.lower()
        # Skip if this candidate is a substring of an already-kept match
        if any(cl in k for k in kept_lower):
            continue
        kept.append(candidate)
        kept_lower.append(cl)

    # Return in the order they first appeared in the text
    order = {m.lower(): text.lower().index(m.lower()) for m in kept}
    kept.sort(key=lambda m: order.get(m.lower(), 0))
    return kept


def build_cross_references(
    invention_narrative: str = "",
    feasibility_stage_1: str = "",
    claims_text: str = "",
) -> str:
    """
    Build the CROSS-REFERENCE TO RELATED APPLICATIONS section.

    Scans the invention narrative, first feasibility stage, and claims text
    for mentions of related applications.  If found, lists them.  If not,
    outputs the standard standalone-application statement.

    Always appends an INCORPORATION BY REFERENCE paragraph.

    Returns the full section text ready for insertion into the application.
    """
    # Combine all available context for scanning
    combined = "\n\n".join(filter(None, [invention_narrative, feasibility_stage_1, claims_text]))

    related = _extract_related_applications(combined)

    lines: list[str] = []
    lines.append("CROSS-REFERENCE TO RELATED APPLICATIONS")
    lines.append("")

    if related:
        lines.append(
            "This application claims priority to or the benefit of the following "
            "related application(s):"
        )
        lines.append("")
        for ref in related:
            lines.append(f"  - {ref}")
        lines.append("")
    else:
        lines.append(
            "This application does not claim priority to or benefit of any prior application."
        )
        lines.append("")

    lines.append("INCORPORATION BY REFERENCE")
    lines.append("")
    lines.append(
        "All references cited herein are incorporated by reference in their entirety."
    )

    return "\n".join(lines)
