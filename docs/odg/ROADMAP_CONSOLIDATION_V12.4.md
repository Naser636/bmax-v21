# V12.4 — Single Directing Roadmap (Consolidation)

**Addendum V2 §5 deliverable.** Verified by `runtime/core/roadmap-consolidation.ts` (7 assertions, in `test:report`).

## Source of truth

**V12.4 is the single directing roadmap.** All programs are **sections/domains/phases/missions of V12.4** — no concurrent
roadmap. The pilotable decomposition lives in `docs/odg/master-technological-superiority-program.json` (declares
`directeur: "V12.4"`); the canonical evidence lives in `docs/odg/closure-register.json`; the Target↔Reality view is
`docs/odg/V12.4_SECTION_TRACEABILITY_MATRIX.md`. **The Boussole (`ODG_PROJECT_STATE.md`) is the operational interface
of V12.4 — not a second roadmap.** Older documents (V46_MASTER_COMPLETION_REGISTER, FRONTIER_V124_PREPARATION,
ODG_MASTER_TECHNOLOGICAL_SUPERIORITY_ROADMAP) remain accessible as **archives/references**, not concurrent roadmaps.

## Program reconciliation (every requirement has a canonical home)

| Program / extension | Integrated into V12.4 as | Canonical location | Status |
|---|---|---|---|
| **V5 Master Technological Superiority** (programs A–D, 8 domains, 11 phases) | manifest `programs`/`phases`/`missions` | `master-technological-superiority-program.json` + register (serie24/25) | INTEGRATED; validator INTEGRATED |
| **Engineering Intelligence** (E01–E20 + 6 transversal) | manifest `engineeringIntelligence` + E-missions | manifest + register (serie25) | INTEGRATED; wave-1 + wave-2 built |
| **FIED** (FIED-01..08) | manifest `fied` traceability | manifest + register (serie26) | INTEGRATED; FIED-01/06/08 PRESENT, 02/03/07 PARTIAL_EXTEND, 05 BUILT, 04 GAP_STUDY_ONLY |
| **Radar + weekly self-improvement** | V5 PHASE-6 / FIED-01 | `frontier-radar*`, `frontier-weekly-report`, `frontier-radar-self-improvement` | PRESENT |
| **RCE** | V5 PHASE-3/4 / Program B | `rce-signal-collector`, `rce-root-cause-intelligence`, `rce-assurance-chain`, `repair-workflow`, `build-recovery-engine` | PRESENT |
| **Frontier Lab** | V5 PHASE-7 / FIED-06 | `frontier-lab-experiment`, `evolution-loop`, `champion-challenger-arbiter` | PRESENT |
| **Compounding** | V5 PHASE-8 / FIED-08 | `compounding-loop`, `compounding-pattern-library` | PRESENT |
| **15 métiers (P1–P15)** | V12.4 §43–§46 / PHASE-2 | `profession-pXX-*` + the p1..p15 capability modules | PRESERVED (build target) |

No requirement, historical decision, or validated work is dropped; conflicts resolve by the existing canonical
authorities (V12.4, CTO directives, DEC-V60-166-RETIREMENT).

## Addendum §3 — four transversal responsibilities map to EXISTING components (§4 anti-gas-factory: no new systems)

| Responsibility | Existing components (reuse/extend) | Verdict |
|---|---|---|
| **A. Multi-Signal Fusion** | `frontier-radar` (multi-source + provenance), `meta-intelligence` (contradiction/integrity), `eval-significance`, `world-model` | PARTIAL — fusion/coherence scoring may warrant a *small* extension; inference never becomes a verified fact |
| **B. Unified Engineering World Model** | `world-model`, `causal-graph`, `change-impact-graph`, `persistent-impact-graph`, `capability-map` | PRESENT — **no concurrent graph**; extend the existing graph only on a demonstrated gap |
| **C. Evidence Replay & Calibration** | `flaky-replay-gate` (deterministic replay), `verified-result-cache` (freshness/identity), `calibration-trust-gate` (confidence), `evidence-provenance` | PRESENT — a replayed result is not a new historical run; a stale/incomplete proof never becomes valid by reuse |
| **D. Layered Intelligence Views** | `capability-map` (byProgram/byMaturity), register/matrix (per-mission/component views) | PARTIAL — views are data projections over existing stores; **no 3D globe / spectacular UI without demonstrated value** |

## Inspirations (evaluation-gated — not installed)

REA (morluto/rea), RuView (ruvnet/RuView), God's Eye View (bilawalsidhu/gods-eye-view): studied as **inspirations
only**. No auto-install/copy/blind integration. Any provider/engine must pass the **`provider-capability-contract`**
(declare capabilities/permissions/side-effects/provenance; ODG is the sole arbiter). Reverse-engineering (FIED-04)
stays owner-gated with a prior legal/license/security/maturity/cost/value review; decompilation heuristics are never
truth without independent validation.

## Discipline (unchanged)

NOT_RUN is never PASS. A demonstration is never production-ready. A PROPOSED capability is never a NATIVE capability.
UNKNOWN never becomes NATIVE by assumption. Full certification remains mandatory; the Truth Lock, nine primitives,
15 métiers, four campaigns and owner-gated decisions are preserved.
