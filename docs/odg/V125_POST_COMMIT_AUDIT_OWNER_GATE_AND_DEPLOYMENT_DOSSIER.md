# V125 — Post-Commit Forensic Audit · Owner-Gate Execution Matrix · Deployment Readiness Dossier

**Date:** 2026-11-11 · **Authority:** ODG is the sole decision/governance authority; Claude Code is a bounded technical
supplier. **This document records an audit and prepares owner-gated work. It is NOT a deployment, NOT an authorization,
and NOT production validation.** No VPS was connected to; no SSH/sudo/systemctl/remote probe was run; no secret,
credential, or key was created, displayed, logged, or committed; no paid call was made; no external label or operator
acceptance was fabricated.

This is a **single consolidated V125 output** that *references* the existing canonical artifacts
(`docs/odg-operational/DEPLOYMENT.md`, `docs/odg/deploy/EXPOSURE_RUNBOOK.md`, `docs/odg/deploy/VPS_STATUS.md`,
`docs/odg/DEPLOYMENT_DOSSIER_INDEX_2026-11-09.md`, `docs/odg/OWNER_GATED_DEPENDENCY_DOSSIER.md`,
`docs/odg/V121_OWNER_READINESS_DOSSIER.md`, `docs/odg/R3_BACKUP_RESTORE.json`, and the canonical
`docs/odg/closure-register.json`) rather than duplicating them.

**Labels used throughout:** `VALIDATED` (proven by in-repo evidence) · `PREPARED` (code/runbook ready, not executed) ·
`OWNER-GATED` (requires an owner input ODG cannot self-supply) · `NOT EXECUTED`.

---

## Part 1 — Post-commit forensic audit (VALIDATED)

**Audited commit:** `2382665a6354c478d5c6a69b696293f588a50fc9` · parent `9747ad1` · branch
`excellence/v3-wave3-demonstrators-20261101` · author `ODG Runtime` + `Co-Authored-By: Claude Opus 4.8`. `origin/main`
= `22900dd` (untouched); branch is 44 ahead / 3 behind (pre-existing fork divergence; nothing pushed). Working tree:
clean except the pre-existing foreign untracked items (`bmax-v21@0.1.0`, `docs/action-film/`, `docs/ecommerce/`,
`docs/film-factory/`, `docs/market-research/`, `tsx`) — untouched.

**Eight changed files, each justified (diff-verified):**

| # | File | ± | What changed | Verdict |
|---|---|---|---|---|
| 1 | `runtime/governance/ROADMAP.json` | +2 −1 | Adds **only** `"dependsOn": ["VPS_DEPLOYMENT_READINESS"]` to `DEPLOY_BMAX_DASHBOARD_PROD_V1`; `roadmapContractVersion` unchanged; no other mission touched | Authorized edge **only** ✓ |
| 2 | `runtime/core/roadmap-schema-proposal.test.ts` | +13 −4 | Regression lock case (7) transitioned from "no dependsOn" ⇒ "EXACTLY the one authorized edge, no extras" (strictly stronger) + banner | Stronger lock ✓ |
| 3 | `docs/odg/closure-register.json` | +17 −12 | **Exactly 3** items BLOCKED→ACCEPTED (`structured-roadmap-deps`, `historical-roadmap-excellence-28jul-recover`, `adr-166-capabilities-reconciliation`) with cited evidence + `staleEvidence:false` + `resolvedUnder:CTO-V123`; prior block context kept as `priorBlock*`. Item set unchanged (427→427) | Scope confined ✓ |
| 4 | `docs/odg-operational/ODG_DECISION_CHANGELOG.md` | +57 −0 | **Pure append** of `DEC-166-RECONCILED`, `DEC-HIST-28JUL-RECON-ACCEPT`, `CHG-V123-4C`. Zero deletions ⇒ `DEC-V60-166-RETIREMENT` and all prior entries preserved verbatim | DEC-V60-166 verbatim ✓ |
| 5 | `docs/odg/ADR-166-CAPABILITIES-RECONCILIATION-PROPOSAL.md` | +13 −6 | Title/status banner PROPOSED→RATIFIED + historical note; explicitly "does not modify the frozen `DEC-V60-166-RETIREMENT` (preserved verbatim)"; proposal body unchanged | Preserves original ✓ |
| 6 | `docs/odg-operational/EXCELLENCE_ROADMAP_RECONCILIATION_V1.md` | +1 −1 | §2 state cell ⇒ "ACCEPTED as RECONSTRUCTION-SUBSTITUTE… NOT the original, which remains **UNLOCATED**" | Labelled reconstruction; original UNLOCATED ✓ |
| 7 | `ODG_PROJECT_STATE.md` | +2 −0 | V123 compass entry incl. final gate result | Journal ✓ |
| 8 | `docs/odg/V123_UNBLOCK_COMPLETION_REPORT.md` | +149 −0 | New 17-point report | Deliverable ✓ |

