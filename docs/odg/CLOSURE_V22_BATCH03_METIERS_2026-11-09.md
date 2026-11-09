# V12.4 — V22: Three-métier Batch 03 (P11, P15, P6) + Batch 04 preparation (2026-11-09)

Records V21. ODG governs the full cycle. Guards are ODG capabilities; the technical provider only authored the authorized
wiring and validates nothing of its own (the independent assurer, a path distinct from the guard, validates separately).

## LOT COURANT — P11, P15, P6 (deeply qualified; 3 guards really executed)
Reuse the SAME orchestrator — **again ZERO orchestrator-core changes** (registry entries only). Each positive + negative
E2E, with a genuinely INDEPENDENT assurer (recompute/reconstitute via a path distinct from the guard) PROVEN to catch a
wrong ADMIT via a controlled falsification:

| Métier | domain | real guard | decisionOf | INDEPENDENT assurer (distinct path) | pos / neg | falsification caught |
|---|---|---|---|---|---|---|
| **P11** | document routing (STP) | `routeDocument` | `tier==STRAIGHT_THROUGH` | recompute STP eligibility from RAW doc features (parser/valid/findings/extraction) — not the guard's tier | clean⇒ADMIT · HIGH finding⇒REJECT | B11 ✓ (faked STP on a HIGH-finding doc ⇒ ASSURANCE_FAILED) |
| **P15** | workflow / saga | `runSaga` (input-adapted) | `status==COMMITTED` | reconstitute by re-evaluating each step's `forward(ctx)` in a distinct loop | all commit⇒ADMIT · a failed step (compensated)⇒REJECT | B15 ✓ (faked COMMITTED where a forward fails ⇒ ASSURANCE_FAILED) |
| **P6** | evaluation (F1) | `evaluate` (input-adapted) | `f1 ≥ threshold` | recompute F1 from RAW gold/predictions by own tp/fp/fn count — not `evaluate` | F1≥thr⇒ADMIT · below⇒REJECT | B6 ✓ (inflated F1 on poor predictions ⇒ ASSURANCE_FAILED) |

**Assurance level:** all three `independent` (§4). **Métier-specific resilience (§5):** P11 — a HUMAN_REVIEW/REJECT quarantine
**never becomes ADMIT** (decisionOf admits only STRAIGHT_THROUGH; the independent recompute re-confirms); P15 — the
assurer checks every forward reconstitutes as committed (a missing/incoherent commit ⇒ ASSURANCE_FAILED); P6 — a changed
score/threshold cannot yield an unjustified ADMIT (F1 recomputed from raw). Fixtures are **SYNTHETIC pure functions** — no
external/destructive operation is triggered (P15 forward/compensate are side-effect-free). Unblock nothing canonical.

**Qualification reached:** P11, P15, P6 = **EXECUTED + VERIFIED**. **Twelve métiers now E2E** (P3,P8,P9,P1,P12,P4,P2,P10,P13,P11,P15,P6).

## §6 — Framework learning (twelve métiers) incl. an identified common weakness
- **Common cadre still stable/generic:** 12 métiers integrated with NO orchestrator-core edits (registry entries only).
- **New contracts:** P15 introduces a **function-valued payload** (steps carry `forward`/`compensate` closures) — a new
  input shape the orchestrator handled without change.
- **Identified common weakness (evidence, not yet fixed — per the "change the core only with justification" rule):** the
  DEFAULT dedup digest `JSON.stringify({metier,payload})` **drops function-valued fields**, so for P15 two sagas with the
  same step ids but different `forward` functions would collide to the same digest ⇒ a false DUPLICATE if a caller passes
  `seenDigests`. **Not triggered by any current caller** (tests don't dedup P15). **Proposed justified fix for a later
  directive:** a per-métier `digestOf(payload)` registry field (P15 would digest step ids + ctx, not the closures). Logged
  here so the Boussole carries the finding; no rushed core change.
- **Reusable assurer patterns confirmed:** necessary-condition recompute (P11 eligibility), state reconstitution (P15
  forward re-eval), metric recompute from raw (P6 F1) — all distinct from the guard's own computation.

## LOT SUIVANT — Batch 04 prepared for V23 (audited, NOT executed)
| Métier | domain | real guard (audited) | verdict → decisionOf | independent assurer to build | pos / neg | prerequisites / risks |
|---|---|---|---|---|---|---|
| **P7** | SRE / SLO | `profession-p7-sre-reference.evaluateSLO` | SLO met/breached → ADMIT/REJECT | recompute the percentile/SLO from RAW latencies (not evaluateSLO) | within SLO ⇒ ADMIT; breached ⇒ REJECT | confirm evaluateSLO input (latencies + target); NB p7-burn-rate `evaluateAlert` FIRES alerts (does not gate) — use evaluateSLO |
| **P14** | devex | `profession-p14-devex-reference.scaffoldEvidence` | scaffold valid/complete → ADMIT/REJECT | recompute completeness from raw scaffold features | complete scaffold ⇒ ADMIT; missing ⇒ REJECT | confirm scaffoldEvidence verdict shape + what "valid" means |
| **P5** | decision-rules | **candidate** `decision-rules.ts` — **MUST be verified to cover P5's contract** | TBD after audit | TBD (distinct path) | rules satisfied ⇒ ADMIT; violated ⇒ REJECT | **P5 has NO dedicated p5-* guard** (benchmark-covered). V23 MUST confirm `decision-rules.ts` truly covers P5's métier requirements; if not, compose existing capabilities or flag honestly — **never artificially assign a non-covering guard** |

Each (except P5's caveat) plugs in as one registry entry + one test block; no orchestrator change expected.
**Execution deferred to V23.** Batch 04 is the FINAL batch — after it, all fifteen métiers would have an individual
E2E status (qualified or honestly flagged).

## Fifteen métier states
| | state |
|---|---|
| **P3,P8,P9,P1,P12,P4,P2,P10,P13,P11,P15,P6** | **EXECUTED + VERIFIED (12)** |
| P7, P14 | guard-VERIFIED; **Batch 04 prepared (V23)** |
| P5 | guard-VERIFIED (parity); **Batch 04 — guard coverage to be verified (no artificial assignment)** |

## Closure
Gate 404/404 (expanded metier-parcours suite, already gated); tsc clean; CI green on merge. §9 restrictions intact
(Truth Lock, 9 primitives, permissions, private VPS, no new public port, no net, no spend, no secret, no deletion; npm
globals untouched). Twelve métiers do NOT declare fifteen operational — three remain (prepared for V23).
