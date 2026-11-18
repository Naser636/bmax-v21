# V317 — E2E native-autonomy mission inside the certified C6 sandbox

**Verdict: PARTIAL** — a complete, reproducible end-to-end engineering cycle was run **by ODG's own engine** inside
the certified C6 sandbox, independently evaluated by Ollama and validated by ODG's own independence module, with
**zero Claude-Code technical intervention in the cycle**. It is **PASS for the bounded deterministic class** and
**PARTIAL against general autonomy** (novel code synthesis still honestly escalates). Nothing fabricated; canonical
repo untouched. ODG remains the validation authority; Claude Code was technical provider only (harness + launch).

## Setup (honest division of labour)
- **Claude Code (host):** re-verified C6 (8/8 + 4 markers), compiled ODG's self-contained engine
  (`odg-native-engineering` + `odg-closed-executor`) to JS, staged it + a thin harness + the mission batch into the
  working copy `~/odg-sandbox-work/mission/` (NOT the canonical repo), launched the sandbox. Wrote **no fix**.
- **ODG's own engine** (`runNativeCycle`): routed/selected, generated, tested, diagnosed, repaired.
- **Ollama qwen2.5-coder** (in-sandbox relay): INDEPENDENT evaluator of ODG's output (not a generator).
- **ODG's own module** (`evaluator-independence.auditIndependence`): rendered the independence verdict.

## Mission batch (confied to ODG; ODG decided each)
| Mission | kind | injected fault | ODG verdict | tests | executor tags |
|---|---|---|---|---|---|
| m-sum-01 | sum | yes | **NATIVE_REPAIRED_GREEN** | 3/3 | ODG_NATIVE×10, HUMAN×1 |
| m-even-02 | isEven | yes | **NATIVE_REPAIRED_GREEN** | 3/3 | ODG_NATIVE×10, HUMAN×1 |
| m-max-03 | max | no | **NATIVE_GREEN** | 2/2 | ODG_NATIVE×9, HUMAN×1 |
| m-fib-04 | fibonacci | — | **ESCALATED_TO_PROVIDER** (honest) | — | ODG_NATIVE×4, CLAUDE×1, NOT_MEASURED×1 |

## Autonomy dimensions — measured separately
| Dimension | Result |
|---|---|
| Selection / decomposition | **MEASURED** — ODG routed 4 missions, correctly self-assessing which it could do natively (3) vs must escalate (1). Decomposition is the fixed native cycle (moderate). |
| Execution / modification | **STRONG** — ODG selected closed-registry ops and performed the faulty→canonical repair itself (2 repairs). |
| Test / diagnosis | **STRONG** — ODG generated example assertions, ran them via the closed executor (no eval), detected the seeded faults. |
| Repair / resume | **STRONG** — ODG proposed the mechanical correction and re-verified green (2/2 repaired). |
| Ollama independent review | **STRONG** — discriminated correctly on both: faulty→INCORRECT, repaired→CORRECT, with operator-specific reasoning ("'-' used instead of '+'", "checks if odd, not even"). Proven to examine, not rubber-stamp. |
| ODG final independent validation | **MEASURED** — `evaluator-independence` = **WEAK** (not COMPROMISED): zero critical shared deps (model/data/evaluator/evidence), WEAK only because builder and evaluator share the C6-sandbox environment. |
| No Claude-Code in the autonomous cycle | **CONFIRMED** — no `CLAUDE_CODE_EXECUTION` tag in any native cycle; Claude only wrote the harness/spec and launched. |

## Independent verification
- **ODG inspector (step 6):** ODG's own `evaluator-independence.auditIndependence` → WEAK-not-COMPROMISED (critical dims independent). Not Claude Code, not Ollama.
- **Adversarial meta-inspection:** confirmed the repair lives in ODG's engine (not the harness), both verdicts reproduce on an independent host run, Ollama's prompt forbids code-writing and it discriminated correctly, no secrets, no canonical mutation, and the artifacts do **not** over-claim general autonomy.

## Honest boundary
This is **bounded deterministic-catalog autonomy** (sum/max/isEven/clampNonNegative/absMinor): generate→test→diagnose→repair via a closed op-registry swap. **Novel code synthesis is NOT demonstrated** — ODG honestly escalates it (fibonacci → ESCALATED_TO_PROVIDER). This moves native autonomy from "pipeline VALIDATED / e2e NOT_MEASURED" to **"e2e MEASURED for the bounded class."**

## Next, more demanding e2e mission
Exercise the **ODG local-model path** (V283-B/C: `ollama-provider → generative-repair-adapter → repair-workflow`) where ODG's OWN local model **authors a novel fix** (not a catalog swap), applied in an isolated workspace, tested against real acceptance, **rolled back exactly on failure**, with a **distinct** independent evaluator (so the generator ≠ evaluator). That measures autonomy on *novel* code — the frontier this mission deliberately did not claim.