**Secret/artifact scan:** no private key, API key, token, password, `.pem`, `.env`, or credential in the added lines
(the only "secret" matches are prose *describing* owner-gated policy). No generated/binary/`dist/`/`node_modules`
artifacts committed.

**Three owner-authorized changes confirmed:** (4C) protected ROADMAP.json limited to the single authorized edge;
(4B) ADR-166 preserves the accepted `DEC-V60-166-RETIREMENT` verbatim (changelog +57 −0); (4A) historical roadmap
explicitly a **reconstruction**, original **UNLOCATED**.

## Part 2 — Evidence consistency (VALIDATED)

Cross-checked across report, compass, decision changelog, and the canonical register:

| Claim | Report | Compass | Canonical | Agree |
|---|---|---|---|---|
| Gate `537 TOTAL · 537 PASS · 0 FAIL · 0 BLOCKED · 0 SKIPPED · 0 NOT_RUN`, exit 0 | ✓ | ✓ | gate log `[GATE_FINAL_EXIT 0]` | ✓ |
| `tsc -p tsconfig.json` = 0 and `tsconfig.runtime-leaves-strict.json` = 0 | ✓ | ✓ | re-run this session: both 0 | ✓ |
| Register `415 ACCEPTED / 6 BLOCKED / 3 IN_PROGRESS / 3 DEFERRED = 427` | ✓ | ✓ | `closure-register.json` counts exactly this | ✓ |
| Decision IDs cross-referenced | ✓ (`DEC-166-RECONCILED`, `DEC-HIST-28JUL-RECON-ACCEPT`, `CHG-V123-4C`) | — | each flipped item's `evidence` cites its exact decision | ✓ |

**No concrete reason to re-run the 537-suite gate was found; it was not re-run** (per directive). `tsc` was re-run
(cheap) and both configs returned 0.

## Part 3 — Owner-gate execution matrix (OWNER-GATED)

For every remaining BLOCKED (6) and IN_PROGRESS (3) item. "Prep (VALIDATED)" lists the ACCEPTED engineering already in
place; "Owner input" is the minimum sufficient authorization/artifact; "Unlocks" is the exact next action; "Locus" ∈
{local, research, credentials, VPS}. None of these can be self-supplied; **nothing here is fabricated.**

### Consolidated group α — Billing & demand (P-01)
`p01-demand-validation` + `p01-billing-sandbox` share a contract chain (billing follows validated demand).
- **Status:** both BLOCKED.
- **Prep (VALIDATED):** `p01-demand-experiment-prep` (pre-registered protocol + fail-closed WTP validator);
  `p01-billing-sandbox-cycle` (`p01-billing-sandbox` suite: invoice→payment→reconcile, idempotent replay, card-data
  refused, `LIVE_REFUSED` guard — 10 assertions).
- **Why owner-necessary:** real WTP signals require lawful, consented outreach; a real provider requires a paid
  account + credentials. ODG may not contact people or hold payment credentials.
- **Owner input:** (1) authorize + run the lawful WTP experiment, collect ≥5 real verified signals; (2) after demand is
  validated, provision a real provider account/credentials via secure config (test-env; no prod charges).
