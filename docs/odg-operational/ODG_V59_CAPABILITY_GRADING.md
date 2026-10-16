# ODG V59 — Individual Capability Grading (read-only)

> **Read-only forensic audit.** No runtime file, permission, generated artifact, ledger, or business datum
> modified. Every finding ties to a source or a reproducible command. Statuses: PASS / FAIL / BLOCKED /
> SKIPPED / NOT-EXECUTED. No capability, binding, or proof fabricated; declared-without-proof stays unproven.

- **Truth Lock @ start & end:** HEAD==origin==`b7a9c9d` (V58 tip; code `fa51c1f`), branch `main`, divergence 0/0,
  worktree clean, index empty, 5 stashes. Builds on V54–V58 (executors V57, probes V58 — REUSED, not re-audited).

## Recomputed counts (not presumed) — and what "177" actually is

- `runtime/generated/capability-registry.json` @HEAD: **capabilities = 177 · missing = 15 · status READY ·
  generatedAt 2026-10-15** (static snapshot; the registry is a GENERATED projection, not live-derived this audit).
- **ROOT-CAUSE FINDING (proven):** the 177 `capabilities` entries are STRINGS, built by `runtime-model.js:70-71,187`
  as `Array.from(provenSet)` where `provenSet = {ledger entry .mission | entry.proven === true}`. So **"177
  capabilities" = 177 distinct PROVEN-MISSION IDs projected from the immutable append-only ledger (1099 entries)**
  — NOT 177 distinct capabilities, and explicitly NOT the canonical 166 (the register's own rule: "the 169 proven
  missions are NOT the 166 canonical capabilities — no mapping is asserted"). The JSON key name `capabilities` is a
  misnomer that the dashboard/health then count as "Available capabilities".
- **Breakdown of the 177:** 159 mission-like `UPPER_SNAKE` ids · 14 `NL_*` auto-generated stubs · **4 clear
  non-capability pollution**: `--help`, `--repair-mandate` (CLI flags mis-recorded as mission names), and 2
  sentence-ids (a French NL goal-text, and "Register the new capabilities in the official Capability Registry…").
  Verified the pollution is REAL in the ledger (`--help` / `--repair-mandate` are entries with `proven===true`).

## Individual grading of the EXECUTABLE / VERIFIABLE capability surface (24 — reused V57/V58)

The real capabilities that have code + binding + authority + evidence are the 9 executors and 15 probes; these were
graded INDIVIDUALLY in V57 (`ODG_V57_C5_DEEP_AUDIT.md`) and V58 (`ODG_V58_PROBE_CAPABILITY_GRADING.md`), re-confirmed
to match current code/contracts this pass (executors=9, probes=15 unchanged at HEAD):

- **9 executors (V57):** all WIRED · contract-clear · authority ENFORCED (controls exercised by passing tests:
  action-gate / capability-authorization 35 / bash-command-governor 52 / capability-executors 53) · execution-green.
  Evidence freshness MIXED (3 absent / 2 stale / 4 recent; gitignored `runtime/generated`, mtime-only).
- **15 probes (V58):** declared/bound/executable/tested 15/15 (logic 47 assertions); live 8 PASS / 7 correctly
  fail-closed MISSING-evidence / 0 ERROR; consumer = `validation-engine` (self-verified by `capability-probes-finalized`).

## Grading of the 177 ledger-projection "capabilities" (LAYER, not per-item capability certification)

These are PROVEN-MISSION RECORDS, not independently-executable capabilities with their own binding/authority.
Grading each as a "capability" would be the exact category error the register warns against. LAYER verdict:
- **Declared/recorded:** 177 (ledger `proven===true` projection). **Bound/executable/authority:** N/A — they are
  mission-completion facts, not live capabilities. **Certified as capabilities:** NO (and must not be asserted).
- The 15 `missing` are executable-unproven missions (deploy-gated `VPS_DEPLOYMENT_READINESS`/`DEPLOY_BMAX_DASHBOARD_PROD_V1`,
  `BUILD_RUNTIME`, `NL_*` stubs) — real, unbound, none phantom (V56/V58).

## Anomalies → root cause / minimal correction

| ID | Finding | Severity | Root cause (proven) | Minimal correction / decision |
|---|---|---|---|---|
| C1 | `capabilities[]` contains 4 non-capability ids (`--help`, `--repair-mandate`, 2 sentence-ids) + 14 `NL_*` stubs | **MEDIUM** (data quality; inflates dashboard "Available capabilities") | `runtime-model.js:70-71` admits ANY ledger `mission` string with `proven===true` into `provenSet`; the immutable ledger holds mis-recorded CLI-flag / goal-sentence mission names | **CTO mission (code, runtime file — out of read-only scope):** add a projection-time SANITIZE filter in `runtime-model.js` (exclude mission names matching `^-`, containing whitespace, or exceeding an id-length bound) and/or rename the JSON key `capabilities`→`provenMissions` + caveat. Write-set: `runtime/core/runtime-model.js` + `runtime-model`/`capability-registry` tests. Tests: filter keeps real ids, drops the 4 pollutant classes; byte-stable otherwise. Ledger NOT mutated (append-only). |
| C2 | Key name `capabilities` conflates proven-missions with capabilities | LOW/MED | historical naming | documentary caveat already in the register `rules`; a rename is part of C1's mission |
| C3 | Registry is a static snapshot (2026-10-15), not live-derived | LOW (carried V55/V58) | no live regenerate in audit path | governed register refresh (writes generated) — distinct mission |
| C4 | Canonical A01–A54 / 166 non-enumerable | — | no machine manifest | **NOT_ENUMERABLE / NON_PROUVÉ** kept; needs a CTO-authored canonical manifest + mapping |

## Coverage & verdict — **PARTIAL (honest)**

- **Inventoried:** 177 registry "capabilities" (recomputed + recharacterized) + 15 missing + 9 executors + 15 probes.
- **Individually graded (real capability surface):** **24** = 9 executors (V57) + 15 probes (V58), reused, matching current code.
- **Layer-graded:** the 177 ledger-projection ids (= proven-mission records; data-quality anomaly C1 with proven root cause).
- **Remaining / not proven:** per-item "capability" grading of the 159 mission-like ids is NOT meaningful (they are
  mission records, not capabilities — not fabricated into capabilities here); canonical A01–A54/166 stays NOT_ENUMERABLE.
- No code/runtime/permission change. No control claimed effective without a passing test. Historical census not rewritten.
