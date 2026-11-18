# V319b — larger-corpus accept-rate + abstain failure-mode taxonomy (inside certified C6)

**Verdict: PARTIAL — an honest, richer measurement of the capability boundary.** ODG's own path (generator
`qwen2.5-coder:7b`) ran an 8-case harder novel corpus inside the certified C6 sandbox (C6 re-verified 8/8 first).
Claude Code wrote only the harness + buggy fixtures + acceptance tests — never a fix. Deterministic `node --test`
was the primary gate; a distinct `qwen2.5-coder:3b` model was the independent LLM evaluator; the generator was
TEE'd so rolled-back abstains could be diagnosed.

## Result (8-case corpus)
| metric | value |
|---|---|
| accepted | 7/8 (**acceptRate 0.875**) |
| **truly generalising** (accepted AND passed independent adversarial edge tests) | **6/8 (0.75)** |
| abstained | 1 (gcd) — fail-closed, exact rollback |
| rejected | 0 |
| distinct-3b evaluator agreed CORRECT | 7/7 accepted |
| accept by difficulty | easy 2/2 · med 2/3 · hard 3/3 |

## Honest findings (the value of this run)
1. **Overfit caught only by adversarial holdout.** `iso-week` (ISO-8601 week number, hard) was **ACCEPTED** by the
   declared acceptance gate — it passed all 3 declared assertions — but **FAILED my independent adversarial edge test**
   (`2021-01-01` → week 53), i.e. it overfit the given cases. The harness behaved correctly (accept iff declared
   acceptance passes); the adversarial holdout is what exposed the overfit. **Lesson: declared acceptance alone is
   insufficient on hard cases; private adversarial holdouts are essential.**
2. **The LLM evaluator missed the overfit.** The distinct 3b model judged `iso-week` CORRECT — so an LLM judge is NOT a
   substitute for a deterministic adversarial test. (It agreed on all 7 accepted, including the overfit one.)
3. **Abstain failure mode = syntax-error** (1/1): `gcd` — the model's output was a truncated/malformed `module.exports=`
   proposal; ODG parsed it, applied, acceptance failed, **rolled back exactly** (no false success).

## Aggregate across V319 (6 cases) + V319b (8 cases) = 14 distinct novel defects
| metric | value |
|---|---|
| accepted | **11/14 (0.786)** |
| truly generalising | **10/14 (0.714)** |
| rejected | 0 · abstains all restored exactly |

## Separation (preserved)
Generator `qwen2.5-coder:7b`; independent evaluators = deterministic `node --test` (primary) + adversarial edge
re-tests + distinct `qwen2.5-coder:3b`; ODG `evaluator-independence` WEAK-not-COMPROMISED; zero Claude-Code in the cycle.

## Honest boundary
On a harder, graded novel corpus the 7b local model lands an **accept-rate ≈ 0.79 and a truly-generalising rate ≈ 0.71**
(n=14). Hard cases carry **overfit risk** that only adversarial holdouts (not an LLM judge) catch, and malformed output
is a real abstain mode — both handled fail-closed with exact rollback. This is model- and difficulty-dependent, a narrow
battery, NOT a general-purpose guarantee.

## Operational note (reproducibility)
A back-to-back second launch correctly **refused** with "Ollama socket already exists" because the prior sandbox still
held the loopback relay socket — a safe fail-closed re-run conflict. Allow the prior isolated session to fully exit
before relaunching.

Evidence: `docs/odg/autonomy/V319B_CORPUS_TAXONOMY_EVIDENCE.json`. No canonical/production change; no secrets.
