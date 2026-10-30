# ODG — Owner-Gated Dependency Dossier (V107 → re-verified MASTER CTO CAMPAIGN V2, 2026-10-30)

Produced per the CTO V107 mandate §4; **re-verified under MASTER CTO CAMPAIGN V2 (2026-10-30)**. Companion to
`AUTONOMOUS_FRONTIER_ANALYSIS.md` and `CAMPAIGN_V2_ACCEPTANCE_BILAN_2026-10-30.md`. Truth Lock at V2 re-verification:
`main` after Pole C (#282 `b41d5f5`) + Pole B (#283 `fbf7434`) merged; register **113 ACCEPTED / 7 BLOCKED /
1 IN_PROGRESS / 2 DEFERRED = 123, 0 stale**. The per-item dependencies, owner actions, resume tests and acceptance
criteria below were each re-checked against the current register and remain accurate; the 10 owner-gated items are
unchanged (none became self-clearable). The V2 engineering/intelligence defects were all computer-side and are now
ACCEPTED+MERGED — they are NOT owner-gated and are recorded in the V2 bilan, not here.

Purpose: for every remaining non-ACCEPTED item, state the **exact dependency**, **who/what must act**, the **non-privileged
preparation ODG has already completed**, the **missing evidence**, the **one-step resume test**, and the **acceptance
criterion**. ODG has driven each item to the last point reachable without a privileged/external/owner action. **Nothing
here is simulated, bypassed, or self-authorized.** This is a decision/action pack, not a claim of completion.

Legend — Authority required: **OWNER-EXEC** (privileged host action: sudo/systemd/exposure), **OWNER-POLICY** (a
governance decision), **THIRD-PARTY** (data/credentials only the owner or an external party can supply).

---

## A. BLOCKED — external/privileged (7)

### A1. `dashboard-tls-exposure` (P1) — Authority: OWNER-EXEC + exposure decision
- **Prep DONE (ACCEPTED):** readiness gate (`dashboard-exposure-readiness`), TLS/reverse-proxy templates, rollback runbook (`EXPOSURE_RUNBOOK.md`). All 6 controls implemented except `ownerExposureConfirmed`.
- **Owner must:** decide to expose the dashboard publicly; provide a real hostname + TLS cert; set `ODG_DASHBOARD_EXPOSURE_CONFIRMED=1`; run `EXPOSURE_RUNBOOK.md` (installs reverse-proxy/TLS, loopback upstream preserved).
- **Missing evidence:** owner exposure confirmation + hostname/cert.
- **Resume test / acceptance:** `dashboard-exposure-readiness` probe ⇒ `READY` (all 6 controls) AND public endpoint serves over TLS with auth + loopback upstream intact.

### A2. `structured-roadmap-deps` (P1) — Authority: OWNER-POLICY (protected-path write)
- **Prep DONE (ACCEPTED):** validated, cited `dependsOn[]` proposal preview at `docs/odg/ROADMAP.proposed.json` (`roadmap-deps-proposal-preview`).
- **Owner must:** authorize amending the PROTECTED `runtime/governance/ROADMAP.json` with the previewed `dependsOn[]` fields (governance-path write — ODG is guard-blocked from writing it).
- **Missing evidence:** owner authorization to write the protected governance file.
- **Resume test / acceptance:** `roadmap-schema-proposal.proposeFromRepo ⇒ VALID` AND governed `ROADMAP.json` carries `dependsOn[]` AND `roadmap-dep-check ⇒ OK`.

### A3. `campaign-runner-systemd-activation` (P2) — Authority: OWNER-EXEC
- **Prep DONE (ACCEPTED):** campaign-loop + `odg-campaign-run` entrypoint + spawned-process integration, all test-proven; `CAMPAIGN_RUNNER.md`.
- **Owner must:** authorize + configure an executor (`ODG_CAMPAIGN_EXECUTOR=verification`), install `odg-campaign.service`/`.timer`, `systemctl enable` (sudo).
- **Missing evidence:** privileged systemd install + executor authorization.
- **Resume test / acceptance:** `systemctl status odg-campaign.service ⇒ exit 0` structured stop; register ACCEPTED count rises across firings when admissible work + an authorized executor exist.
- **Non-privileged manual drive available now:** `ODG_CAMPAIGN_EXECUTOR=verification npx tsx runtime/bin/odg-campaign-run.ts docs/odg/closure-register.json` (accepts only lots carrying a real `exec` spec; none do today ⇒ honest IDLE, zero mutation).

### A4. `new-language-families` (P2) — Authority: OWNER-EXEC (3rd-party binary + sudo)
- **Prep DONE (ACCEPTED):** `code-execution` Dockerfile adapter WIRED (bin `hadolint`, argv-array, no-network), honestly `UNSUPPORTED` until the binary exists; `HADOLINT_INSTALL.md` (pinned binary + `sha256sum -c`). Category coverage already 0.9167 ≥ 0.6 (11/12; only Dockerfile/lint uncovered).
- **Owner must:** authorize + run the integrity-verified `hadolint` install (download pinned `hadolint-linux-x86_64` + checksums, verify, sudo-install to `/usr/local/bin`).
- **Missing evidence:** the installed, checksum-verified binary.
- **Resume test / acceptance:** `detectToolchain().Dockerfile ⇒ true`; `runSyntaxCheck` Dockerfile clean ⇒ PASS / lint-dirty ⇒ FAIL.

### A5. `broad-it-independent-eval-set` (P2) — Authority: THIRD-PARTY (independent labels)
- **Prep DONE (ACCEPTED):** ingestion + measurement harness (`broad-it-eval-ingest`), class-B preparation, independent-label admission policy (author≠ODG, dev/validation separated).
- **Owner/third-party must:** supply a genuinely INDEPENDENT labelled eval-set JSON (`provenance:{author≠ODG, independentOfEvaluee:true, sourceRef, devValidationSeparated:true, labellingMethod}`, `cases:[…]`). ODG must NOT self-label (would void independence).
- **Missing evidence:** the third-party labelled dataset.
- **Resume test / acceptance:** `npx tsx runtime/core/broad-it-eval-ingest.ts <set.json> ⇒ admitted:true` + `broadIT:MEASURED` with accuracy/confusion over the validation partition.

### A6. `p01-demand-validation` (P2) — Authority: OWNER (lawful external outreach)
- **Prep DONE (ACCEPTED):** pre-registered WTP protocol + fail-closed signal validator (`p01-demand-experiment-prep`).
- **Owner must:** authorize + run a lawful, consented WTP outreach/landing experiment; collect ≥5 REAL verified signals. No external contact without authorization.
- **Missing evidence:** ≥5 real verified demand signals.
- **Resume test / acceptance:** `demand-experiment.assessExperiment(realSignals) ⇒ DEMAND_VALIDATED`.

### A7. `p01-billing-sandbox` (P2) — Authority: OWNER (paid provider account) · depends on A6
- **Prep DONE (ACCEPTED):** sandbox cycle proven (`p01-billing-sandbox-cycle`) — idempotent replay, card-data refused, no prod charge.
- **Owner must:** after demand is validated (A6), authorize + provision a REAL sandbox provider account/credentials via secure config (test-env only).
- **Missing evidence:** real sandbox provider credentials.
- **Resume test / acceptance:** `p01-billing-sandbox.runSandboxCycle` against the real sandbox ⇒ PAID + idempotent replay + card-data refused + no prod charge.

## B. IN_PROGRESS — blocked in practice (1)

### B1. `broad-it-corpus-grow` (P2) — blocked on A4 + A5
- **State (audited):** category-coverage ALREADY met (ratio 0.9167 ≥ 0.6; 11/12 modes). `broadIT` stays `NO_DATA` because a credible success-rate needs A5 (independent eval set); the one uncovered mode (Dockerfile/lint) needs A4 (hadolint). No independent code lot remains.

## C. DEFERRED — owner product decisions (2)

### C1. `golden-path-scaffolder-poc` (P2) — OWNER-POLICY
Owner decision: productize an IDP/golden-path (templated catalog + plugins + benchmarked golden path) or keep as prototype. No code work admissible until decided.

### C2. `commercial-ops-substrate-h3` (P2) — OWNER-POLICY
Owner decision: (a) keep as internal substrate (default), or (b) authorize productizing an external multi-tenant CRM — which first requires reconciling the 2026-10-22 "will not claim a CRM product" disclaimer. No code work admissible until decided.

## D. Governance-POLICY correctness decision (no register item yet)

### D1. NL-classifier negation-scope (F1/F6) — OWNER-POLICY (see `AUTONOMOUS_FRONTIER_ANALYSIS.md §2`)
A strong negator separated from its verb by an interjection (connector or comma-aside) is genuinely ambiguous:
`do not, under any circumstances, delete X` (prohibition) vs `do not worry, delete the cache` (reassurance + real
instruction) share the SAME syntactic shape. No deterministic heuristic separates them (PROVEN: PR #245's reverted
over-reach). **Owner must choose the policy:** (i) bias to over-escalate prohibitions (safe, human-gated, but noisy);
(ii) keep-as-constraint-and-NONE; or (iii) authorize a semantic (LLM) classifier — which is the natural first consumer
of the future Local Intelligence Engine (§E). ODG will not decide this unilaterally (§4: no governance-rule change to
ease execution). Current behavior is documented and tested; the dangerous `… so delete` under-classification and the
`do not, aside, delete` over-classification are both recorded.

## E. Owner-gated executor authorization (no register item)

### E1. `engineering-executor` slice-2 — OWNER-POLICY
Slice-1 (deny-by-default governance ladder) is ACCEPTED. Slice-2 (a REAL injected executor that performs live
bounded modifications over `delegate-isolation.applyProposal` + campaign-loop + checkpoint/resume) is owner-gated:
it must not be self-authorized. Prep: the ladder, scope-containment, and evidence gate are built and tested.

---

## Summary for the owner — fastest unblocks
1. **A2 / A1** (P1): one governance authorization each; both previews/gates are done — highest leverage, lowest effort.
2. **A3** (systemd) + **A4** (hadolint): privileged host installs; scripts + adapters ready.
3. **A5 / A6 / A7**: require external data/credentials/consented outreach (the real product-validation path).
4. **D1 policy** + **E1 slice-2**: governance decisions that unlock the two substantive engineering frontiers.

Nothing above can be advanced by ODG without the stated authority. The continuous loop remains IDLE_BLOCKED with these
verifiable reasons and one-step resume tests; it resumes automatically the moment any dependency is satisfied.
