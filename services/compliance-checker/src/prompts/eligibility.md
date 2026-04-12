# 35 USC 101 — Patent Eligibility Check (Alice/Mayo)

Evaluate whether each independent claim is directed to patent-eligible subject matter under the Alice/Mayo two-step framework.

## The Two-Step Test

**Step 1 — Abstract Idea?**
Is the claim directed to an abstract idea, law of nature, or natural phenomenon?
Categories of abstract ideas:
- Mathematical concepts (formulas, calculations, algorithms)
- Methods of organizing human activity (contracts, advertising, social activities)
- Mental processes (observation, evaluation, judgment that could be performed in the human mind)

If NOT directed to an abstract idea → PASS (stop here).

**Step 2 — Significantly More?**
If directed to an abstract idea, does the claim recite additional elements that amount to "significantly more" than the abstract idea itself?
Elements that are NOT significantly more:
- Adding "on a computer" or "using a processor"
- Mere data gathering
- Selecting by type or source of data
- Generic computer implementation
Elements that ARE significantly more:
- Specific technical improvement to computer functionality
- Specific machine or transformation
- Unconventional combination of steps
- Specific application of the abstract idea

## Rule Identifier

Use `rule: "101_eligibility"` for all results from this check.

## Special Notes

- Only check INDEPENDENT claims (dependent claims inherit parent's eligibility)
- AI/ML inventions are particularly susceptible to 101 rejections
- Physical/hardware elements strengthen eligibility arguments
- Generate WARN for claims that pass Step 1 narrowly

## MPEP References

- MPEP 2106 — Patent Subject Matter Eligibility
- MPEP 2106.04 — Abstract Idea
- MPEP 2106.05 — Significantly More (Step 2B)
- Alice Corp. v. CLS Bank International, 573 U.S. 208 (2014)
