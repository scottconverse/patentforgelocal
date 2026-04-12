"""
Claim text parser — extracts structured Claim objects from raw AI-generated text.

Handles the standard claim format:
  1. (Independent - Broad - Method) A method comprising: ...
  2. (Dependent on 1) The method of claim 1, wherein ...
"""

from __future__ import annotations
import logging
import re

from .models import Claim

logger = logging.getLogger(__name__)

MAX_CLAIM_TEXT_LENGTH = 5000


def parse_claims(raw_text: str) -> list[Claim]:
    """
    Parse raw claim text into structured Claim objects.
    Handles numbered claims with optional metadata annotations.
    """
    claims: list[Claim] = []

    # Strip AI-appended revision notes that appear after claims.
    # Look for markdown horizontal rules (---) or H2 headings (## ) that are NOT
    # claim headings, and truncate everything from the first such marker onward.
    raw_text = _strip_trailing_notes(raw_text)

    # Try two formats:
    # Format A: "### CLAIM 1 (metadata)\n\nClaim text..."  (markdown heading)
    # Format B: "1. (metadata) Claim text..."  (numbered list)
    heading_pattern = re.compile(
        r'#{1,4}\s*CLAIM\s+(\d+)\s*\(([^)]+)\)\s*\n+(.*?)(?=\n#{1,4}\s*CLAIM\s+\d+|\n---|\n##\s|\Z)',
        re.DOTALL | re.IGNORECASE,
    )

    heading_matches = list(heading_pattern.finditer(raw_text))
    if heading_matches:
        # Format A: heading-based claims
        for match in heading_matches:
            num = int(match.group(1))
            meta_raw = match.group(2)
            body = match.group(3).strip()
            # Merge meta into body for unified processing below
            body = f"({meta_raw}) {body}"
    else:
        # Format B: numbered claims — use original regex
        pass

    # Unified pattern for both formats
    if heading_matches:
        entries = [(int(m.group(1)), f"({m.group(2)}) {m.group(3).strip()}") for m in heading_matches]
    else:
        numbered_pattern = re.compile(
            r'(?:^|\n)\s*(?:Claim\s+)?(\d+)\.\s*(.*?)(?=\n\s*(?:Claim\s+)?\d+\.\s|\Z)',
            re.DOTALL,
        )
        entries = [(int(m.group(1)), m.group(2).strip()) for m in numbered_pattern.finditer(raw_text)]

    for num, body in entries:

        # Extract metadata from parenthetical annotations
        # e.g., "(Independent - Broad - Method)" or "(Dependent on 1)"
        claim_type = "INDEPENDENT"
        scope_level = None
        statutory_type = None
        parent_num = None

        meta_match = re.match(r'\(([^)]+)\)\s*', body)
        if meta_match:
            meta = meta_match.group(1).lower()
            body = body[meta_match.end():].strip()

            if "independent" in meta:
                claim_type = "INDEPENDENT"
            elif "dependent" in meta:
                claim_type = "DEPENDENT"
                parent_ref = re.search(r'(?:on|of)\s+(?:claim\s+)?(\d+)', meta)
                if parent_ref:
                    parent_num = int(parent_ref.group(1))

            if "broad" in meta:
                scope_level = "BROAD"
            elif "medium" in meta:
                scope_level = "MEDIUM"
            elif "narrow" in meta:
                scope_level = "NARROW"

            if "method" in meta:
                statutory_type = "method"
            elif "system" in meta:
                statutory_type = "system"
            elif "apparatus" in meta:
                statutory_type = "apparatus"
            elif "crm" in meta or "computer" in meta or "medium" in meta:
                statutory_type = "crm"

        # Infer dependent claims from "The method/system of claim N" pattern
        # Only if metadata didn't already classify this claim
        if claim_type == "INDEPENDENT" and not meta_match:
            dep_match = re.match(
                r'The\s+(?:method|system|apparatus|medium|device|composition)\s+of\s+claim\s+(\d+)',
                body,
                re.IGNORECASE,
            )
            if dep_match:
                claim_type = "DEPENDENT"
                parent_num = int(dep_match.group(1))

        # Clean up the text
        text = re.sub(r'\s+', ' ', body).strip()

        if text and _is_valid_claim_text(text):
            claims.append(Claim(
                claim_number=num,
                claim_type=claim_type,
                scope_level=scope_level if claim_type == "INDEPENDENT" else None,
                statutory_type=statutory_type,
                parent_claim_number=parent_num,
                text=text,
            ))
        elif text:
            logger.debug("Skipping non-claim item %d: %.80s…", num, text)

    # Fix duplicate numbering (e.g. Haiku outputting multiple "Claim 1" entries).
    # Renumber all claims sequentially 1..N, then fix parent references.
    has_dupes = len({c.claim_number for c in claims}) < len(claims)
    if has_dupes:
        old_to_new: dict[int, int] = {}
        for idx, c in enumerate(claims):
            new_num = idx + 1
            # Track first occurrence mapping (parent refs point to original numbers)
            if c.claim_number not in old_to_new:
                old_to_new[c.claim_number] = new_num
            c.claim_number = new_num

        # Update parent references using the mapping
        for c in claims:
            if c.parent_claim_number is not None and c.parent_claim_number in old_to_new:
                c.parent_claim_number = old_to_new[c.parent_claim_number]

    # Enforce max claim text length
    for c in claims:
        if len(c.text) > MAX_CLAIM_TEXT_LENGTH:
            logger.warning(
                "Claim %d text is %d chars — truncating to %d",
                c.claim_number, len(c.text), MAX_CLAIM_TEXT_LENGTH,
            )
            c.text = c.text[:MAX_CLAIM_TEXT_LENGTH] + " [...text truncated]"

    return claims


