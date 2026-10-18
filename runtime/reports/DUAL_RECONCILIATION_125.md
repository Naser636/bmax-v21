# ODG 125-Dual Reconciliation — final convergence (2026-10-18)

Every dual-rollback `.js` has a justified status (READ-ONLY; NO rollback removed). Reproducible via the guard sweep + capability equivalence benches + `runtime/reports/DUAL_RECONCILIATION_125.json`.

## Status counts (125)
- **NOT_APPLICABLE_ENTRYPOINT**: 20
- **PASS_EXERCISED**: 65
- **PASS_BY_BENCH**: 28
- **PASS_BY_TEST**: 2
- **TOOL_BUILD**: 10

## Legend / evidence
- **PASS_EXERCISED** (65): loaded on a swept TS-path (mission/13-stages/converge/autonomy/delegate) or proven by a capability equivalence bench run this campaign (finance-sim/email-gateway/quote/payments: dist loaded + ALL PASS).
- **PASS_BY_BENCH** (28): a standing `runtime/__bench__/<m>-equivalence.e2e.test.ts` proves `.js`==compiled-`.ts` (reproducible; method demonstrated on the 4 named).
- **PASS_BY_TEST** (2): `runtime/llm/{proposal-analyzer,response-parser}.js` — `spawn-cli-llm-parity.test.ts` 10/10 (dedicated LLM dual-port parity).
- **NOT_APPLICABLE_ENTRYPOINT** (20): CLI bin / bench run as a process (`node odg-X.js`), not `require()`d — require-coverage is N/A; exercised by direct execution (per §4 static ACTIF).
- **TOOL_BUILD** (10): build/test tooling (build:runtime / npm test / resume), outside the mission runtime graph.

## Known BLOCKED (environmental, NOT a regression)
- fleet-stage-equivalence **B2 live-spawn sub-test** fails (background fleet-bridge process; fleet-stage code UNTOUCHED this session; all parity value-checks PASS). Classified BLOCKED, never PASS.

## Verdict
**Default-runtime TS-ONLY chain: PROVEN** (0 source-dual on mission/stages/converge/autonomy/delegate — see TSONLY_EXECUTION_COVERAGE.md, L7-FIX-6). **Every dual justified.** **Global `.js`-REMOVAL PASS_TS_ONLY: NOT declared** — the 125 `.js` are the ODG_RUNTIME=js ROLLBACK (load-bearing on the js path: `odg mission` js loaded 55), retained by policy; the 28 PASS_BY_BENCH rely on standing CI benches (not all re-run here); removal requires per-file acceptance + recovery tests + explicit contract. NO rollback removed.
