# V126 — Consolidated Owner-Authorization Package & Deployment Cutover Plan

**Date:** 2026-11-11 · **Authority:** ODG is the sole governance/engineering authority; Claude Code is a bounded
technical supplier. **This document prepares owner-gated work. It authorizes nothing, signs nothing, and executes
nothing.** No owner approval, credential, secret, external label, operator acceptance, or production evidence is
fabricated here. Copy-ready authorization blocks are **TEMPLATES for the owner to issue** — they are unsigned.

**Companion (do not duplicate):** the audit + owner-gate matrix + deployment findings live in
`docs/odg/V125_POST_COMMIT_AUDIT_OWNER_GATE_AND_DEPLOYMENT_DOSSIER.md`. This V126 package adds the *executable*
artifacts: copy-ready authorizations, artifact checklists, and an ordered, maturity-aware cutover plan.

**Upstream divergence (V126 Phase 1):** `origin/main` (`22900dd`; PRs #487/#488/#489) has a tree **identical to the
merge-base `f2c887b`**, already an ancestor of this branch. Integration was a proven **content no-op** (merge result
tree == HEAD tree `5390eca`); reconciled by a no-ff provenance merge on the working branch only (`main` untouched, no
push, recoverable ref `v126-pre-reconcile-HEAD`). Branch is now 46 ahead / 0 behind. **Forensic note for the owner
(no action taken):** PR #489 resolved main's tree back to `f2c887b`, so the V48/V12.4 docs introduced by PR #488
(`41e377b`) are **not present in main's tip**; if their retention was intended, that is an owner decision on `main`
outside this branch's scope.

**Local closure (V126 Phase 2):** re-examined all 12 non-ACCEPTED items against canonical acceptance criteria —
**none is closable locally**; each requires a genuine external owner input, or is an intentional DEFERRAL. No item was
converted to ACCEPTED on prep-completion alone. Register remains **415 ACCEPTED / 6 BLOCKED / 3 IN_PROGRESS /
3 DEFERRED = 427**.

**Maturity vocabulary (never promoted across levels without the stated evidence):**
`Repository-valid` → `Locally validated` → `Pre-production validated` → `Production-host verified` → `Publicly
operational`.

---

## Part A — Research grant + external research scope + independently-labelled evaluation data

- **Canonical items:** `broad-it-independent-eval-set` (BLOCKED), `broad-it-corpus-grow` (IN_PROGRESS).
- **Owner input required:** (1) a narrowly-scoped research grant for the governed-research subsystem (the governor is
  fail-closed and never fetches without an owner-issued grant); (2) an **independently-labelled** broad-IT eval-set
  JSON whose provenance is `author ≠ ODG`, `independentOfEvaluee: true`, `devValidationSeparated: true`, with a
  `sourceRef`.
- **Why necessary:** a credible `VERIFIED_SUCCESS_RATE` needs ground-truth labels not authored by ODG; self-authored
  labels cannot change the verdict and fabricating labels is prohibited.
- **Min scope/duration:** one eval-set + a time-boxed grant (e.g. a fixed call/byte budget, expiry ≤ 30 days). Entails
  **external data** (+ optional research egress). No money, no credentials, no VPS.
- **ODG executes on receipt:** `npx tsx runtime/core/broad-it-eval-ingest.ts <set.json>` → `admitEvalSet` provenance
  gate → `broad-IT: MEASURED` (accuracy/confusion over the validation partition).
- **Independent gate before closure:** `admitEvalSet` returns `admitted: true` **and** `broad-IT` reports a MEASURED
  rate; closure only if the canonical acceptance ("external set passes admitEvalSet + disjoint dev/validation") holds.
- **Copy-ready authorization (TEMPLATE — owner issues):**
  > "I authorize ODG research grant `GRANT-<id>` scoped to [sources], budget [N calls / M bytes], expiry [date]. I
  > supply the independently-labelled eval-set at [path/URL] with provenance author=[third party], independentOfEvaluee=true,
  > devValidationSeparated=true, sourceRef=[ref]. No other egress is authorized."
- **Artifact checklist:** ☐ grant id + scope + budget + expiry ☐ eval-set JSON with provenance block ☐ source attestation.

## Part B — Production HMAC/signing key custody for audit-log integrity

- **Canonical item:** `p0e-audit-log-keyed-integrity` (BLOCKED, P0).
- **Owner input required:** choose the key strategy (HMAC-SHA256 runtime secret **or** asymmetric signed-tail per
  SLSA L2) + a stored trusted tip/length anchor; provision + store the key **out-of-band** (owner-gated secret custody).
- **Why necessary:** secret creation/rotation/storage is owner-gated per mandate; the mechanism is proven with a
  **test key only** (`audit-log.test`, 20 assertions) — no production key exists and none may be invented.
- **Min scope/duration:** one key + custody location (e.g. `0600 root:root` env file) + rotation policy. Entails a
  **credential/secret**. No money, no external data, no public exposure.
- **ODG executes on receipt:** wire the provisioned key via secure config (never printed/committed) and run the keyed
  verify-on-read gate.
- **Independent gate before closure:** full-rewrite OR tail-truncation of `scheduler-audit-chain.json` ⇒ keyed-verify
  `ok:false`; intact ⇒ `ok:true`; verify-on-read refuses the forgery (per `AUDIT_LOG_KEY_MANAGEMENT_OPTIONS.md`).
- **Copy-ready authorization (TEMPLATE):**
  > "I authorize audit-log integrity strategy = [HMAC-SHA256 | signed-tail]. The key is provisioned at [secure
  > location], custody [owner], rotation [policy]. ODG may read it via secure config but must never print, log, or
  > commit its value."