- **Unlocks:** `demand-experiment.assessExperiment(realSignals)` ⇒ `DEMAND_VALIDATED`; then
  `p01-billing-sandbox.runSandboxCycle` against the real provider ⇒ PAID + idempotent + card refused + no prod charge.
- **Locus:** research (experiment) + credentials (provider). **Safe stop:** no external contact / no live charge
  without authorization. **Independent validation:** replay-idempotency + card-data-refusal asserted by the suite.

### Consolidated group β — Research evaluation data (broad-IT)
`broad-it-independent-eval-set` (BLOCKED) + `broad-it-corpus-grow` (IN_PROGRESS).
- **Prep (VALIDATED):** `independent-label-admission-policy` / `admitEvalSet` (rejects ODG-authored labels; requires
  independent provenance + disjoint dev/validation); category-coverage already met (ratio 0.9167, 11/12 modes;
  only Dockerfile/lint uncovered, hadolint-gated).
- **Why owner-necessary:** a credible `VERIFIED_SUCCESS_RATE` needs ground-truth labels **not authored by ODG**;
  fabricating labels is prohibited and would invalidate the metric.
- **Owner input:** a third party/upstream supplies an independently-labelled eval-set JSON with provenance
  (`author≠ODG`, `independentOfEvaluee:true`, `devValidationSeparated:true`, `sourceRef`).
- **Unlocks:** `broad-it-eval-ingest.ts <set.json>` ⇒ `admitted:true` + `broadIT:MEASURED` (accuracy/confusion over the
  validation partition, real checker vs external labels).
- **Locus:** research/data. **Safe stop:** `broad-IT = NO_DATA` until an admitted external set exists (self-authored
  cases cannot change the verdict). **Independent validation:** `admitEvalSet` provenance gate.

### γ — Audit-log keyed integrity · `p0e-audit-log-keyed-integrity` (BLOCKED, P0)
- **Prep (VALIDATED):** keyed-HMAC + tip-anchor mechanism proven (`audit-log.test`, 20 assertions: full-rewrite
  resistance + tail-truncation detection) **with a test key only**; options + one-step activation in
  `docs/odg/AUDIT_LOG_KEY_MANAGEMENT_OPTIONS.md`.
- **Why owner-necessary:** secret creation/rotation/storage is owner-gated per mandate; no production key exists.
- **Owner input:** decide the key strategy (HMAC-SHA256 runtime secret, or asymmetric signed-tail per SLSA L2) + a
  stored trusted tip/length anchor; provision + store the key out-of-band.
- **Unlocks:** with a provisioned key — full-rewrite OR tail-truncation of `scheduler-audit-chain.json` ⇒ keyed-verify
  `ok:false`; intact ⇒ `ok:true`; verify-on-read refuses the forgery.
- **Locus:** credentials (secret). **Safe stop:** no key invented/printed/committed. **Independent validation:** the
  20-assertion keyed suite re-run against the provisioned key.

### δ — Dashboard public TLS exposure · `dashboard-tls-exposure` (BLOCKED, P1)
- **Prep (VALIDATED/PREPARED):** `dashboard-exposure-readiness` gate (5/6 controls implemented), TLS/reverse-proxy
  templates, `EXPOSURE_RUNBOOK.md` rollback runbook. Live preflight currently returns **NOT_READY** (token +
  owner-confirmation absent) — the gate correctly keeps the service closed.
- **Why owner-necessary:** public exposure is an owner policy decision + needs a real hostname and TLS certificate.
- **Owner input:** confirm PUBLIC exposure; provide hostname + TLS cert; set `ODG_DASHBOARD_EXPOSURE_CONFIRMED=1`;
  execute `EXPOSURE_RUNBOOK.md` (reverse-proxy/TLS, loopback upstream preserved).
- **Unlocks:** readiness probe ⇒ `READY` (all 6 controls incl. `ownerExposureConfirmed`); authenticated, TLS,
  access-controlled public endpoint with verified rollback.
- **Locus:** VPS (privileged) + exposure decision. **Safe stop:** no public bind without READY + owner confirmation.
  **Independent validation:** `dashboard-exposure-readiness` 6-control probe.

