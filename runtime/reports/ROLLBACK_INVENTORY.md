# ODG Rollback Static Inventory (§4) — 2026-10-18

READ-ONLY. No rollback modified/moved/removed. Reproducible: `node scripts/odg-rollback-inventory.cjs` (classifier persisted).

**Exact count: 125 dual-rollback `.js`** (each has a `.ts` sibling). Authoritative source: `runtime/generated/js-inventory.json` buckets.dual-rollback.

## By class
- **TEST/OUTIL**: 20
- **ACTIF_ENTRYPOINT**: 5
- **ACTIF**: 76
- **INDIRECT**: 24

## Classification method + classes
- **ACTIF**: a live (non-test) module statically `require()`s the basename (resolves to `.js` on node/js-rollback, `.ts` under tsx, `dist` when compiled).
- **ACTIF_ENTRYPOINT**: CLI bin with `#!` shebang, run directly (`node runtime/[dist/]bin/odg-X.js`) — not require()d (absence of referrer is EXPECTED).
- **INDIRECT**: live dynamic/literal reference (legacyRequire / spawn `node X.js` / path.join).
- **TEST/OUTIL**: consumed by an equivalence bench / test (the bench PROVES `.js` == compiled `.ts`) or a test/bench entrypoint.
- **NON_REFERENCE_A_CONFIRMER**: 0.

## LIMITS / blind spots (honest)
1. Static basename matching CANNOT determine runtime resolution (`.js` vs `.ts` vs `dist`) — so ACTIF/INDIRECT means the basename is live-referenced, NOT that the `.js` SPECIFICALLY loads on the default/TS path.
2. CLI dispatch by command-name and direct `node X.js` execution are not `require()` edges — entrypoints show no referrer by nature (5 bins).
3. The L7 "73 never-exercised duals" is an EXECUTION property; static references cannot settle it. Removal needs global PASS_TS_ONLY (runtime proof across mission+stages+autonomy+converge+delegate+rollback), NOT this inventory.

## Verdict
**0 rollbacks provably unreferenced-and-removable.** Every dual twin is an entrypoint, live-referenced (resolution-ambiguous), indirect, or a bench/test tool, and all remain reachable via the `ODG_RUNTIME=js` rollback fallback. **NO removal justified; NO rollback removed.** Global PASS_TS_ONLY NOT established.

## Per-file (ACTIF_ENTRYPOINT + any NON_REFERENCE)
- runtime/bin/odg-autonomy.js — CLI entrypoint (shebang; run directly)
- runtime/bin/odg-client.js — CLI entrypoint (shebang; run directly)
- runtime/bin/odg-freeze.js — CLI entrypoint (shebang; run directly)
- runtime/bin/odg-migrate-plan.js — CLI entrypoint (shebang; run directly)
- runtime/bin/odg-reconcile.js — CLI entrypoint (shebang; run directly)
