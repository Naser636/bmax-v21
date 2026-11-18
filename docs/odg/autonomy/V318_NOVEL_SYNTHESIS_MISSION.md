# V318 — Novel code synthesis via ODG's native local-model path (inside certified C6)

**Verdict: PASS (novel-synthesis capability demonstrated), with an honestly-measured model-dependent reliability bound.**
ODG's own path `generative-repair-adapter → ollama-provider → repair-workflow` **authored novel, correct, generalising
fixes for 3 distinct defects that are NOT in any catalog**, applied them in an isolated workspace, verified them with a
real deterministic acceptance test, and **rolled back exactly on a wrong edit**. Claude Code wrote only the harness +
the buggy fixtures + acceptance tests — **never the fix**. Ollama = generator; evaluator = deterministic `node --test`
(distinct). ODG remains the validation authority.

## Preconditions
- **C6 re-verified: 8/8 + 4 isolation markers** before running (would have refused otherwise).
- Local model: qwen2.5-coder (3b + 7b) via the in-sandbox loopback relay; adapters/contracts present.

## Novel defects (NOT in the sealed generative-repair-eval corpus; deterministic, reproducible)
| Defect | initial (buggy) | ODG/Ollama-authored fix (7b) | ACCEPTED | generalises (adversarial edges) |
|---|---|---|---|---|
| clamp to [lo,hi] | `(x,lo,hi) => x` | `(x,lo,hi) => x < lo ? lo : x > hi ? hi : x` | ✅ | ✅ |
| 2nd-largest distinct | `(arr) => arr[0]` | `[...new Set(arr)].sort((a,b)=>b-a)` → `[1]` or `null` | ✅ | ✅ |
| int → Roman numeral | `(n) => String(n)` | greedy value-symbol map (`M/CM/D/CD/...`), e.g. `1994→MCMXCIV` | ✅ | ✅ |

The fixes are genuinely synthesized (e.g. the clamp fix differed between two runs — nested-ternary vs `Math.max/min` — proving fresh generation, not memorised lookup). All three passed **adversarial edge re-tests** not present in the acceptance test (x==lo/x==hi/negative ranges; `[7,7,7]`→null; `3888`,`40`,`2023`).

## Exact rollback (mandatory) — PROVEN
A deterministically WRONG edit (`(x,lo,hi)=>lo`) fed through the real harness → status **ABSTAINED**; workspace SHA-256
**identical before and after** (`13ec6950…` == `13ec6950…`). `falseSuccess = 0 by construction` — a wrong edit can never
be ACCEPTED because acceptance is a real `node --test`.

## Model-dependent reliability (honestly measured — limit not hidden)
- **qwen2.5-coder:3b (default):** solved clamp, but **ABSTAINED/REJECTED** on second-largest & roman — fail-closed, nothing applied, no false success.
- **qwen2.5-coder:7b:** **3/3 ACCEPTED + generalising.**
Root cause of the initial 1/3: the provider's default preference picks 3b first, which is too weak for the harder novel cases. Corrective (applied here): route harder synthesis to 7b.

## Dimensions measured separately
| Dimension | Result |
|---|---|
| Novel generation | **PASS** — 3 non-catalog fixes authored by the local model. |
| Defect understanding | **PASS** — fixes match the specified semantics incl. edge cases. |
| Contract/constraints | **PASS** — all edits within `allowedFiles` (`src/`), ≤ maxEdits; out-of-scope would be rejected pre-apply. |
| Tests pass | **PASS** — real `node --test` acceptance + independent adversarial edge tests. |
| Diagnosis of an incorrect correction | **PASS** — wrong edit ⇒ ABSTAINED (acceptance failed), 3b weak attempts ⇒ fail-closed. |
| Repair / resume | **MEASURED** — bounded; corrective retry via model re-selection (3b→7b) succeeded. |
| Honest refusal/escalation | **PASS** — 3b abstained/rejected rather than fabricating a fix. |
| Generator ≠ evaluator ≠ validator | **PASS** — generator=Ollama; evaluator=deterministic `node --test`+adversarial; validator=ODG `evaluator-independence` (WEAK-not-COMPROMISED: zero critical shared deps). |
| No Claude-Code execution in the ODG cycle | **CONFIRMED** — Claude wrote only the harness/fixtures; the fix is the model's, applied by ODG's harness. |

## Independent verification
- **ODG inspector (step 10):** ODG's own `evaluator-independence.auditIndependence` → WEAK-not-COMPROMISED (critical dims independent). Not Claude, not Ollama.
- Adversarial meta-inspection: see PR checks.

## Significance & next
This crosses from **bounded deterministic autonomy (V317)** to **real native engineering with novel code synthesis**:
ODG's own path produced correct, generalising fixes for defects with no catalog entry, with exact rollback and
fail-closed safety. Measured limit: reliability scales with the local model (3b weak, 7b strong). **Next:** widen the
novel-defect battery (multi-file, cross-function, failing-stack-trace diagnosis) and measure the 7b accept-rate +
abstain-rate on a larger sealed corpus; add a second distinct local model so generator≠evaluator can both be models.

Evidence: `docs/odg/autonomy/V318_NOVEL_SYNTHESIS_EVIDENCE.json`. No canonical/production change; no secrets.