### ε — Campaign-runner systemd activation · `campaign-runner-systemd-activation` (BLOCKED, P2)
- **Prep (VALIDATED):** `campaign-run-entrypoint` (`campaign-loop` + `odg-campaign-run` + spawned-process integration,
  test-proven). The Truth-Lock main-only refusal is a correct safety gate, not a defect.
- **Why owner-necessary:** installing/enabling a systemd unit is privileged (sudo); an AUTHORIZED executor must be
  configured.
- **Owner input:** authorize + configure an executor; install `odg-campaign.service/.timer` and enable per
  `CAMPAIGN_RUNNER.md`.
- **Unlocks:** `systemctl status odg-campaign.service` ⇒ clean structured stop; register ACCEPTED count rises across
  firings when admissible work + an authorized executor exist.
- **Locus:** VPS (privileged). **Safe stop:** runner refuses unless branch=main + HEAD==origin/main + clean tree.
  **Independent validation:** durable checkpoint + verified rollback across firings.

### ζ — VPS production deployment (the `DEPLOY_BMAX_DASHBOARD_PROD_V1` cutover)
See Part 4. Owner input: a **separate explicit recorded CTO deployment authorization + named Release-Manager/operator
acceptance**, plus verified target/backup/rollback at deploy time. **Locus:** VPS. **NOT EXECUTED.**

### η — External program umbrellas
`eleven-profession-program-definition` (IN_PROGRESS) and `master-unified-campaign` (IN_PROGRESS).
- **Prep (VALIDATED):** `master-unified-campaign` Wave 0 register + provenance mapping exists (references, does not
  overwrite, the canonical register/roadmaps).
- **Why owner-necessary:** no canonical definition of the eleven professions / nine specialties / 99 targets exists;
  the umbrellas need verifiable dated external/market data (not self-authored).
- **Owner input:** establish the canonical program definition; supply verifiable dated external data.
- **Unlocks:** each umbrella's dated-evidence verdict. **Locus:** research/data. **Safe stop:** no fabricated external
  data/market figures. **Independent validation:** anti-fabrication market-intelligence gate.

_Deferred by design (not blocked, no owner action requested):_ `golden-path-scaffolder-poc`,
`commercial-ops-substrate-h3`, `p0-autonomy-measure-slice3-delegate-provenance`.

## Part 4 — Deployment readiness dossier (PREPARED / OWNER-GATED / NOT EXECUTED)

**Target identity (to be independently verified by the owner at deploy time — not re-probed here):** single VPS
`vps-6d919042` (host *is* the VPS). Canonical topology in `DEPLOYMENT.md` + `ODG_DEPLOYMENT_OPERATIONS_GUIDE.md`
(mono-instance; Next.js standalone + same-origin site + governed runtime).

**Recorded prior state (historical evidence, `deploy/VPS_STATUS.md`, read-only probe 2026-10-28 — NOT a live reading
this session):** `odg-preprod.service` active, serving `rel-20261028T210754Z-e84a0cf2720b`, **loopback `127.0.0.1:3000`
only (0 public binds)**, fail-closed dashboard auth ACTIVE (`/api/runtime-state` ⇒ 401 without token, 200 with valid
token; `/` leaks 0 internal-state markers), `ODG_DASHBOARD_TOKEN` provisioned `0600 root:root` (fingerprint only, value
never printed), rollback target `previous → rel-20261026T170857Z`. **This is preproduction, loopback-only — it is NOT
public production and is NOT the `DEPLOY_BMAX` prod cutover.**

### 4.1 What is VALIDATED (in-repo evidence)
- Build + typecheck + regression: `next build` exit 0 (standalone), `tsc --noEmit` exit 0, full gate 537/537
  (this campaign). (`DEPLOYMENT.md` A-block PROVEN.)
- Rollback/recovery **mechanism** end-to-end (local, isolated worktree + synthetic store): N↔N-1 build exit 0 + health
  200, backup/restore byte-identical, corruption fail-closed. (`DEPLOYMENT.md`; `build-recovery-engine`.)
