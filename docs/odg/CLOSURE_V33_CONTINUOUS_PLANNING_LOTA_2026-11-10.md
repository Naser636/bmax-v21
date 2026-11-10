# V12.4 — V33: LOT A — Continuous Planning by COMPOSING existing capabilities (2026-11-10)

CTO V33 rule honored: IMPROVE/COMPOSE existing capabilities, build no parallel engine. LOT A (§2.3 CASPER-style continuous
planning + §2.2 calibrated estimates) is delivered by composing `plan-evaluator` (V31.2) + `roadmap-manager` (V31) + the
canonical register as verified history — NOT a new planner/memory/registry. V31/V31.1/V31.2/V32 preserved, not interrupted.

## §12 architecture-rule disclosure (mandatory format)
- **Existing capability used:** `plan-evaluator` (multi-criteria choice), `roadmap-manager` (discovery ≠ authorization),
  the closure-register (as verified history). No new registry/memory/planner.
- **Demonstrated gap:** plan-evaluator ranks a SET of plans but does not maintain a CURRENT plan nor repair it on an event;
  success probabilities were pure inputs (arbitrary) with no calibration from real results.
- **Change (composition, not duplication):** `runtime/core/continuous-planner.ts` — a thin orchestrator that (a) repairs
  ONLY the event-affected missions of a current plan via plan-evaluator, preserving valid parts; (b) estimates success
  from the register's verified history.
- **New code:** one PURE module (gate suite) + its test; no new engine, no parallel state.
- **Complexity added:** low (composes two existing modules); **gain:** continuous (incremental) planning + justified
  estimates. **Regressions:** none (gate green). **Integration:** canonical PR.

## LOT A — `continuous-planner.ts` (PURE, fail-closed, gate suite)
- **CASPER incremental repair (§2.3):** `affectedMissions(plan,event)` = the event target + its TRANSITIVE dependents;
  `repairPlan` re-evaluates ONLY those via plan-evaluator and **preserves every still-valid mission verbatim** — no full
  rebuild. The prior plan is retained (plan history). **Tested:** event "A blocked" ⇒ affects A,B,D; independent C
  preserved; preservedCount=1, repairedCount measured.
- **Replanning NEVER self-authorizes (invariant):** the repaired plan is a PROPOSAL (`authorized:false`, status PROPOSED)
  — a governed step authorizes (roadmap-manager discipline).
- **Fail-closed escalation:** an affected mission with no feasible alternative, or whose only candidate is INFEASIBLE
  (hard-constraint via plan-evaluator), is **BLOCKED/escalated**, never silently dropped.
- **§2.2 calibrated estimates:** `estimateSuccess(type, history)` = ACCEPTED/total over VERIFIED register items, with the
  observation count; **no data ⇒ UNKNOWN (p=null), never a favourable default.** Live on the real register: P(serie30)=
  0.9633 over 409 verified observations; a never-seen type ⇒ UNKNOWN.

## Falsifications caught
localized event preserves unrelated missions · replanning never self-authorizes · no-alternative ⇒ BLOCKED ·
infeasible-only candidate ⇒ BLOCKED · no-history ⇒ UNKNOWN (not favourable) · unrelated event ⇒ whole plan preserved (no
wasteful rebuild).

## LOTs B–E, §7 FDIR integration, §9 intelligence measurement — reconciled / prepared
- **§7 FDIR (V32):** stays a verified-in-isolation capability — NOT claimed as a live VPS supervisor. Its honest
  integration (feed global state / event detection into the planner's events) is a prepared LOT (safe, reversible, when
  authorized); not asserted here.
- **LOT B (data/reuse-ledger estimates):** this delivers the register-history estimator seed; richer per-mission-type
  calibration from logs is the next LOT (reuse the ledger, no parallel data engine).
- **LOTs C (multi-métier selection), D (Radar transfer), E (simulation/benchmark gains):** PROPOSED (roadmap-manager),
  built on improvement of the existing orchestrator/Radar/benchmarks, not new engines.
- **§9 intelligence measurement:** deliberately NOT a single global score (would mask weak domains §9); per-dimension
  benchmarks are a cross-cutting LOT-E concern, prepared.

## Honest scope / VPS ladder
`continuous-planner` : REGISTERED + CONNECTED (composes plan-evaluator/register) + CALLABLE (gate) + EXECUTED (live
calibration on the real register) + **VERIFIED** (falsifications). DEPLOYED/OPERATIONAL as a live replanning daemon =
NOT claimed (in-repo capability; wiring into a live scheduler = a later authorized step). No service deployed.

## Provenance & security
`continuous-planner.ts` + test = provider-authored framework (planning control-logic deterministic + fail-closed).
§13 restrictions intact (Truth Lock, 9 primitives, permissions, private VPS, SSH:22 only, edg-core loopback, no spend/
account/secret/third-party/exposure/Docker; no auto-delegation; Program C stays PROPOSED/not-authorized).

## Boussole + next
Register reconciled (new item `serie30-v33-continuous-planning`). HEAD=origin/main=`a080714`. **Next (ODG-selectable,
PROPOSED):** LOT B (richer calibrated estimates from logs via the reuse-ledger), then C/D/E; the authorized §7 FDIR→planner
event wiring; the weekly Radar; or an owner input.
