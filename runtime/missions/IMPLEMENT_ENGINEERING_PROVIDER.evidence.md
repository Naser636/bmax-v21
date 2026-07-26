# IMPLEMENT_ENGINEERING_PROVIDER — Evidence

Capitalizes the capability that lets ODG call an engineering provider automatically after the
mission Brief, receive its patch, and route it to validation. The capability is assembled from
the existing Runtime edge only; no foundation, contract, or core component is modified. All added
code is additive Runtime-edge glue under `src/providers/**` and `src/runtime/**`.

## Objectives → evidence

| Objective | done_when | Where it is satisfied |
|-----------|-----------|------------------------|
| OBJ-001 — Engineering Provider exists / Runtime can select it | Provider exists; Runtime can select it | `src/providers/provider-port.ts` (`EngineeringProviderPort`, `missionRequiresProvider`), `src/providers/claude-provider-adapter.ts` (`ClaudeProviderAdapter`) |
| OBJ-002 — Runtime calls the Provider automatically after the Brief; no direct CTO call | Runtime triggers Provider after the Brief; no direct call from the CTO | `src/runtime/autonomy-runtime-adapter.ts` `runPipeline()` → `runViaProvider()`, driven by the in-core `RuntimeAutonomy` loop — the provider is invoked by the Runtime, never by a CTO caller |
| OBJ-003 — Retrieve the Provider's patch; Validation Engine verifies automatically | Patch Engine receives the result; Validation Engine verifies automatically | `src/runtime/patch-engine.ts` (`ProviderPatchEngine.receive`) wired into `runViaProvider()`; a `readyForValidation` receipt triggers `refreshVerifyEvidence()` (the existing `odg-verify.js`) |
| OBJ-004 — Capitalize the result | Evidence produced; Knowledge updated; next mission prepared | This evidence file; next mission `runtime/missions/IMPLEMENT_RUNTIME_HEALTH_COMMAND.json` prepared |

## Design boundaries honoured

- **ODG decides, the provider executes.** `missionRequiresProvider()` (Runtime-owned) is the only
  place the decision to call a provider is made; the provider is never invoked speculatively.
- **The provider never decides completion.** `ProviderPatchEngine` derives its receipt from observed
  evidence — classification + ground-truth `changedFiles` / `unauthorizedChanges` — never from the
  provider's own `status` prose. The Release Manager (in-core) remains the sole completion authority.
- **Evidence, not narrative.** The Patch Engine forwards a patch to validation only when the run was
  clean and in-scope (`readyForValidation`); a `DONE` self-report on a `FAILED` run is ignored.
- **Additive.** No new persistence format; the seam normalizes the existing `ProviderOutcome` shape.

## How the flow is exercised

The harnesses compose the real, unmodified production objects and stub only the single impure
boundary — the process runner that would spawn `claude` — so no live (paid) call is made:

```
RuntimeAutonomy (core; Release Manager is in-core, NOT injectable)
  -> AutonomyRuntimeAdapter (real integration glue)
    -> ProviderPatchEngine (real; receives the provider result)
    -> ClaudeProviderAdapter (real provider adapter; process boundary stubbed)
```

## Results

`npx tsx src/tests/provider-patch-engine.test.ts` — Provider Patch Engine (OBJ-003):

```
PASS  RECEIVED: clean OK run with changed files => RECEIVED and ready for validation
PASS  RECEIVED: the patch (changed files, objectives, commands) is carried through
PASS  EMPTY: clean OK no-op run => EMPTY but STILL forwarded to validation
PASS  REJECTED: unauthorized changes => REJECTED, not ready, scope reason surfaced
PASS  REJECTED: BLOCKED classification => REJECTED, not ready, blocker reason surfaced
PASS  EVIDENCE: a DONE self-report is ignored when the classification is FAILED
Provider Patch Engine OK
```

`npx tsx src/tests/provider-enabled-mission.test.ts` — routing + one-call + cache (OBJ-001/002):

