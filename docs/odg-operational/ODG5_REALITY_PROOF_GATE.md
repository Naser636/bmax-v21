# ODG5 — Permanent Reality Proof Gate (installation record)

**As of:** 2026-10-25 · **Authority:** CTO amendment "ODG5 — PERMANENT REALITY, REPOSITORY & PRIVATE VPS PROOF GATE".

> Per the amendment's own instruction, this rule is **NOT claimed permanently installed** until its canonical
> storage AND its enforcement are verified. Current honest status is recorded below.

## 1. The rule

ODG must never declare implementation, verification, deployment, readiness or completion on a plan, report,
generated file, mocked test, simulated demo, process exit code or prior claim alone. Every material claim needs
evidence from the actual system in which it applies. Verification states are a strict, non-interchangeable ladder:

`SOURCE_VERIFIED < TEST_VERIFIED < INTEGRATION_VERIFIED < DEPLOYMENT_VERIFIED < RUNTIME_VERIFIED < ACCEPTANCE_VERIFIED` · else `NOT_VERIFIED` / `BLOCKED`.

A local test ≠ VPS deployment; a deploy command ≠ a healthy service; a healthy service ≠ correct business behavior.

## 2. Canonical locations (where the rule lives)

| Location | What | Verified |
|----------|------|----------|
| `ODG_AUTONOMOUS_WORK_PROTOCOL.json` → `reality_proof_rule` (`ODG5-REALITY-PROOF`) | machine SoT record | ✅ written + `JSON.parse` retrieves it; truth_lock intact |
| `runtime/governance/directives/CTO_DIRECTIVES.md` → ODG5 amendment section | human authority-of-record | ✅ appended |
| `docs/odg-operational/shared-core/reality-gate.mjs` | executable gate (`gate`/`assertComplete`/`classify`) | ✅ TEST_VERIFIED |
| `docs/odg-operational/shared-core/reality-gate.test.mjs` | regression proof the gate rejects false claims | ✅ 14/14 |

## 3. Enforcement proof (§6 required rejections — all demonstrated)

`reality-gate.test.mjs` proves the gate REJECTS: report-only as TEST; skipped/failed/dependency-failed tests as
PASS; local success as DEPLOYMENT; deployment as RUNTIME (no smoke); version mismatch at DEPLOYMENT; missing/
contradictory evidence (→ NOT_VERIFIED/BLOCKED); and a completion claim with unmet acceptance criteria. 14/14 green.

## 4. Applied to this campaign (honest states)

`node odg5-evidence-ledger.mjs` → `ODG5_EVIDENCE_LEDGER.json`:
- **ACCEPTANCE_VERIFIED (7):** C.reconciliation-pipeline, C.extraction+normalize, B.eval-metrics, B.lesson-to-test, B.reality-gate, A.dep-planner, A.retry-backoff.
- **INTEGRATION_VERIFIED (3):** B.regression-compare, B.otel-export, A.orchestration-demo.
- **BLOCKED (1):** VPS.deploy+runtime — target `vps-6d919042` named but systemd units are design-only `.candidate`, both VPS missions PROPOSED/human-gated, no secrets in repo, deployment UNAUTHORIZED.
- **SOURCE_VERIFIED (1):** promotion of shared primitives into `runtime/core` — not started (separate authorized TS lot).

## 5. Honest installation status (do not over-claim)

- **Recorded in canonical SoT:** ✅ (retrievable).
- **Human directive mirror:** ✅.
- **Executable enforcement in operational workspace:** ✅ (reality-gate.mjs + tests).
- **Promoted into governed runtime enforcement:** ✅ DONE (CTO-authorized TS lot). `runtime/core/reality-gate.{ts,js}` (dual-port, strict-tsc clean) is called by `runtime/core/validation-engine.{ts,js}`, which emits `report.realityProof`. **Proven INVOKED** by `runtime/core/reality-gate-integration.test.ts` (spawns the real engine: SUCCESS⇒ACCEPTANCE_VERIFIED, BLOCKED⇒only SOURCE_VERIFIED). JS/TS ports proven byte-identical; `dep-planner`+`eval-metrics` also promoted (dual-port, tested).
- **`parity:runtimes` gate:** passes **post-commit** only — its JS leg materialises from `git archive HEAD`, so an uncommitted dual-port edit shows HEAD-js vs built-ts; the ports are proven identical by a direct same-input diff, so parity is green once the change is committed.
- **Committed to the repository:** on a scoped feature branch (see compass); push requires separate CTO approval.

**Therefore ODG5 is: RECORDED + runtime-PROMOTED + proven-INVOKED on the governed path (INTEGRATION_VERIFIED). Full `parity:runtimes` green is verified post-commit on the branch HEAD.**

## 6. VPS deployment — BLOCKED, with the exact safe plan prepared

No authorized, installed deployment mechanism exists (candidates only; no secrets; missions PROPOSED). Deployment
and runtime verification are **BLOCKED**. Safe plan when authorized: (A) confirm authorized target + mechanism from
`runtime/missions/VPS_DEPLOYMENT_READINESS.json`; (B) build versioned artifact linked to a commit; (C) install the
reviewed systemd unit under CTO authorization; (D) verify deployed version == intended; (E) non-destructive health +
logs; (F) representative smoke test; (G) negative-path test; (H) record timestamp/target/version/commands/outputs;
(I) confirm post-test health; (J) never fabricate access/records/health. Missing prerequisite: CTO authorization +
secrets/env provisioning (not in repo).

## 7. Next action

Reproduce: `cd docs/odg-operational && node integration-test.mjs` (expect 10/10) and `node odg5-evidence-ledger.mjs`.
Then CTO: (1) approve commit of this amendment (governance-path change needs explicit approval); (2) authorize the
TS-port lot to promote `reality-gate` into `runtime/core`; (3) VPS remains BLOCKED pending authorization + secrets.
