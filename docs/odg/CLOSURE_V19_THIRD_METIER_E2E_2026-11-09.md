# V12.4 — V19: Third métier E2E (P9) + independent-assurance generalization (2026-11-09)

Records V18. Third distinct métier (P9 finops) driven by the SAME orchestrator with its own real guard and a genuinely
independent assurer. Three parcours do NOT qualify the twelve others.

## §1 — ODG selection + justification
Among P1/P9/P12, ODG selected **P9 (finops / unit economics)**: domain-distinct from P3 (supply-chain) and P8 (release),
and its decision rests on **arithmetic** that an independent assurer can recompute by a DIFFERENT path (§4) — the cleanest
genuinely-independent check of the three. Real gap: P9 parcours not yet E2E.

## §2 — Common architecture audit + a contract gap found & fixed
Common (really executed, identical for all métiers): réception · identification (registry) · permission (deny-by-default)
· résolution du guard (lazy require of the REAL guard) · déduplication · exécution · assurance indépendante · décision ·
audit+clôture · récupération. Variations stay explicit in the registry: input contract, verdict shape, `decisionOf`,
independent `assure`, closure conditions. **No business logic duplicated.**
- **Contract gap FOUND + FIXED:** `decisionOf(verdict)` could not see the payload, but P9's decision needs the budget
  threshold carried in the request. Extended to **`decisionOf(verdict, payload)`** (P3/P8 ignore the 2nd arg — unchanged).
  This is a real contract correction, not a mask.

## §3/§4 — Third parcours E2E: P9 via the REAL `p9-unit-economics.unitEconomics` (positive + negative)
Same orchestrator; registry entry declares the legitimate variation. Live (synthetic fixtures, flagged, unblock nothing
canonical):
- **positive:** €40 / 100 successes, budget €0.60 ⇒ €0.40/success ≤ budget ⇒ **CLOSED / ADMIT**;
- **negative (over budget):** €80 / 100 successes, budget €0.60 ⇒ €0.80/success > budget ⇒ **CLOSED / REJECT**;
- **negative (not viable):** 0 successes ⇒ no unit economic ⇒ **CLOSED / REJECT**.
Every step traced; fail-closed guarantees intact.

## §4 — Independent assurance (qualified levels, not reproducibility)
P9's assurer **recomputes cost-per-success by raw arithmetic** (`observedCostEur / successes`) — a DIFFERENT path than
`unitEconomics` — and refuses an ADMIT that violates `successes>0 AND recomputed ≤ budget`. **Catches a real guard error
(A5):** a synthetic guard faking a cheap-viable econ for an over-budget payload ⇒ **ASSURANCE_FAILED** (no closure on a
contradiction). The `assurance` field reports the real level: all three métiers now `independent` (P3/P8 regression A3
retained; P9 A5 new). `injected`/`reproducibility` remain honestly labelled fallbacks.

## §5 — Generalization (P3 vs P8 vs P9)
| aspect | P3 supply-chain | P8 release | P9 finops |
|---|---|---|---|
| guard (real) | vetDependency | enforce | unitEconomics |
| verdict shape | `{decision}` | `{ok,verdict}` | econ object |
| decisionOf | identity | ok→ADMIT | viable+withinBudget (uses payload) |
| independent assurer | pinned∧¬typosquat∧integrity | rank(actual)≥rank(required) | recompute €/success ≤ budget |
| catches a wrong ADMIT | A3 ✓ | by construction | A5 ✓ |
- **Common responsibilities:** the orchestrator (generic, no hardcoded métier). **Legitimate variations:** the 5 registry
  fields above. **Assurer quality:** all three genuinely independent (distinct path + each catches a relevant error).
- **Coupling risk:** none observed — registry entries are independent; a broken guard fails only its own métier
  (CAPABILITY_UNAVAILABLE), preserving métier isolation. **Not generalized prematurely to fifteen.**

## §6 — Résilience (real failures only; all preserved)
PERMISSION_REFUSED · CAPABILITY_UNAVAILABLE · UNKNOWN_METIER · EXECUTION_FAILED · INVALID_RESULT · ASSURANCE_FAILED (P9
A5) · DUPLICATE · CLOSURE_FAILED. No silent closure; no execution without permission; no positive decision without
independent assurance; no unsignalled evidence loss.

## §8 — Fifteen métier states
| | guard-level | full parcours E2E |
|---|---|---|
| **P3, P8, P9** | VERIFIED | **EXECUTED + VERIFIED** |
| P1,P2,P4,P5,P6,P7,P10–P15 | VERIFIED-as-guard (parity 15/15) | NOT yet E2E (honest) |

## Closure
Gate 404/404 (expanded metier-parcours suite, already in the gate); tsc clean; CI green on merge. §7 restrictions intact
(Truth Lock, 9 primitives, permissions, private VPS, no new public port, no net, no spend, no secret, no deletion).
Next technically-executable gaps: P1 (semantic-regression) / P12 (circuit-breaker/idempotency) — each plugs in as a
registry entry, one per cycle; ODG selects next per the real gap.
