# V12.4 — V21: Three-métier Batch 02 (P2, P10, P13) + Batch 03 preparation (2026-11-09)

Records V20. ODG governs the full cycle: selection, authorization, orchestration (its canonical `metier-parcours.ts`),
independent assurance, validation, closure. The guards are ODG capabilities; the technical provider only authored the
wiring ODG authorized — it decides no admission and validates no output of its own (the independent assurer, a path
distinct from the guard, performs validation separately from execution).

## LOT COURANT — P2, P10, P13 (deeply qualified; 3 guards really executed)
Reuse the SAME orchestrator (NO orchestrator-core change — only registry entries; evidence the common cadre is generic).
Each positive + negative E2E, with a genuinely INDEPENDENT assurer that **recomputes from raw data via a path distinct
from the guard** and is PROVEN to catch a wrong ADMIT:

| Métier | domain | real guard | decisionOf | INDEPENDENT assurer (distinct path, no guard-compute reuse) | pos / neg | catches wrong ADMIT |
|---|---|---|---|---|---|---|
| **P2** | AI / reliability | `passAtK` (+`reliable`) | `reliable(report,threshold)` | recompute pass@k from RAW rollouts (own loop, k=min len, all-pass ratio) | pass@k≥thr⇒ADMIT · flaky⇒REJECT | B2 ✓ (inflated pass@k on flaky rollouts ⇒ ASSURANCE_FAILED) |
| **P10** | regulatory / incident | `assessIncidentDeadline` | `verdict==REPORTED_ON_TIME` | recompute due date by DIRECT `Date.UTC`+ms arithmetic — **not** `addDaysUTC` | on-time⇒ADMIT · overdue⇒REJECT | B10 ✓ (faked ON_TIME for a late report ⇒ ASSURANCE_FAILED) |
| **P13** | sustainability | `carbonIntensity` (+`withinCarbonBudget`) | `viable ∧ within budget` | recompute SCI=(E×I+M)/R from RAW factors — **not** `carbonIntensity` | SCI≤budget⇒ADMIT · over⇒REJECT | B13 ✓ (under-reported SCI over real budget ⇒ ASSURANCE_FAILED) |

**Assurance level:** all three `independent` (§4). **Execution/validation separation (§4):** the guard produces the
verdict; a DISTINCT code path validates it — a provider never validates its own output. **Dates (§2):** fixed UTC strings,
**no `Date.now()`** (deterministic). **Resilience (§5):** all prior terminal stages preserved + 3 new ASSURANCE_FAILED
catches; métier isolation intact; fixtures synthetic, unblock nothing canonical, no false real proof.

**Qualification reached:** P2, P10, P13 = **EXECUTED + VERIFIED**. **Nine métiers now E2E** (P3, P8, P9, P1, P12, P4, P2, P10, P13).

## §6 — Framework learning (nine métiers compared)
- **Common (stable, generic):** orchestrator (10 governed steps), registry pattern, `decisionOf(verdict, payload)`,
  independent-assurer discipline, fail-closed resilience set. **V21 added 3 métiers with ZERO orchestrator-core edits** —
  the common cadre absorbed them via registry entries alone (strong evidence of genuine generality, no premature coupling).
- **Legitimate variations:** input adapters (P4 positional, P2/P13 payload-carried threshold), `decisionOf` arity
  (verdict-only vs verdict+payload), per-métier independent assurer.
- **Reusable assurance patterns (a growing toolkit):** (1) necessary-condition cross-check (P3); (2) recompute-via-raw-
  data on a distinct path (P2 pass@k, P9/P13 arithmetic, P10 dates); (3) distinct statistic (P4 total-variation vs PSI);
  (4) sub-function cross-derivation (P8 bump-rank). **No new framework defect found** (the V19 `decisionOf(verdict,payload)`
  fix has held for P9, P13). No improvement needed beyond the generic cadre.

## LOT SUIVANT — Batch 03 prepared for V22 (audited, NOT executed)
ODG-selected next three (distinct domains, gate-able verdicts, independent-assurance feasible):

| Métier | domain | real guard | verdict → decisionOf | independent assurer to build (distinct path) | pos / neg | prerequisites / risks |
|---|---|---|---|---|---|---|
| **P11** | document routing | `routeDocument` | routed/accepted vs quarantined → ADMIT/REJECT | recompute the routing eligibility from the doc's own features (not routeDocument) | valid doc routed ⇒ ADMIT; quarantined ⇒ REJECT | confirm routeDocument verdict shape + decision field |
| **P15** | workflow / saga | `runSaga` | `status==COMMITTED` → ADMIT/REJECT | recompute from steps whether all forward steps succeeded + compensations balance (not runSaga) | all steps commit ⇒ ADMIT; a failed step (compensated) ⇒ REJECT | step/outcome fixture shape; ensure determinism |
| **P6** | eval reference | `evaluate` | eval pass/threshold → ADMIT/REJECT | recompute the score from raw eval items (not evaluate) | score ≥ threshold ⇒ ADMIT; below ⇒ REJECT | confirm evaluate input + threshold location |

Each plugs in as ONE registry entry + ONE test block; no orchestrator change expected. **Execution deferred to V22.**
After Batch 03, only P5, P7, P14 remain for a final batch (V23) — P5 (decision-rules) has no dedicated guard file
(benchmark-covered) and will need the closest reusable guard identified.

## Fifteen métier states
| | state |
|---|---|
| **P3,P8,P9,P1,P12,P4,P2,P10,P13** | **EXECUTED + VERIFIED (9)** |
| P11, P15, P6 | guard-VERIFIED; **Batch 03 prepared (V22)** |
| P5, P7, P14 | guard-VERIFIED (parity 15/15); final batch (V23) |

## Closure
Gate 404/404 (expanded metier-parcours suite, already gated); tsc clean; CI green on merge. §9 restrictions intact
(Truth Lock, 9 primitives, permissions, private VPS, no new public port, no net, no spend, no secret, no deletion; npm
globals untouched). Nine métiers do NOT declare fifteen operational — six remain (three prepared for V22).