def _strip_trailing_notes(raw_text: str) -> str:
    """
    Remove AI-appended sections (revision notes, summaries, assessments) that
    appear after the last claim.

    Stop markers (lines that trigger truncation):
      - ``---``                     horizontal rule
      - ``## `` through ``######``  markdown headings (excluding claim headings)
      - ``**<Word>``                bold-formatted section headers (e.g. **Note:**, **Strategy**)
    """
    # Identify positions of all claim-like starts so we know where
    # "after the last claim" begins.
    claim_starts = [
        m.start()
        for m in re.finditer(
            r'(?:^|\n)(?:#{1,4}\s*CLAIM\s+\d+|(?:Claim\s+)?\d+\.)',
            raw_text,
            re.IGNORECASE,
        )
    ]
    if not claim_starts:
        return raw_text  # No claims found — nothing to strip

    after_last_claim = claim_starts[-1]

    # Expanded stop markers: ---, any markdown heading (##-######), or bold
    # section-header lines (e.g. **Note:**, **Revision Notes**, **Strategy:**).
    stop_pattern = re.compile(r'^(?:---|#{2,}\s|\*\*[A-Z])', re.MULTILINE)
    for m in stop_pattern.finditer(raw_text, after_last_claim):
        line_text = raw_text[m.start():].split('\n', 1)[0]
        # Skip lines that ARE claim headings (e.g. ### CLAIM 3)
        if re.match(r'^#{1,4}\s*CLAIM\s+\d+', line_text, re.IGNORECASE):
            continue
        return raw_text[:m.start()].rstrip()

    return raw_text


# Blocklist of words/phrases that definitively open non-claim text.
# Using a blocklist (rather than an allowlist of valid openers) ensures that
# unusual but legitimate claim formats — e.g. "In a method...", "According to
# one embodiment...", "What is claimed is..." — are never falsely rejected.
# False negatives (letting through a note) are preferable to false positives
# (dropping a real claim the user would have to re-draft).
_NOT_CLAIM_OPENER = re.compile(
    r'^(?:Consider|Note[:\s]|Strategy[:\s]|Evidence[:\s]|Revision[:\s]|Assessment[:\s]|'
    r'Summary[:\s]|See\s|Review[:\s]|Suggestion[:\s]|Recommendation[:\s]|'
    r'Important[:\s]|Please\s|Based\s+on|This\s+(?:claim|set)|These\s+claims|'
    r'The\s+following|Draft\s+note|Key\s+revision|Claim\s+summary)',
    re.IGNORECASE,
)


def _is_valid_claim_text(text: str) -> bool:
    """Return True if *text* could be valid patent claim language.

    Rejects text whose opening word(s) are clearly non-claim (notes, strategy
    items, summaries).  Any text not matched by the blocklist is assumed to be
    a claim — including unusual-but-valid openers such as "In a method...",
    "According to one embodiment...", or "What is claimed is...".
    """
    return not bool(_NOT_CLAIM_OPENER.match(text.strip()))