- **Artifact checklist:** ☐ strategy choice ☐ provisioned key location + perms ☐ tip/length anchor store ☐ rotation policy.

## Part C — Real billing credentials + spend authorization + lawful demand-validation experiment

- **Canonical items:** `p01-demand-validation` (BLOCKED), `p01-billing-sandbox` (BLOCKED). Contract order: billing
  follows validated demand.
- **Owner input required:** (1) authorize + run the lawful, consented WTP experiment and collect ≥5 real verified
  signals; (2) provision a real provider account/credentials via secure config (test-env; explicit spend cap).
- **Why necessary:** real WTP signals require lawful outreach ODG may not perform; a real provider requires a paid
  account ODG may not hold. The sandbox cycle is already proven (`p01-billing-sandbox`, 10 assertions; no charge).
- **Min scope/duration:** one experiment window + ≥5 signals; one provider test account + a bounded spend cap. Entails
  **money + credentials + (lawful) external contact**. No VPS, no public exposure.
- **ODG executes on receipt:** `demand-experiment.assessExperiment(realSignals)` ⇒ `DEMAND_VALIDATED`; then
  `p01-billing-sandbox.runSandboxCycle` against the real provider ⇒ PAID + idempotent replay + card refused.
- **Independent gate before closure:** ≥5 signals pass `validateSignal` vs the pre-registered threshold; sandbox cycle
  against the real provider stays idempotent with card-data refused and no uncapped charge.
- **Copy-ready authorization (TEMPLATE):**
  > "I authorize the lawful WTP experiment per the pre-registered protocol, window [dates], consent [method]. I
  > provision provider [name] test credentials at [secure config] with spend cap [amount]. No charge beyond the cap;
  > no live billing beyond test mode without a further decision."
- **Artifact checklist:** ☐ experiment protocol sign-off + window ☐ ≥5 real signals ☐ provider test credentials
  (secure) ☐ explicit spend cap.

## Part D — Public dashboard exposure + DNS/TLS/reverse-proxy + security acceptance

- **Canonical item:** `dashboard-tls-exposure` (BLOCKED, P1).
- **Owner input required:** explicit decision to expose publicly; a real hostname + TLS certificate; set
  `ODG_DASHBOARD_EXPOSURE_CONFIRMED=1`; accept the security posture.
- **Why necessary:** public exposure is an owner policy decision + needs real DNS/TLS assets. The readiness gate
  currently returns NOT_READY (token + owner-confirmation absent) and correctly keeps the service closed.
- **Min scope/duration:** one hostname + cert + exposure confirmation. Entails **public exposure + VPS (privileged)**.
  No money, no external data.
- **ODG executes on receipt:** run `EXPOSURE_RUNBOOK.md` (reverse-proxy/TLS, loopback upstream preserved); re-probe
  the readiness gate.
- **Independent gate before closure:** `dashboard-exposure-readiness` ⇒ READY (all 6 controls incl.
  `ownerExposureConfirmed`); authenticated TLS endpoint; 0 internal-state leak; verified rollback.
- **Copy-ready authorization (TEMPLATE):**
  > "I authorize PUBLIC exposure of the dashboard at hostname [host], TLS cert [source]. Set
  > ODG_DASHBOARD_EXPOSURE_CONFIRMED=1. Exposure must preserve loopback upstream + app-auth; refuse if the readiness
  > gate is not READY."
- **Artifact checklist:** ☐ exposure decision ☐ hostname ☐ TLS cert + key (secure) ☐ ownerExposureConfirmed=1.

## Part E — Campaign-runner systemd activation

