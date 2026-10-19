# Canonical Mission Matrix — ROADMAP.json (11 missions)

**Date:** 2026-10-19 · **HEAD:** `881a0d4` · **Source:** `runtime/governance/ROADMAP.json` (11 missions; acceptance
lives in each mission's `contract` spec, NOT in ROADMAP.json). Statuses use: PROVEN (test/run evidence this session),
REPORTED (prior evidence, not re-verified now), NOT REVERIFIED, BLOCKED, NOT RUN. Fresh verdicts below came from
running the mission on the LOCAL route (`LocalMissionRunner`) this session, or its targeted tests.

| # | Mission | Mode | Status | Evidence (this session unless noted) | Next action |
|---|---|---|---|---|---|
| 1 | M0000 Architecture Compliance | AUDIT | **PROVEN** | LOCAL run → validated **SUCCESS** | none (re-run on change) |
| 2 | M0001 Mission Framework | AUDIT | **PROVEN** | LOCAL run → validated **SUCCESS** | none |
| 3 | M0002 Foundation Layer | AUDIT | **PROVEN** | LOCAL run → validated **SUCCESS** | none |
| 4 | CLEAN_RUNTIME_WORKSPACE | ENGINEERING(scan) | **PROVEN** | LOCAL run → validated **SUCCESS** (matches prior VERIFIED) | none |
| 5 | UNIFY_RUNTIME_EXECUTION | IMPLEMENT | **PROVEN** | LOCAL run → validated **SUCCESS** | none |
| 6 | DYNAMIC_MISSION_CONTRACT_FACTORY | ENGINEERING | **PROVEN (tests)** | `evidence.md` + `mission-contract-factory.test` PASS | none |
| 7 | PROVIDER_ENABLED_SMOKE_V1 | IMPLEMENT | **REPORTED** | `evidence.md` present; IMPLEMENT (writes `src/app/provider-smoke/`); not re-run via runner | re-run under engineering mode to re-PROVE |
| 8 | AUTONOMOUS_CONTRACT_EVOLUTION | ENGINEERING | **PROVEN (9/9 criteria)** | criterion-by-criterion this session: (1,2) corrective-queue-intake.test PASS (generateContract + readCorrectiveQueue materialize); (3) verify-exit-code.test PASS + runtime-verify `generatedContractsValid:true`; (4) runtime-verify.json exposes `generatedContracts`+`generatedContractsValid`; (5) `odg-generate-contracts.js` present + converge-cli.test PASS; (6) converge-cli.test PASS (invalid⇒PARTIAL); (7) `runtime/policies/runtime-policies.json` `contractOnDemand{enabled:true,capabilities:[…ACE]}`; (8) in ROADMAP; (9) adapter/corrective/delegate suites green | none (re-run on change) |
| 9 | GOVERNED_DASHBOARD_OBSERVABILITY | ENGINEERING | **PARTIAL (root-caused)** | dashboard capability PROVEN operationally this campaign (live, data-at-runtime fix, 12/12 + route tests). Mission's OWN validation = FAILED (verification 0/1, bare FAIL): the deterministic LOCAL route applies NO patch and produces NO capability-proof for an ENGINEERING mission whose `done_when` requires "Authorized patch applied". **NOT a contract/ledger/LOCAL defect** — the ledger correctly REFUSED (no false success); it is a route/executor mismatch. The substantive observability capability is already delivered, so there is **no genuine pending patch** — manufacturing one to green the done_when would be fabrication (REFUSED). | provider/engineering path WITH a genuine observability change; absent real work, do NOT force a pass |
| 10 | VPS_DEPLOYMENT_READINESS | AUDIT (13 gates A–M) | **PARTIAL** | A–D PROVEN (Phase 0–3: truth-lock+inventory, data↔release separation, versioned release layout + atomic switch, artifact completeness + runtime-state-at-runtime); I staging rehearsal PROVEN (real build activated on :4050); K activation/rollback criteria DEFINED (pipeline + README); L retention (immutable dirs kept, gated cleanup). **OPEN:** F post-reboot = NOT RUN; G restore-test = NOT RUN; H TLS/DNS/proxy = human-gated/not configured | run post-reboot + restore drills in an authorized window |
| 11 | DEPLOY_BMAX_DASHBOARD_PROD_V1 | OPERATIONAL | **BLOCKED** | requires TLS reverse proxy + public exposure + prod deploy + real-browser smoke — all forbidden/human-gated this mandate | CTO-authorized production window (out of scope here) |

## "20 missions" provenance
Searched all canonical sources (ROADMAP.json, `docs/odg-operational/*`, `ODG_PROJECT_STATE.md`) — **no "20 missions"
list exists in the repo**; every "20" hit is unrelated (20/20 benches, 20 assertions, mission-lifecycle 20, etc.).
The canonical set is **11**. No identifiers invented; the canonical roadmap was NOT modified to close the gap.

## Summary (updated Phase 5, 2026-10-19)
PROVEN: **7** (M0000/M0001/M0002/CLEAN_RUNTIME_WORKSPACE/UNIFY_RUNTIME_EXECUTION/DYNAMIC_MISSION_CONTRACT_FACTORY/
**AUTONOMOUS_CONTRACT_EVOLUTION** — the last upgraded NOT REVERIFIED→PROVEN via 9/9 criterion-by-criterion evidence).
REPORTED: **1** (PROVIDER_ENABLED_SMOKE_V1). PARTIAL: **2** (GOVERNED_DASHBOARD_OBSERVABILITY — capability proven,
mission-validation blocked WITHOUT fabrication; VPS_DEPLOYMENT_READINESS — A–D+I+K+L done, F/G/H open/NOT RUN).
BLOCKED: **1** (DEPLOY_BMAX_DASHBOARD_PROD_V1 — prod/TLS/public forbidden).