```
PASS  ROUTING: the official mission declares work => the Runtime routes it to the provider
PASS  ONE CALL: first execution invokes the provider process exactly once
PASS  ONE CALL: the autonomy loop runs to PLAN_COMPLETE
PASS  ONE CALL: the provider mission is the one released
PASS  ONE CALL: the Release Manager terminates the mission with RELEASE
PASS  ONE CALL: no halt — the Release Manager did not block
PASS  CACHE: identical re-execution makes NO new live provider call
PASS  CACHE: the re-run still runs to PLAN_COMPLETE
PASS  CACHE: the Release Manager still terminates with RELEASE off the cached outcome
Provider Enabled Mission OK
```

`npx tsx src/tests/provider-canonical-contract.test.ts` — canonical release contract (regression guard):

```
PASS  CANONICAL: {status:SUCCESS, validated:true} => Release Manager RELEASE
PASS  LOOSE: {status:OK} (no validated) => NO release, EVIDENCE_INCOMPLETE
PASS  BLOCKED: {status:BLOCKED, validated:false} => NO release, EVIDENCE_INCOMPLETE
PASS  WRONG MISSION: a canonical report scoped to another mission => NO release, EVIDENCE_INCOMPLETE
Provider Canonical Contract OK
```

`npx tsx src/tests/claude-provider-adapter.test.ts` — `Claude Provider Adapter OK`.
`npx tsx src/tests/claude-provider-integration.test.ts` — `Claude Provider Integration OK`.

## Validation summary

| Check | Result |
|-------|--------|
| TypeScript (`npx tsc --noEmit`) | PASS (exit 0) |
| Provider Patch Engine test (OBJ-003) | PASS |
| Provider Enabled Mission test (OBJ-001/002) | PASS |
| Provider Canonical Contract test (regression) | PASS |
| Claude Provider Adapter / Integration tests | PASS |

## Re-verification — 2026-07-26 @ HEAD 12391861

Runtime re-issued the mission with `missing_capabilities: [IMPLEMENT_ENGINEERING_PROVIDER]`; the
capability is in fact already present and committed at HEAD. Re-verified this run (no source changes):

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS (exit 0) |
| `claude-provider-adapter.test.ts` | Claude Provider Adapter OK |
| `claude-provider-integration.test.ts` | Claude Provider Integration OK |
| `provider-canonical-contract.test.ts` | Provider Canonical Contract OK (4 PASS) |
| `provider-enabled-mission.test.ts` | Provider Enabled Mission OK (9 PASS) |
| `provider-orchestrator.test.ts` | Provider Orchestrator OK (19 PASS) |
| `provider-patch-engine.test.ts` | Provider Patch Engine OK (6 PASS) |
| `provider-registry.test.ts` | Provider Registry OK (25 PASS) |

All 7 provider suites green (63 assertions), `tsc` exit 0. Source wiring confirmed at HEAD:
OBJ-001 `src/providers/provider-port.ts` + `claude-provider-adapter.ts` (selectable via
`src/core/provider-registry.ts` / `provider-orchestrator.ts`); OBJ-002
`src/runtime/autonomy-runtime-adapter.ts` `runPipeline()` gates on `missionRequiresProvider()`
(line 288) → `runViaProvider()`, driven by in-core `RuntimeAutonomy`, no CTO call; OBJ-003
`src/runtime/patch-engine.ts` `ProviderPatchEngine.receive()` → `readyForValidation`; OBJ-004 this
file + next mission `runtime/missions/IMPLEMENT_RUNTIME_HEALTH_COMMAND.json`.

## Notes on session state

At session start the working tree already carried the provider-integration seam
(`src/runtime/patch-engine.ts`, its wiring in `src/runtime/autonomy-runtime-adapter.ts`, the export
in `src/runtime/index.ts`, and the validation harnesses in `src/tests/`) alongside unrelated
pre-existing edits to `runtime/mission-standard/**` and `.gitignore` from earlier missions. This
mission did not modify the unrelated edits. The `build`/`gitClean` release gates are the Release
Manager's to judge over the full tree; this evidence records only what was verified here.
