# 35 USC 112(a) — Written Description Check

Evaluate whether the specification (invention narrative + specification text) provides adequate written description support for each claim element.

## What to Check

For each claim:
1. Identify every element, limitation, and term in the claim
2. For each element, verify it is described in the specification
3. Flag elements that appear in claims but have no corresponding description
4. Check that the specification conveys that the inventor had possession of the claimed invention

## Rule Identifier

Use `rule: "112a_written_description"` for all results from this check.

## Common Issues

- Claim recites a component not mentioned in the specification
- Claim uses a term with no definition or explanation in the spec
- Claim scope is broader than what the specification describes
- New matter: claim element added after original filing with no spec support
- Functional language ("configured to", "adapted to") without structural support

## MPEP References

- MPEP 2163 — Guidelines for the Written Description Requirement
- MPEP 2163.02 — Standard for Determining Compliance
- MPEP 2163.05 — Changes to the Scope of Claims
