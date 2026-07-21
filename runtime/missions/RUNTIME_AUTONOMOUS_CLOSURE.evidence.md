# MISSION 1 — Runtime Autonomous Closure — Evidence Report

- **Date**: 2026-07-21
- **Branch**: `mission/fleet-first-exchange`
- **Fix commit**: `01dfbc9` — *RUNTIME_AUTONOMOUS_CLOSURE : fix explanation trace + local autonomy evidence refresh*
- **Scope constraint honoured**: NO AI provider was integrated. All fixes concern only Runtime stabilisation. The pre-existing Claude provider adapter was neither extended nor invoked live.

## Objective

Make the ODG Runtime fully autonomous through the complete execution of a mission, with no human intervention, and prove it.

## Result: SUCCESS — all success criteria demonstrated by evidence

| # | Success criterion | Status | Evidence |
|---|---|---|---|
| 1 | `odg mission <MISSION>` runs to completion | ✅ | `odg mission RUNTIME_SELF_AUDIT` → PIPELINE SUCCESS → [5/5] GOVERNANCE → MISSION SUCCESS |
| 2 | `odg autonomy` actually selects missions | ✅ | Real-stack integration test drives select → pipeline → evidence → RELEASE → archive → advance (8/8 checks). Live CLI correctly reports `PLAN_COMPLETE` (plan genuinely exhausted). |
| 3 | Governance no longer interrupts a mission for legitimate artifacts | ✅ | After a full mission, `git status` scoped to governance's exclusion set is EMPTY; governance passed. |
| 4 | All tests pass | ✅ | Full suite: **209/209 PASSED**. |
| 5 | Evidence, certificates, passports, reports generated correctly | ✅ | `runtime/mission-standard/{certificates,passports,reports,generated}/RUNTIME_SELF_AUDIT.*` regenerated; history appended. |

## Blockers identified and corrected

### Blocker 1 — Explanation trace never populated (test failure)
- **Root cause**: `createExplanation()` (`src/core/explanation-engine.ts`) built an `Explanation` object but never called `addExplanation()`, unlike its siblings `createAudit` / `createEvidence` / `createKnowledge`, which all register into their store. `getUnifiedTrace().explanations` was therefore always empty and `src/tests/regression.test.ts` failed one of its six assertions.
- **Fix**: register the explanation via `addExplanation(explanation)` before returning, matching the established pattern.
- **Proof**: `regression.test.ts` now passes; `explanations` count = 1 (was 0).

### Blocker 2 — Stale release evidence on the LOCAL autonomy path
- **Root cause**: `AutonomyRuntimeAdapter.runPipeline()` (`src/runtime/autonomy-runtime-adapter.ts`) refreshed the `build / typescript / gitClean` evidence (via the existing verifier) **only** on the provider branch. The local pipeline has no verify stage, so `odg autonomy` gathered evidence from a stale — or, on a fresh clone, absent — `runtime/generated/runtime-verify.json`. The Release Manager would then gate on incorrect evidence, blocking a legitimate RELEASE.
- **Fix**: after a successful LOCAL pipeline run, call the same `refreshVerifyEvidence()` the provider path uses, so the (unchanged) `gatherEvidence()` → Release Manager decision runs on current evidence. Business logic of the pipeline is untouched.
- **Proof**: `src/tests/autonomy-local-loop.test.ts` — the real `RuntimeAutonomy` + real `AutonomyRuntimeAdapter` (only the three shelled-out process boundaries stubbed inside a throwaway git workspace) select a plain local mission, refresh evidence, and reach `RELEASE` / `PLAN_COMPLETE`. The fixture seeds deliberately red verify evidence; a RELEASE is only possible because the refresh actually ran.

## Live command evidence

```
$ odg mission RUNTIME_SELF_AUDIT
... PIPELINE SUCCESS
[4/5] GENERATE
[5/5] GOVERNANCE
[6/6] COMPLETE
MISSION SUCCESS   (exit 0)

$ git status --porcelain -- ':(exclude)…/generated' ':(exclude)…/passports' \
      ':(exclude)…/reports' ':(exclude)…/certificates' ':(exclude)…/history'
(empty)           ← governance sees no source/business change to block

$ odg autonomy
Status : PLAN_COMPLETE   Cycles : 0   (exit 0)   ← correct terminal state

$ odg verify
build: true, typescript: true, gitClean: true   (exit 0)
```

## On criterion #2 (`odg autonomy` selects missions)

The live `odg autonomy` returns `PLAN_COMPLETE` with 0 cycles **because the plan is genuinely
exhausted**: every Master-Plan capability (BusinessContext, Capability Registry, Plugin Manager,
Event Bus, Reporter, Documentation Engine, Release Manager, Knowledge Engine, Learning Engine) is
already recorded in the Mission Ledger. This is the correct, truthful terminal state — the
selector deterministically returns "nothing pending", not a failure.

The selection + full-cycle mechanism is proven directly against the production classes by
`autonomy-local-loop.test.ts`: given a plan with a pending objective, the loop selects it, runs the
pipeline, gathers refreshed evidence, obtains a Release Manager RELEASE, archives it, and advances
to `PLAN_COMPLETE`. No state was fabricated on the real repository to force a selection.

## Files changed

- `src/core/explanation-engine.ts` — register explanation in the store (blocker 1).
- `src/runtime/autonomy-runtime-adapter.ts` — refresh verify evidence on the local path (blocker 2).
- `src/tests/autonomy-local-loop.test.ts` — new real-stack autonomy proof (no provider).
- `runtime/scripts/run-all-tests.js` — full-suite runner used to establish the 209/209 baseline.

## Conclusion

The Runtime executes a mission end-to-end without human intervention, autonomy's select→release
loop is proven against the production code path, governance no longer blocks legitimate Runtime
artifacts, and the entire test suite is green. **The Runtime is autonomous up to and including the
complete execution of a mission.**