- Backup/restore on **real repo data**: `R3_BACKUP_RESTORE.json` ⇒ `RESTORE_VERIFIED` (not an in-memory drill).
- Supervision + readiness gates present and gate-tested: `deployment-readiness`, `dashboard-exposure-readiness`,
  `canary-decision-pack`, `progressive-delivery-gate`; health endpoint read-only + no-leak (12/12).
- Loopback preprod auth active (recorded 2026-10-28, owner-authorized then).

### 4.2 What remains UNVERIFIED (mandatory before a public production cutover)
- **Off-host backup destination** — undefined ⇒ off-host copy/restore **BLOCKED BY HOST** (`DEPLOYMENT.md`). A real
  off-host backup + restore proof is required before any mutating cutover.
- **Rollback drill on the LIVE host** (real store + supervisor + public probe) — **NOT PROVEN** (only local mechanism
  proven).
- **DNS / TLS / reverse-proxy** — **BLOCKED BY HOST**, not provisioned; no nginx/TLS artifact shipped.
- **Public reachability** of `/api/*` and `/site/*` over DNS/TLS — **NOT PROVEN**.
- **Numeric SLO thresholds + monitoring** — **NOT PROVEN** (require a real deployment to measure;
  `ODG_INCIDENT_RUNBOOK.md §7`).
- **Separate explicit CTO deployment authorization + named operator acceptance** — the `DEPLOY_BMAX` contract's own
  precondition — **absent**.

### 4.3 Ordered gates (owner-executed; ODG does not perform these)
1. **Pre-deployment:** record the explicit CTO deployment authorization + named Release-Manager/operator; independently
   verify target identity `vps-6d919042`; take + **verify an off-host backup** (restore proof) of store + release
   state; confirm the rollback target release exists.
2. **Exposure prerequisites (if public):** provide hostname + TLS cert; set `ODG_DASHBOARD_EXPOSURE_CONFIRMED=1`;
   `dashboard-exposure-readiness` ⇒ READY (all 6 controls); auth enforced; loopback upstream preserved.
3. **Deployment (owner-exec):** versioned release switch + reverse-proxy/TLS per `EXPOSURE_RUNBOOK.md`; health-gated
   cutover (`/api/health` 200 before traffic).
4. **Post-deployment acceptance:** authenticated `/api/runtime-state` ⇒ 401 without token / 200 with; 0 internal-state
   leak on `/`; SLO/monitoring active; **execute the live rollback drill once** and verify N↔N-1.
5. **Rollback trigger/procedure/verify:** on health/SLO breach ⇒ `scripts/odg-release.sh rollback --no-serve` +
   `systemctl restart odg-preprod.service`; verify health 200 on the previous release.

### 4.4 Deployment MUST be refused if (any true)
- No separate recorded CTO deployment authorization + named operator acceptance.
- Target identity not independently verified, OR off-host backup/restore not proven, OR rollback target absent.
- `dashboard-exposure-readiness` ≠ READY, OR auth/TLS not enforced, OR a non-loopback bind without owner exposure
  confirmation.
- Any required secret/credential absent (do not fabricate or bypass authentication).

---

## Separation of claims (as mandated)

- **VALIDATED (in-repo):** the V123 commit (clean, scoped, no secrets); gate 537/537 + tsc 0; register 415/6/3/3=427;
  build/typecheck/regression; rollback *mechanism* + real-data restore; readiness/supervision gates; loopback preprod
  auth (recorded 2026-10-28).
- **PREPARED (not executed):** TLS/reverse-proxy templates, exposure + campaign-runner + key-custody runbooks, billing
  sandbox cycle, WTP protocol, eval-admission policy.
- **OWNER-GATED (ODG cannot supply):** research grant + independent labels; audit-log production key; real billing
  credentials + lawful demand experiment; public TLS exposure; systemd activation; the DEPLOY_BMAX authorization +
  operator acceptance + verified target/backup/rollback; external program definitions + market data.
- **NOT EXECUTED:** any VPS connection, SSH/sudo/systemctl, public exposure, deployment, paid call, or secret creation.

**Nothing prepared here is production deployment readiness while the §4.2 mandatory evidence is missing, and no
simulated/loopback evidence is presented as public-production validation.**
