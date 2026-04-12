# MPEP 608 — Formalities Check

Evaluate whether the claims follow USPTO formal requirements for patent claim drafting.

## What to Check

1. **Single sentence**: Each claim must be a single sentence (period only at the end).
2. **Claim numbering**: Claims must be numbered consecutively starting from 1.
3. **Dependency chains**: Dependent claims must reference a prior claim. Chains deeper than 3 levels are valid but generate a WARN.
4. **Preamble-body structure**: Independent claims should have a preamble ("A method for...") and a body ("comprising: ...").
5. **Transitional phrases**: Check for proper use of "comprising" (open-ended), "consisting of" (closed), "consisting essentially of" (semi-closed).
6. **Proper dependency format**: Dependent claims should start with "The [preamble of parent] of claim [N]" or "The [preamble] according to claim [N]".
7. **No duplicate claims**: Flag claims that are substantively identical.
8. **Independent claim count**: More than 3 independent claims generates a WARN (USPTO surcharge at 4+).

## Rule Identifier

Use `rule: "mpep_608_formalities"` for all results from this check.

## MPEP References

- MPEP 608.01(m) — Form of Claims
- MPEP 608.01(n) — Dependent Claims
- MPEP 608.01(i) — Numbering of Claims
- 37 CFR 1.75 — Claim Requirements
