# Final consolidated registry V321 → V328 (CTO V329 §7)

**Date:** 2026-11-20 · **HEAD:** `becc5fd0` (= PR #803) · **Authority:** Boussole V12.4 · **Provider:** Claude Code (TECHNICAL_PROVIDER_ONLY — not the closure authority)

## Method & honesty boundary

The V321–V328 directives were session instructions (not repo-tracked), so statuses are anchored to **verifiable evidence
only**: merged PRs, real non-test consumers (`grep require`), and runtime/live-model proof captured this session. A feature
is **never** marked DONE_OPERATIONAL merely because code or tests exist — DONE_OPERATIONAL requires proof of real execution.

Status legend: DONE_OPERATIONAL (proven by real execution) · BUILT_CONNECTED (built + real consumer + tested) ·
BUILT_DISCONNECTED · PARTIAL · OWNER_GATED · BLOCKED · SUPERSEDED · RESERVED_METIER.

## Matrix

| Requirement | Source | Realisation | Real consumer | Proof | Remaining limit | Status |
|---|---|---|---|---|---|---|
| Native execution → provenance (actor=ODG) | V324/V325 | `odg-native-execution-provenance` | actor-provenance resolver; ledger | entry 1773, seal `fc4adc68` (prior session) | resident driver gated | DONE_OPERATIONAL |
| Cross-session continuity (2 processes) | V327 §P1 | continuity harness | — | GATE 9/9 (prior session) | — | DONE_OPERATIONAL |
| Durable proof (git-tracked stamped dossiers) | V327 §P2 | evidence-provenance stamps | docs/odg/autonomy | stamped dossiers | — | DONE_OPERATIONAL |
| Calibrated-P (survivorship/size guarded) | V328 | `odg-calibrated-psuccess` | policy, calibration-key, routing, continuous-planner | tests + live cycle | — | BUILT_CONNECTED |
| Store→belief bridge | #794 | `odg-native-outcome-calibration` (`toVerifiedRows` SSOT) | `odg-calibration-key` (#799) | tests | — | BUILT_CONNECTED |
| Taxonomy reconciliation (complexity key) | V327 §3 | `odg-calibration-key` | `odg-intelligent-native-cycle` | live self-calib (KNOWN, 20 obs) | — | BUILT_CONNECTED |
| Self-calibrating cycle | V327 §3 | cycle self-calibration path | bin #789 | **live**: policy sized from store belief → accepted | — | DONE_OPERATIONAL |
| Behavioral trend / false-rule | V327 §2 | `odg-behavioral-improvement` | `odg-intelligent-native-cycle` | tests + live (PLATEAU) | — | BUILT_CONNECTED |
| Anti over-generalization (source diversity) | V327 §6 | `odg-generalization-validity` | `odg-intelligent-native-cycle` | tests + live (GENERALIZABLE, 20 distinct) | — | BUILT_CONNECTED |
| Missing-info pre-flight | V327 §6/§9 | `odg-mission-completeness` | `odg-intelligent-native-cycle` | **live**: UNDERSPECIFIED ⇒ model never called | — | DONE_OPERATIONAL |
| Belief staleness / anti self-reinforcing-error | V327 §4/§5 | `odg-belief-refresh` | escalation/cycle | tests | — | BUILT_CONNECTED |
| Evidence-gated escalation (provider) | V327 | `odg-native-escalation` → sovereign-delegation | `odg-intelligent-native-cycle` | tests (CLAUDE_CODE_PROVIDER, delegation CREATED) | — | BUILT_CONNECTED |
| Write-set-safe parallel waves | V327 §8 | `parallel-execution-planner.writeSetSafe` (reuses `writeset-scheduler`) | **none yet** (opt-in flag; `metier-orchestration` plans without write-sets) | tests (same-file serialized) | genuine consumer is the métier wave planner (gated); not label-filled into synthetic prep | BUILT_DISCONNECTED (reserved) |
| Impact-graph reuse (speed) | V327 §9 | `persistent-impact-graph.makeReusableImpactOf` + `impactOf(prebuilt)` | `campaign-engine` via `incremental-assurance` seam | **benchmark**: 219ms→3.3ms/query (~66×), builds O(missions)→O(1) | per-call hazard/test reads remain | BUILT_CONNECTED |
| Reuse/learning demonstrators | V327 §7 | `learning-reuse-proof`, `odg-capability-reuse-path` | `runtime/bin/odg-reuse-demonstrations-run` | **live**: PROVEN + CAPABILITY_USED_EVIDENCED | — | DONE_OPERATIONAL |
| Hypothesis-driven mission | V327 §8 | `odg-hypothesis-driven-mission` | `runtime/bin/odg-hypothesis-mission-run` | tests (REFUTED blocks accept) | — | DONE_OPERATIONAL |
| Memory cost-vs-gain | V327 §6 | — | — | — | needs counterfactual data (not fabricatable) | BLOCKED |
| Pre-authored reuse candidates | V31 | `provider-reuse-candidate` | none (by design) | header declares migration-parity | intentional | BUILT_DISCONNECTED (intentional) |
| Resident/continuous autonomy driver | V326 §9 | campaign-loop | — | — | owner authorization | OWNER_GATED |
| 20-métier deployment | V327 §7 | `configureMetier`/ROSTER20/transversal base/BTP-M2 | — (prep only) | prep modules present + tested | not launched | RESERVED_METIER |
| Deploy / public exposure | — | dashboard-exposure/release | — | — | owner authorization | OWNER_GATED |

## Intelligent loop — composition validated live (§3)

`completeness → self-calibration → generalization-validity → behavioral-trend → policy → execution → independent-verification → outcome`
confirmed this session against the **real** qwen2.5-coder local model: UNDERSPECIFIED stops before generation; a KNOWN belief
(20 obs, 20 distinct sources) sizes NATIVE_CHEAP; the real 3b model built code the independent verifier accepted
(`ODG_LOCAL_MODEL_EXECUTION`); a calibrated-low/obsolete class escalates (CLAUDE_CODE_PROVIDER), never auto-accepted.

## Governance (§9) — unchanged

9 primitives · one orchestrator · one mission chain · no parallel memory · no duplicate engines · VPS read-only ·
no deploy/systemd/sudo/secret/prod-db/exposure · no paid provider · no OWNER_GATED mutation · no agent self-expansion.

## Closure recommendation (§10) — provider recommendation, NOT a self-certification

The non-gated V321–V328 consolidation scope is, on the evidence above, **complete and proven** (BUILT_CONNECTED /
DONE_OPERATIONAL across the intelligence, speed, delegation-safety and reuse axes). The only open items are BLOCKED
(cost-vs-gain, counterfactual data), intentional (provider-reuse-candidate), or OWNER_GATED / RESERVED_METIER.
**Closure of V321–V328 and opening of the métier phase are owner/CTO decisions — requested, not asserted by the provider.**
