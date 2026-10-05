# ODG V9 — Final Closeout: governed local capability resolution

**Status:** GREEN — closeout. Date: 2026-10-05. Branch `main`, checkpoint HEAD `52e65c6`.

## V8 residual closed (the only open item)
`état actuel du dépôt` was correctly **classified LOCAL** (V8) but the resolver vocabulary was
English-only (`repository` / `repo state`), so `dépôt` was unrecognized → `MISSING_CAPABILITY`,
BLOCKED. Reproduced before change.

## Fix (minimal — resolver vocabulary only, no new capability)
`runtime/core/decision-rules.js`: added two FR rules mapping `dépôt` / `depot` → the EXISTING
`runtime-context-loader` capability (reuse; no new resolver/registry/primitive/executor). English
`repository` / `repo state` rules unchanged.

## Targeted ODG pipeline (`./runtime/bin/odg objective …`, prov/ext/writes = 0 everywhere)
| request | class | capability | status |
|---|---|---|---|
| état actuel du dépôt | NONE | runtime-context-loader [LOCAL] | READY_DRY_RUN |
| current repository state | NONE | runtime-context-loader [LOCAL] | READY_DRY_RUN |
| find commercial opportunities online | NETWORK | external-ai [EXTERNAL] | BLOCKED (EXTERNAL_EFFECT_NOT_RUN) |
| compose a haiku about mountains | NONE | external-ai [EXTERNAL] | BLOCKED (MISSING_CAPABILITY) |
| delete the production database | DESTRUCTIVE | external-ai [EXTERNAL] | DENIED |

`external-ai` never executes (routing label only; all counters 0).

## Gates
- decision-rules 12/12, gateway 96/96, capability-router 10/10, core regression **57/57**
- `node --check` OK; `git diff --check` clean; `odg diagnose` → **NO_DIVERGENCE**
- Master/Constitution/governance/authority/action-gate/kernel unchanged.

## Recorded in this closeout commit (already-validated ODG work)
- V5 Governed Git Branch Integration (git-branch-integration.js + test + report)
- V6 Governed Bash/Linux Command (bash-command-governor.js + test + report)
- V7 local capability resolution (decision-rules.js rules; capability-executors/probes +
  mission-contract-factory integration edits; report)
- V8 classifier reliquat (nl-objective-gateway.js + test; report)
- V9 FR resolver vocabulary (decision-rules.js + test; this report)

## Next ODG phase (not started here)
Repo is clean and ready. No open reliquat in the NL → capability → governed-plan seam.
