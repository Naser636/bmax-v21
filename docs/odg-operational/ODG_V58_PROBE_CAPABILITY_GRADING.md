# ODG V58 — Deep Probe & Capability Grading (read-only)

> **Read-only forensic audit.** No runtime file, permission, generated artifact, or business datum modified.
> Every verdict ties to a source or a reproducible command. Statuses: PASS / FAIL / BLOCKED / SKIPPED /
> NOT-EXECUTED / MISSING-EVIDENCE. A control is EFFECTIVE only when a passing test exercises it.

- **Truth Lock @ start & end:** HEAD==origin==`142bf75` (V57 tip; code `fa51c1f`), branch `main`, divergence 0/0,
  worktree clean, index empty, 5 stashes. Builds on V54–V57 (executors already deeply audited in V57 — NOT re-audited).
- **Scope examined:** **15 probes** graded INDIVIDUALLY (declared / bound / executable / tested / live-verdict +
  evidence source); the **capability layer** of `runtime/generated/capability-registry.json` graded at the layer
  level (per-item deep grade of the 177 historical ledger-capabilities DEFERRED — see limits).

## Probe framework — method

`capability-probes.js` exposes `PROBES = { <evidence-name>: (ctx) => {ok,detail} }` (+ method-shorthand for the
4 structural probes) and an `evaluate()` required-proof gate (exported). Each probe is a PURE verdict over a REAL
generated-evidence artifact (probes 1–11) or a pure fs read of the current source tree (probes 12–15, structural
DoD). Fail-closed: absent / stale (run-ownership mtime < run start) / wrong-mode / malformed evidence ⇒ `ok:false`.
LOGIC proof: `capability-probes.test.js` **47 assertions PASS** (exercised THIS audit) — incl. anti-false-success
cases (e.g. "research-acquired: dry-run artifact still NOT ok"). CONSUMER/binding: `validation-engine` executes
`evaluate()`; the `capability-probes-finalized` probe itself verifies this wiring and PASSES.

## Probe matrix (15 — live read-only invocation, content-only ctx)

| # | Probe (evidence name) | Declared | Bound | Exec | Tested | Live verdict | Evidence source / reason |
|---|---|---|---|---|---|---|---|
| 1 | fleet-request-validated | ✓ | ✓ | ✓ | ✓ | **MISSING** | `runtime/generated/fleet/requests` — 0 VALIDATED for the probe mission (fail-closed, correct) |
| 2 | build-green | ✓ | ✓ | ✓ | ✓ | **MISSING** | `runtime-verify.json` build≠true now (no live build this audit) |
| 3 | typescript-green | ✓ | ✓ | ✓ | ✓ | **MISSING** | `runtime-verify.json` typescript≠true now |
| 4 | clean-workspace-scanned | ✓ | ✓ | ✓ | ✓ | **PASS** | `clean-workspace-scan.json` valid (1878 transient candidates, 0 deleted) |
| 5 | autonomy-observability-verified | ✓ | ✓ | ✓ | ✓ | **PASS** | `observability-verification.json` honest signal (measurable=false w/ reason) |
| 6 | external-research-dry-run-planned | ✓ | ✓ | ✓ | ✓ | **MISSING** | `external-research-acquisition.json` absent (capability not run) |
| 7 | spec-schema-valid | ✓ | ✓ | ✓ | ✓ | **MISSING** | `odg-spec-author.json` absent (capability not run) |
| 8 | internet-reachable | ✓ | ✓ | ✓ | ✓ | **PASS** | `connectivity-audit.json` http 2/2 reachable |
| 9 | research-acquired | ✓ | ✓ | ✓ | ✓ | **MISSING** | no acquisition evidence (reachability ≠ acquisition — strong anti-false-success) |
| 10 | git-branch-integrated | ✓ | ✓ | ✓ | ✓ | **MISSING** | evidence outcome=DRY_RUN (a dry-run/no-op does NOT satisfy; fail-closed) |
| 11 | bash-command-governed | ✓ | ✓ | ✓ | ✓ | **PASS** | `bash-command.json` — echo ran in genuine isolation (exit 0, network off) |
| 12 | legacy-runtime-retired | ✓ | ✓ | ✓ | ✓ | **PASS** | structural: `runtime/mission-standard` absent + no live reference in 4 launch files |
| 13 | samurai-output-mode | ✓ | ✓ | ✓ | ✓ | **PASS** | structural: odg-run.js ODG_VERBOSE gate + run-log tee + captured output |
| 14 | single-runtime-entrypoint | ✓ | ✓ | ✓ | ✓ | **PASS** | structural: no FALLBACK_TO_MSE, single mission-cli driver, local pipeline first-class |
| 15 | capability-probes-finalized | ✓ | ✓ | ✓ | ✓ | **PASS** | structural: PROBES registry + evaluate() gate wired into validation-engine + mission-contract-factory |

**Totals:** declared 15/15 · bound 15/15 · executable 15/15 (0 ERROR) · tested 15/15 (47 assertions) ·
**live-ok 8/15**; **7 MISSING-evidence** are CORRECT fail-closed verdicts (run-scoped evidence not materialized
in this static audit — NOT probe defects).

## Capability layer (`runtime/generated/capability-registry.json`)

- Re-read @HEAD: **177 capabilities · 15 missing · status READY · generatedAt 2026-10-15T20:23Z** (the registry is
  a GENERATED SNAPSHOT, static since 2026-10-15 — "177" is its recorded value, not a live re-derivation this audit).
- The 15 missing are REAL unbound mission identities (V56): deploy-perimeter (`VPS_DEPLOYMENT_READINESS`,
  `DEPLOY_BMAX_DASHBOARD_PROD_V1` — gated), `BUILD_RUNTIME`, several NL-gateway auto-stubs (`NL_*`). None phantom.
- The EXECUTABLE/VERIFICATION capability surfaces are the 9 executors (V57, deeply audited) + these 15 probes
  (V58). The 177 registry entries are historical proven-mission records (ledger projection), NOT re-executed here.

## Anomalies → root cause / minimal correction (none crossing the read-only scope)

| ID | Finding | Severity | Root cause | Minimal correction / decision |
|---|---|---|---|---|
| B1 | 7/15 probes report MISSING run-scoped evidence in a static audit | INFO (by design) | probes are fail-closed over run-produced artifacts; no live run this audit | none — expected; a live mission run would materialize the evidence |
| B2 | 8 live-PASS verdicts used content-only ctx (no `runStartedAtMs`) ⇒ run-ownership staleness NOT applied | LOW | audit has no run start time | honest limit: these 8 PASS reflect content validity, not run-ownership freshness |
| B3 | capability-registry.json is a static snapshot (2026-10-15), not live-derived | LOW/MED (carried from V55) | no live regenerate step in the audit path | governed register refresh (writes generated) — distinct mission (A2/V57) |
| B4 | 177 ledger-capabilities not individually re-graded for authority/evidence | — | out of proportion for one read-only pass | deep per-item grade = distinct bounded mission |

## Verdict — **PARTIAL (honest)**

- **Probes (15): GRADED individually.** Framework sound — all declared/bound/executable/tested; logic proven
  (47 assertions); fail-closed discipline confirmed live (8 PASS / 7 correctly MISSING / 0 ERROR). No probe defect found.
- **Capability layer:** enumeration re-verified (177/15 missing, snapshot); per-item deep grade DEFERRED.
- **Canonical A01–A54 / 166:** **NOT_ENUMERABLE / NON_PROUVÉ** (FROZEN Master fiches; no machine manifest) — unchanged, not certified; no fiche or evidence fabricated.
