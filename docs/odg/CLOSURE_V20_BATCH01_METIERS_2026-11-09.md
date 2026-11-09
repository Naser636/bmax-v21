# V12.4 — V20: Three-métier Batch 01 (P1, P12, P4) + Batch 02 preparation (2026-11-09)

Records V19. Qualifies a BATCH of three métiers deeply on the SAME orchestrator and prepares the next three — without
anticipating their execution.

## LOT COURANT — P1, P12, P4 (deeply qualified)
ODG selected P1 and P12 (the V19-flagged candidates) + **P4 (data/distribution-drift)** as the third (a distinct domain
with a genuinely independent cross-metric). All reuse `metier-parcours.ts` (no business logic duplicated, no parallel
service). Live positive + negative, each with a genuinely independent assurer PROVEN to catch a wrong ADMIT:

| Métier | domain | real guard | decisionOf | independent assurer (distinct path) | positive / negative | catches wrong ADMIT |
|---|---|---|---|---|---|---|
| **P1** | quality / semantic-regression | `assess` | `safe?ADMIT:REJECT` | direct output-set comparison (not captureBaseline) | SAFE⇒ADMIT · changed held-out output⇒REJECT | B1 ✓ (faked SAFE on changed output ⇒ ASSURANCE_FAILED) |
| **P12** | resilience / circuit-breaker | `evaluateBreaker` | `admit?ADMIT:REJECT` | recompute failureRate=(FAIL+SLOW)/n (not burnRate) | healthy⇒ADMIT · tripped⇒REJECT | B12 ✓ (faked admit of a tripped breaker ⇒ ASSURANCE_FAILED) |
| **P4** | data / distribution-drift | `assessDrift` (input-adapted) | `gate==PASS?ADMIT:REJECT` | total-variation distance (distinct metric from PSI) | identical⇒ADMIT · gross shift⇒REJECT | B4 ✓ (faked PASS on a gross shift ⇒ ASSURANCE_FAILED) |

**Assurance level:** all three report `independent` (genuine, per §3 — not reproducibility). **Legitimate variation:** P4
needed an **input adapter** (its guard takes positional `(reference,current,opts)`) — placed in the registry `resolve`
(the "contrat d'entrée" variation), not a logic rewrite. **Resilience (§6):** all V17/V18/V19 terminal stages preserved
(PERMISSION_REFUSED / CAPABILITY_UNAVAILABLE / UNKNOWN_METIER / EXECUTION_FAILED / INVALID_RESULT / ASSURANCE_FAILED /
DUPLICATE / CLOSURE_FAILED); métier isolation intact (a broken guard fails only its own métier). Fixtures synthetic,
unblock nothing canonical, no false real proof.

**Qualification level reached:** P1, P12, P4 = **EXECUTED + VERIFIED** (full parcours, independent assurance proven to
catch a real error). Six métiers now E2E (P3, P8, P9, P1, P12, P4).

## LOT SUIVANT — Batch 02 prepared for V21 (audited, NOT executed)
ODG-selected next three, with exploitable technical preparation (so V21 resumes without re-auditing):

| Métier | domain | real guard(s) | verdict → decisionOf | independent assurer to build (distinct path) | positive / negative scenario | prerequisites / risks |
|---|---|---|---|---|---|---|
| **P2** | AI / reliability | `passAtK`, `reliable` | `reliable(...)` bool → ADMIT/REJECT | recompute pass@k arithmetic independently of `reliable` | k successes over n attempts ≥ target ⇒ ADMIT; below ⇒ REJECT | confirm `reliable` input shape (threshold in payload) |
| **P10** | regulatory / incident | `assessIncidentDeadline`, `addDaysUTC` | deadline met/breached → ADMIT/REJECT | recompute the deadline date via a direct day-count (not `addDaysUTC`) | report within window ⇒ ADMIT; past deadline ⇒ REJECT | date fixtures must be fixed strings (no Date.now); timezone = UTC |
| **P13** | sustainability | `carbonIntensity`, `withinCarbonBudget` | within budget → ADMIT/REJECT | recompute gCO2/unit arithmetic (distinct from `carbonIntensity`) | intensity ≤ budget ⇒ ADMIT; over ⇒ REJECT | budget threshold carried in payload (uses decisionOf(verdict,payload)) |

Common reusable: the orchestrator + registry pattern + decisionOf(verdict,payload) + independent-assurer discipline + the
fail-closed resilience set — all already in place. Each of P2/P10/P13 plugs in as ONE registry entry + one test block.
No new service, no architecture change expected. **Execution deferred to V21.**

## Fifteen métier states
| | E2E |
|---|---|
| **P3, P8, P9, P1, P12, P4** | EXECUTED + VERIFIED (6) |
| P2, P10, P13 | guard-VERIFIED; **Batch 02 prepared (V21)** |
| P5, P6, P7, P11, P14, P15 | guard-VERIFIED (parity 15/15); not yet batched |

## Closure
Gate 404/404 (expanded metier-parcours suite, already gated); tsc clean; CI green on merge. §7 restrictions intact
(Truth Lock, 9 primitives, permissions, private VPS, no new public port, no net, no spend, no secret, no deletion; npm
globals untouched). Six métiers do NOT declare fifteen operational — nine remain (three prepared for V21).
