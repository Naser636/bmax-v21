# PROVIDER_ENABLED_SMOKE_V1 — Evidence

First official ODG mission that uses the already-integrated Claude Provider Adapter.
It reuses the existing Runtime exclusively; no foundation, contract, governance, provider
or adapter is modified. The only additive files are the mission and its validation harness.

## Artifacts

- Mission        : `runtime/missions/PROVIDER_ENABLED_SMOKE_V1.json`
- Validation      : `src/tests/provider-enabled-mission.test.ts`

## Mission design

The mission opts into engineering work with `requiresEngineering: true` and declares an
explicit write scope `authorizedPaths: ["src/app/provider-smoke/**"]`. Either signal alone
makes the Runtime-owned predicate `missionRequiresProvider()` return `true`, so **the Runtime
itself decides to call the provider** — the provider is never invoked speculatively.

## How the flow is exercised

The harness composes the real, unmodified production objects and stubs only the single impure
boundary — the process runner that would spawn `claude` — so no live (paid) call is made:

```
RuntimeAutonomy (core; Release Manager is in-core, NOT injectable)
  -> AutonomyRuntimeAdapter (real integration glue)
    -> ClaudeProviderAdapter (real provider adapter; process boundary stubbed)
```

## Results (npx tsx src/tests/provider-enabled-mission.test.ts)

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

- Provider invoked **exactly once** across the first full mission run.
- An identical second execution (fresh session, shared cache dir) makes **zero** new live
  calls — served by the provider's existing content-addressed on-disk cache.
- The **Release Manager** (sole completion authority) terminates the mission with `RELEASE`
  in both runs → autonomy status `PLAN_COMPLETE`.

## Validation summary

| Check                     | Result |
|---------------------------|--------|
| TypeScript (`tsc --noEmit`) | PASS (exit 0) |
| Build (`next build`)        | PASS (exit 0) |
| `odg verify` build          | true |
| `odg verify` typescript     | true |
| `odg verify` gitClean       | false — pre-existing tracked edits to `RUNTIME_FULL_AUTONOMY_EXECUTION.*` present at session start; the two mission additions are untracked and do not affect it |
| Provider call test          | PASS (exactly one call) |
| Cache test                  | PASS (no new live call) |
| Runtime non-regression      | PASS (provider adapter, provider integration, runtime autonomy, release manager, documentation engine) |