- **Canonical item:** `campaign-runner-systemd-activation` (BLOCKED, P2).
- **Owner input required:** authorize + configure an AUTHORIZED executor; install + enable `odg-campaign.service/.timer`
  (privileged).
- **Why necessary:** systemd install/enable is privileged (sudo); the runner's Truth-Lock refusal (branch=main +
  HEAD==origin/main + clean tree) is a correct safety gate, not a defect. Entrypoint + tests are ready.
- **Min scope/duration:** one executor config + one systemd install. Entails **VPS (privileged)**. No money, no data,
  no public exposure.
- **ODG executes on receipt:** (owner installs the unit) — ODG verifies structured firings + checkpoint advance.
- **Independent gate before closure:** `systemctl status odg-campaign.service` ⇒ clean structured stop; register
  ACCEPTED count rises across firings with a durable checkpoint + verified rollback.
- **Copy-ready authorization (TEMPLATE):**
  > "I authorize an ODG campaign executor [identity/scope] and the systemd timer install per CAMPAIGN_RUNNER.md on
  > vps-6d919042. The runner retains its main-only Truth-Lock refusal."
- **Artifact checklist:** ☐ executor identity + scope ☐ systemd unit install approval ☐ checkpoint/rollback location.

## Part F — DEPLOY_BMAX deployment authorization + named operator acceptance + target/backup/rollback

- **Canonical item:** mission `DEPLOY_BMAX_DASHBOARD_PROD_V1` (PROPOSED; depends on `VPS_DEPLOYMENT_READINESS`, the one
  V123-4C edge). **NOT a register-closable item until executed by the owner/operator.**
- **Owner input required:** a **separate, explicitly recorded CTO deployment authorization** + a **named Release-
  Manager/operator acceptance**; independently verified target identity; a verified **off-host backup + restore
  proof**; a **real-host rollback drill**.
- **Why necessary:** the mission contract's own precondition; `VPS_DEPLOYMENT_READINESS` is HUMAN-GATED / no-autonomous-
  execution. Several mandatory evidences are currently UNVERIFIED (see the cutover plan).
- **Min scope/duration:** one deployment window + named operator. Entails **VPS (privileged) + public exposure (if
  prod)**. No external data; money only if infra is provisioned.
- **ODG executes on receipt:** prepare the versioned release + health-gated cutover steps for the operator; ODG does
  **not** perform the privileged cutover.
- **Independent gate before closure:** the full cutover plan (Part 2 below) passes each acceptance gate with the
  operator's recorded acceptance.
- **Copy-ready authorization (TEMPLATE):**
  > "I, [CTO], authorize deployment DEPLOY_BMAX_DASHBOARD_PROD_V1 to vps-6d919042 on [date]. Named operator:
  > [name/role], who accepts operational responsibility. Preconditions verified: target identity, off-host backup +
  > restore proof, real-host rollback drill. Deploy must refuse if any precondition is unmet."
- **Artifact checklist:** ☐ recorded CTO deployment authorization ☐ named operator + acceptance ☐ verified target id
  ☐ off-host backup + restore proof ☐ real-host rollback drill result ☐ monitoring/SLO config.

## Part G — External program definitions + market evidence

- **Canonical items:** `eleven-profession-program-definition` (IN_PROGRESS), `master-unified-campaign` (IN_PROGRESS),
  `broad-it-corpus-grow` (IN_PROGRESS — see Part A).
- **Owner input required:** the CTO **establishes the canonical eleven-profession / nine-specialty / 99-target
  definition** (none exists); supplies verifiable **dated external/market data** for the umbrellas.
- **Why necessary:** no canonical source exists; ODG must not fabricate a definition or market figures. Entails
  **external data + a governance decision**. No money, no credentials, no VPS.
- **ODG executes on receipt:** map the supplied definition/data onto the existing register + `capability-map`
  (anti-fabrication market-intelligence gate), without a parallel registry.
- **Independent gate before closure:** each umbrella's dated-evidence verdict; no self-authored figures admitted.
- **Copy-ready authorization (TEMPLATE):**
  > "I establish the canonical program definition at [doc/ref] (professions, specialties, targets) and supply dated
  > market data at [source]. ODG maps these onto the canonical register; no fabricated figures."
- **Artifact checklist:** ☐ canonical definition doc ☐ dated market-data source ☐ provenance.

## Shared-prerequisite reduction (legitimate, without merging distinct approvals)

Parts **D, E, F** share one enabler: **privileged VPS access on `vps-6d919042` + a named operator identity**. Onboarding
that operator + independently verifying the target **once** serves all three. **But their authorizations stay distinct**
— exposure (D) is a *policy* decision, systemd activation (E) is an *executor* authorization, and deployment (F) is a
*deployment* authorization; their contracts require separate go/no-go decisions and must not be bundled into one
approval. Parts A, B, C, G are independent (data / secret / billing / definition) and share no prerequisite.

