# ODG V8 — Classifier reliquat: "current repository state" ≠ NETWORK

**Status:** GREEN (defect reproduced → fixed → verified; NO COMMIT / NO PUSH / NO NETWORK)
**Date:** 2026-10-05
**Checkpoint start:** HEAD `52e65c6`, branch `main`; V5 Git + V6 Bash + V7 resolver fix all present and preserved.

## Problem (reproduced before change)
`nl-objective-gateway.classifyObjective` listed the bare `"current "` as a NETWORK signal, so a local
repository-state read classified as an external NETWORK effect:
- `current repository state` → NETWORK (requiresExternal=true) — wrong
- `current repo state` → NETWORK — wrong
- (`état actuel du dépôt` / `…repository` were already NONE — no `"current "` substring.)

## Fix (minimum — one classifier line)
`runtime/core/nl-objective-gateway.js`: removed the over-broad `"current "` entry from the NETWORK
`EFFECT_FAMILIES` signal list. "Need live external data" intent is still carried by the precise signals
`live data` / `real-time` plus the concrete transport words (online/internet/web/http/url/fetch/download/
scrape/crawl/market/opportunit/browse/search the). No bare `"api"`/`"remote"` substring was added (would
over-match "capital"/"rapid"). Recognition/authority/action-gate/risk/C03/evidence unchanged.

## Classifier results after fix
| request | externalEffect | requiresExternal | expected |
|---|---|---|---|
| current repository state | NONE | false | LOCAL ✓ |
| current repo state | NONE | false | LOCAL ✓ |
| état actuel du dépôt | NONE | false | LOCAL ✓ |
| état actuel du repository | NONE | false | LOCAL ✓ |
| find commercial opportunities online | NETWORK | true | NETWORK ✓ |
| fetch data from the remote server | NETWORK | true | NETWORK ✓ |
| scrape the web for prices | NETWORK | true | NETWORK ✓ |
| get real-time market data | NETWORK | true | NETWORK ✓ |
| compose a haiku about mountains | NONE | false | unknown (V7 unchanged) ✓ |
| delete the production database | DESTRUCTIVE | false | unsafe (V7 unchanged) ✓ |

## Direct ODG pipeline (`./runtime/bin/odg objective …`, prov/ext/writes = 0 everywhere)
- `current repository state` → class NONE, cap `runtime-context-loader [LOCAL]`, **READY_DRY_RUN**
- `current repo state` → class NONE, cap `runtime-context-loader [LOCAL]`, **READY_DRY_RUN**
- `find commercial opportunities online` → class NETWORK, EXTERNAL_EFFECT_NOT_RUN (dry-run)
- unknown → MISSING_CAPABILITY abstain; unsafe → DENIED — V7 behaviour intact
- `external-ai` never executes (it is only a routing label; all network counters 0)

## Tests / gates
- gateway: **96/96** (79 V7 + 17 new V8 regression locks, case "22")
- decision-rules 7/7, capability-router 10/10, core regression **57/57**
- `node --check` OK; `git diff --check` clean; `odg diagnose` → **NO_DIVERGENCE**
- write-set = **2 files**: `nl-objective-gateway.js` + its test. Master/Constitution/governance/
  action-gate/kernel/V5/V6/V7-resolver **unchanged**. NO COMMIT / NO PUSH / NO NETWORK / NO SPEND.

## Not verified / limitation
The French `état actuel du dépôt` is now correctly **classified LOCAL (NONE)**, but the resolver
(`decision-rules.js`, V7 — outside V8's strict write-set) has only English keywords ("repository",
"repo state"), so the end-to-end dry-run still reports MISSING_CAPABILITY for the French phrasing. That is
a resolver-vocabulary concern, not a classifier one, and is deferred — no change made.
