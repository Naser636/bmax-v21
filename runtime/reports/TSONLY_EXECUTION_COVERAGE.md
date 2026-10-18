# ODG TS-ONLY Execution Coverage — guard sweep + L7-FIX-6 (2026-10-18)

READ-ONLY sweep (bounded, non-destructive; tracked worktree verified unchanged). Reproducible guard:
`scripts/odg-jsload-guard.cjs` (passive require-hook, tags DIST/SRC, propagates to children via
`NODE_OPTIONS=--require`). Run e.g.:
`ODG_RUNTIME=ts ODG_JSGUARD_LOG=/tmp/g.log NODE_OPTIONS="--require scripts/odg-jsload-guard.cjs" node runtime/dist/bin/odg-run.js <M>`

## Per-path source-dual `.js` loads (ODG_RUNTIME=ts, default)
| Path | entry | source-dual loaded |
|---|---|---|
| mission + 13 stages | `runtime/dist/bin/odg-run.js` | **0** (dist=97) |
| converge | `runtime/dist/bin/odg-converge.js` | **0** (dist=464) |
| autonomy (loop+select+adapter+pipeline) | `runtime/dist/bin/odg-autonomy.js` | **0** (dist=1756, 2 src are js-only) |
| delegate (prepare-only, loader+brief+scope) | `runtime/dist/bin/odg-delegate.js` | **0** after L7-FIX-6 (was **13**) |

**L7-FIX-6**: the delegate path loaded 13 source dual `.js` (own `require(ROOT/runtime/core/*.js)` of
delegate-isolation/scope-observer/mission-lifecycle + the spawned SOURCE `runtime/core/mission-loader.js`).
Fixed by a `_corePort()` dist-preference helper (ODG_RUNTIME!=js → dist, else source) on all 4 sites in
both ports. Re-swept: delegate-ts dist=15, **srcDual=0**. ODG_RUNTIME=js delegate still loads source (15) —
rollback preserved.

## Rollback path (ODG_RUNTIME=js) — recovery coverage (source EXPECTED)
`odg mission` js-rollback loaded **55 source duals** (the js recovery graph); delegate-js loaded source (15).

## Per-dual union (125 duals)
- **61 EXECUTION-PROVEN loaded** on some swept path (dist-path 61 · rollback-path 56).
- **64 NOT loaded by the swept paths** = ~20 bin/bench ENTRYPOINTS (run as processes, not `require`d —
  classified ACTIF/ACTIF_ENTRYPOINT in the §4 static inventory) + capability-gated core modules
  (finance-sim/email-gateway/payments/quote/… — only load under a capability-specific mission).

## Verdict
TS entrypoint chain (mission/stages/converge/autonomy/delegate) is now **0 source-dual (TS-only)**.
**Global PASS_TS_ONLY still NOT established**: the 64 not-loaded duals need capability-specific missions
(or are direct entrypoints) to be execution-proven. NO rollback removed. Artifact:
`runtime/generated/per-dual-coverage.json` (regenerate via the guard + the per-dual mapper).
