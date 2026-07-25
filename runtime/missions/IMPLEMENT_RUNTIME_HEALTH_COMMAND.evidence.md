# IMPLEMENT_RUNTIME_HEALTH_COMMAND — Evidence

Capitalizes the capability that gives ODG a single `odg` entrypoint rendering a unified Runtime
health dashboard from the EXISTING generated artefacts only. No new source of truth is introduced
and no generated artefact is mutated — the command is a read-only projection over
`runtime/generated/**` plus the immutable constitution. All added code is additive Runtime-edge
glue under `runtime/bin/**`.

## Objectives → evidence

| Objective | done_when | Where it is satisfied |
|-----------|-----------|------------------------|
| OBJ-001 — the `odg` command exists and is executable | Command exists; is executable | `runtime/bin/odg` (bash dispatcher, `-rwxrwxr-x`) routes `health`/`dashboard`/bare invocation to `runtime/bin/odg-health.js` (`-rwxrwxr-x`, `#!/usr/bin/env node`) |
| OBJ-002 — read the existing Runtime artefacts | `runtime-state.json`, `runtime-status.json`, `capability-registry.json`, `mission-ledger.json` loaded | `runtime/bin/odg-health.js:29-32` reads all four from `runtime/generated/` via `read()` (graceful fallback, never throws) |
| OBJ-003 — render a unified dashboard | Health, Progress, Blockers, Next Action, Working Rules shown; output < 100 lines | `odg-health.js:63,71,79,91,96` emit the five sections; `odg-health.js:104` deterministically caps output below the 100-line contract. Observed run = 36 lines |
| OBJ-004 — capitalize the capability | Evidence produced; Knowledge updated; Mission Ledger updated | This evidence file (Evidence); `capability: "Runtime Health Command"` recorded by the Runtime knowledge/ledger engine (Knowledge + Mission Ledger, `runtime/generated/mission-ledger.json`, `state: CAPITALIZED`) |

## Design boundaries honoured

- **Read-only projection.** The command only READS generated artefacts; it never writes them
  (Constitution §ARTIFACTS_ARE_IMMUTABLE). The four artefacts remain the single source of truth.
- **No new source of truth** (§REUSE_BEFORE_CREATE). Health/Progress/Blockers/Next Action derive
  entirely from `runtime-state.json`, `runtime-status.json`, `capability-registry.json`,
  `mission-ledger.json`, `runtime-mission-queue.json`, and the immutable constitution.
- **Deterministic and reproducible** (§DETERMINISM_FIRST / §PIPELINE_IS_REPRODUCIBLE). Same inputs
  render the same dashboard; the `<100`-line contract is enforced by a hard slice, not by chance.
- **Graceful degradation.** A missing/corrupt artefact falls back to a labelled `UNKNOWN`/`N/A`
  rather than throwing, so the dashboard is always renderable.

## How the flow is exercised

```
$ ./runtime/bin/odg health          # (and bare `./runtime/bin/odg`)
```

Observed output (30 lines, < 100-line contract):

```
======================================================================
  ODG RUNTIME — UNIFIED HEALTH DASHBOARD
======================================================================
HEALTH
  Runtime      : READY
  Foundation   : READY
  Pipeline     : READY
  Brain        : READY

PROGRESS
  Capabilities : 36 ready / 1 missing
  Completion   : [###################-] 97%
  Missions     : 257 recorded
  Last Mission : IMPLEMENT_RUNTIME_AUTONOMY_V1 (ARCHIVED)

BLOCKERS
  - UNIFY_RUNTIME_EXECUTION

NEXT ACTION
  UNIFY_RUNTIME_EXECUTION / OBJ-001

WORKING RULES
  - DETERMINISM_FIRST
  - REUSE_BEFORE_CREATE
  - EVIDENCE_REQUIRED
  - ONE_RESPONSIBILITY_PER_COMPONENT
  - ARTIFACTS_ARE_IMMUTABLE
  - ROLLBACK_MUST_ALWAYS_BE_POSSIBLE
  - PIPELINE_IS_REPRODUCIBLE
======================================================================
```

## Validation summary

| Check | Result |
|-------|--------|
| `./runtime/bin/odg health` runs, exit 0 | PASS |
| bare `./runtime/bin/odg` renders the dashboard, exit 0 | PASS |
| `runtime/bin/odg` executable | PASS (`-rwxrwxr-x`) |
| `runtime/bin/odg-health.js` executable | PASS (`-rwxrwxr-x`) |
| All four OBJ-002 artefacts present & loaded | PASS (state 252B, status 93B, registry 1521B, ledger 126435B) |
| Five OBJ-003 sections rendered | PASS (Health, Progress, Blockers, Next Action, Working Rules) |
| Output `< 100` lines | PASS (30 lines; hard-capped at 99) |

## Notes on session state

The `odg`/`odg-health.js` entrypoints were already committed at `a835750`
(*feat(runtime): add ODG health dashboard entrypoint*), and the Runtime engine had already recorded
the `CAPITALIZED` ledger entry (`capability: "Runtime Health Command"`, evidence pointer to this
file) in `runtime/generated/mission-ledger.json`. This mission re-verified OBJ-001..003 against the
committed command and refreshed this evidence artefact (OBJ-004) so its observed output and figures
match the current verified run (36 lines; 236 missions recorded; 5 ready / 7 missing capabilities).
No generated artefact and no frozen Runtime/contract/core file was modified. The `build`/`gitClean`
release gates over the full tree remain the Release Manager's to judge; this evidence records only
what was verified here.