---

## Part 2 — Ordered, dependency-aware deployment cutover plan (DEPLOY_BMAX)

Reconciled against `DEPLOYMENT.md` (gates A–L), `EXPOSURE_RUNBOOK.md`, `deploy/VPS_STATUS.md`,
`R3_BACKUP_RESTORE.json`, `ODG_INCIDENT_RUNBOOK.md`. **ODG performs none of the privileged/VPS steps.** Each step lists
its current maturity and the evidence that would promote it.

| # | Step | Current maturity | Evidence to promote / owner-operator action |
|---|---|---|---|
| 0 | **Build & artifact provenance** | Locally validated | `next build` exit 0 (standalone), `tsc` 0, gate 537/537; record the release artifact hash + source commit |
| 1 | **Owner authorization + named operator acceptance** | OWNER-GATED (absent) | recorded CTO deployment authorization + operator who accepts responsibility (Part F) |
| 2 | **Verified target identity** (`vps-6d919042`) | OWNER-GATED | operator independently verifies host identity (fingerprint); ODG does not connect |
| 3 | **Off-host backup + restore proof** | Locally validated (real-data restore) / **host-unverified** | `R3_BACKUP_RESTORE.json` = RESTORE_VERIFIED on real repo data, but **off-host destination undefined** ⇒ operator takes + verifies an off-host backup before mutation |
| 4 | **Real-host rollback drill + trigger** | **NOT PROVEN (host)** | mechanism proven locally (N↔N-1 build+health, byte-identical restore) — operator runs the live drill once; trigger = health/SLO breach ⇒ `odg-release.sh rollback --no-serve` + restart |
| 5 | **Pre-deploy readiness gates** | Pre-production validated | `deployment-readiness`, `canary-decision-pack`, `progressive-delivery-gate` green; `dashboard-exposure-readiness` must be READY if public |
| 6 | **TLS / DNS / reverse-proxy + authentication** | OWNER-GATED (not provisioned) | hostname + cert (Part D); `EXPOSURE_RUNBOOK.md`; loopback upstream + app-auth preserved; `DEPLOYMENT.md` marks DNS/TLS BLOCKED-BY-HOST |
| 7 | **Health-gated cutover** | PREPARED | `/api/health` 200 before traffic; versioned release switch |
| 8 | **Monitoring / SLOs / incident handling** | **NOT PROVEN** | SLO thresholds undefined until a real deployment measures them (`ODG_INCIDENT_RUNBOOK.md §7`) |
| 9 | **Post-deployment acceptance** | OWNER-GATED | authenticated `/api/runtime-state` ⇒ 401 no-token / 200 valid; 0 internal-state leak on `/`; operator records acceptance |

**Deployment MUST be refused if (any true):** no recorded CTO authorization + named operator acceptance; target
identity unverified; off-host backup/restore unproven or rollback target absent; `dashboard-exposure-readiness` ≠ READY
(for public); any required secret/credential absent; auth/TLS not enforced; a non-loopback bind without owner exposure
confirmation.

**Maturity ledger (no promotion without evidence):**
- `Repository-valid`: the committed tree (gate 537/537, tsc 0).
- `Locally validated`: build/typecheck/regression; rollback *mechanism*; real-data restore.
- `Pre-production validated`: readiness/supervision gates; loopback-preprod auth (recorded 2026-10-28).
- `Production-host verified`: **NOT YET** — needs off-host backup, live rollback drill, verified target, SLO monitoring.
- `Publicly operational`: **NOT YET** — needs owner exposure decision + DNS/TLS + post-deploy acceptance.

---

## Separation of claims

- **VALIDATED (in-repo):** upstream merge is a proven content no-op (tree unchanged); gate 537/537 + tsc 0 still hold
  for the unchanged tree; register 415/6/3/3=427.
- **CLOSED this campaign:** none (no item's canonical acceptance is locally satisfiable; no false closure).
- **PREPARED:** this owner-authorization package + cutover plan; all underlying runbooks/gates/sandbox cycles.
- **OWNER-GATED:** Parts A–G (research grant + labels; audit key; billing + demand; exposure; systemd; DEPLOY_BMAX
  authorization + operator + target/backup/rollback; external definitions/data).
- **NOT EXECUTED:** any VPS connection, SSH/sudo/systemctl, public exposure, deployment, paid call, secret creation,
  push, or PR. No owner decision, operator acceptance, external label, or production evidence was fabricated.
