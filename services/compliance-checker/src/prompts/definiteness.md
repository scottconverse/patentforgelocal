# 35 USC 112(b) — Definiteness Check

Evaluate whether each claim clearly defines the scope of the invention so that a person of ordinary skill in the art can understand what is claimed.

## What to Check

For each claim:
1. **Antecedent basis**: Every "the [noun]" or "said [noun]" must have a prior "a [noun]" or "an [noun]" introduction, either in this claim or in a parent claim it depends on.
2. **Relative terms**: Flag "substantially", "approximately", "about", "similar to" — these are WARN unless the specification defines them precisely.
3. **Functional language without structure**: "means for [function]" triggers 112(f) and requires corresponding structure in the specification.
4. **Ambiguous scope**: Terms that could reasonably be interpreted two different ways.
5. **Inconsistent terminology**: Same element called different names in different claims.
6. **Dangling dependencies**: Dependent claims referencing a parent that doesn't exist.

## Rule Identifier

Use `rule: "112b_definiteness"` for all results from this check.

## MPEP References

- MPEP 2173 — Claims Must Particularly Point Out and Distinctly Claim
- MPEP 2173.02 — Clarity and Precision
- MPEP 2173.05(a) — New Terminology
- MPEP 2173.05(b) — Relative Terminology
- MPEP 2173.05(d) — Exemplary Claim Language ("such as", "for example")
- MPEP 2173.05(e) — Lack of Antecedent Basis
