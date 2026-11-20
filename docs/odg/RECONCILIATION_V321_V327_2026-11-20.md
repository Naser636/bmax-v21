# Reconciliation V321 → V327 (MISSION C) — evidence-anchored

**Date:** 2026-11-20 · **HEAD at authoring:** `9fb4590c` · **Authority:** ODG / Boussole V12.4

## Method & honesty boundary

The V321–V327 CTO directives were delivered as session instructions and are **not tracked in the repo**
(`git ls-files` finds no `V32x` directive source). Per the directive's own rule — *"Ne pas inventer le contenu
d'une roadmap qui n'a pas été retrouvée"* — this reconciliation does **not** reproduce directive prose. It reconciles
against **verifiable evidence only**: merged PRs (`#761`–`#797`), the code and its real (non-test) consumers, and the
memory topic files. Each status carries a concrete anchor.

Status vocabulary: `DONE_INTEGRATED` (built + consumed by a real consumer + tested), `DONE_OPERATIONAL`
(demonstrated live), `BUILT_DISCONNECTED` (built + tested but no non-test consumer), `OWNER_GATED`, `SUPERSEDED`,
`RESERVED_METIER`, `PARTIAL`, `BLOCKED`.

## Verified non-test consumers (grep of `require` in `runtime/core` + `runtime/bin`, excluding tests)

| Module | Real consumer | Status |
|---|---|---|
| `odg-calibration-key` (#795) | `odg-intelligent-native-cycle` | DONE_INTEGRATED |
| `odg-behavioral-improvement` (#796) | `odg-intelligent-native-cycle` | DONE_INTEGRATED |
| `odg-generalization-validity` (#797) | `odg-intelligent-native-cycle` | DONE_INTEGRATED |
| `odg-native-escalation` (#778) | `odg-intelligent-native-cycle` | DONE_INTEGRATED |
| `odg-local-model-execution-policy` (#774) | `odg-policy-build-seam`, `odg-intelligent-native-cycle` | DONE_INTEGRATED |
| `odg-calibrated-psuccess` (#773) | policy, calibration-key, routing, continuous-planner, outcome-calibration | DONE_INTEGRATED |
| `odg-intelligent-native-cycle` (#788) | `runtime/bin/odg-intelligent-native-run` (#789) | DONE_OPERATIONAL (live bin) |
| `odg-hypothesis-driven-mission` (#765) | `runtime/bin/odg-hypothesis-mission-run` (#793) | DONE_OPERATIONAL (live bin) |
| `odg-native-outcome-calibration` (#794) | **none (test-only)** | **BUILT_DISCONNECTED / SUPERSEDED** |

**#794 honest note:** the store→belief path actually consumed by the cycle is #795's `beliefFromStore`
(`storeHistoryFor` → `derivePsuccess`), and `derivePsuccess` already applies the same survivorship guard #794 wrapped.
#794's `calibrateFromBuildOutcomes` is therefore a redundant second mapper, retained as a standalone API but **not on
the critical path**. Not hidden; a candidate for later consolidation (one shared mapper) — deferred as a non-urgent,
low-risk cleanup, not forced into a facade consumer.

## V327 learning/intelligence frontier (this session)

| Requirement (per PR evidence) | Status | Anchor |
|---|---|---|
| §3 taxonomy reconciliation (complexity-class ↔ calibration) without a 2nd taxonomy / central change | DONE_INTEGRATED | #795 `odg-calibration-key`; key reconstructs the store's `native-build:<STRAT>:<COMPLEXITY>` via the same classifier |
| §3 self-calibrating cycle (learns from own accumulated outcomes) | DONE_INTEGRATED | #795 cycle self-calibration path (+ tests) |
| §2 behavioral-improvement trend + recurring-failure (false-rule) detection | DONE_INTEGRATED | #796; cycle escalates behaviorally-obsolete class |
| §6 anti over-generalization (source-diversity guard) | DONE_INTEGRATED | #797 (world ref arXiv:2603.07670); cycle probes OVERFIT beliefs |
| §4/§5 anti self-reinforcing-error belief refresh + staleness | DONE_INTEGRATED | #790/#791 `odg-belief-refresh` |
| §6 memory *cost-vs-gain* (quantified) | **NOT BUILT (honest)** | needs counterfactual outcome data ODG does not hold — not fabricatable |
| §6 knowledge transfer / reuse of validated solutions | PRE-EXISTING | reuse-ledger + calibration-by-complexity-class (transfer-by-class) |

## V321–V324 (from PR evidence + memory)

- V324 Priority-One §5/§7/§8/§9 (native execution → provenance, reuse-freshness, hypothesis adjudication, mission
  continuation): **DONE** non-gated — #761–#765; resident/continuous driver remains **OWNER_GATED**.
- V324 provenance ledger append (genuine actor=ODG): **DONE_INTEGRATED**, one owner-authorized write (ledger entry 1773,
  seal `fc4adc68`).
- V327 §P1 cross-session continuity (2 processes, GATE 9/9): **DONE**; §P2 durable proof (git-tracked stamped dossiers):
  **DONE** — #766/#767.
- V321/V323 "ODG-intelligence-first before métiers": **honored** — all session work is core-ODG; métiers untouched.
- #786/#787 métier transversal-base readiness + per-métier config: **RESERVED_METIER** (built, not activated).

## Stopped experiments (do not repeat — directive §5/§7/§11)

- topological-sort local-model trail: **CLOSED** at best-local config (#784) → controlled escalation is the autonomous
  answer. No further local forcing.

## Remaining honest frontier (drives next mission selection)

1. §6 cost-vs-gain — blocked on counterfactual data (not fabricatable).
2. #794 consolidation — low-risk cleanup, deferred.
3. §8 multi-agent (≤6) — **study-first** (existing Agent/Workflow/worktree mechanisms) before any build; must not become a
   2nd orchestrator.
4. 20 métiers — **LAST PHASE**, not to be opened before core-ODG closure.

*No world-superiority claim is made anywhere: no independent head-to-head benchmark has been run.*
