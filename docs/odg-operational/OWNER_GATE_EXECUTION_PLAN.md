# OWNER_GATE_EXECUTION_PLAN — Technical Completion scope

**Generated:** 2026-10-31 · **Baseline:** origin/main `cd90e10` · **Authority:** CTO (Technical Completion Campaign) · **Orchestrator:** ODG.

Per the CTO Technical Completion Campaign, this plan covers ONLY technically-executable work on the local computer + the **private (non-public) VPS**. The following are **OUT OF SCOPE this phase and are NOT technical blockers**: company/banking, revenue/billing/payment, paid-provider credentials, public domain, **public TLS exposure**, public Internet release, customer acquisition, real production deployment.

A blocker is NOT reported resolved because a plan/template exists. Items stay BLOCKED until real acceptance evidence exists.

## A. Genuine in-scope technical items ODG can still execute autonomously (no owner needed)
1. **evidence-provenance keyed-HMAC** (D2/D7) — mirror the shipped audit-log mechanism (`p0e-audit-log-keyed-mechanism`, #326). Bounded, reversible, backward-compatible; closes the parallel keyless full-rewrite weakness in `evidence-provenance.ts`. **Status: next mission.**
2. **new-language-families toolchain-absent fail-closed** (D1) — when `hadolint` is absent, declare `BLOCKED_BY_TOOLCHAIN` fail-closed (reuse the confinement-suite pattern) + a mocked-binary test. Low value; prepared adapter already ACCEPTED.
3. **Status reconciliation (register-only, Axe C)** — `broad-it-corpus-grow` (coverage measured ≥0.6 in a later re-verify) and `structured-roadmap-deps` (companion no-op confirmed; no honest edges remain) — reconcile to measured reality via PR.

## B. In-scope items that require a PRIVATE-VPS / toolchain OWNER action (dev environment, not public)
| Item | Acceptance | ODG prepared (ACCEPTED dep) | Owner action (dev/private only) | Smallest unblock |
|---|---|---|---|---|
| `p0e-audit-log-keyed-integrity` (D2) | audit chain resists full-rewrite + truncation | mechanism shipped (#326): keyed-HMAC + tip-anchor, key is a param, no secret created | provision an HMAC key in the runtime env (`ODG_AUDIT_HMAC_KEY`) from a secret store; authorize wiring it into the callers; choose out-of-band tip-anchor storage + rotation | owner sets the key + authorizes wiring |
| `campaign-runner-systemd-activation` (D-Axe A) | runner executes on a schedule on the **private** VPS | `campaign-run-entrypoint` ACCEPTED; ODG can supply `.service`/`.timer` templates (no secrets) | `sudo` install + `systemctl enable --now` on the private VPS (reserved: sudo) | owner runs systemd install on the private VPS |
| `new-language-families` (D1) | Dockerfile lint via `hadolint` | adapter PREPARED + `langfamily-noinstall-checkers` ACCEPTED | authorize installing `hadolint` in the dev toolchain/image | owner supplies the binary |
| `broad-it-independent-eval-set` (D2/D3) | REAL independently-labelled eval set | `independent-label-admission-policy` ACCEPTED (ingestion + admission) | supply the externally-labelled dataset meeting the admission schema | owner supplies the dataset |
| `p0c3-frontdoor-vps-smoke` (Axe A) | front-door pipeline runs clean on the private VPS | ODG supplies the exact command | run `bash scripts/odg-local-pipeline.sh` once on the private VPS | owner runs the smoke on the VPS |

## C. OUT OF SCOPE this phase (NOT technical blockers; do not action)
- `dashboard-tls-exposure` (P1) — **public TLS exposure → OUT OF SCOPE.**
- `p01-demand-validation`, `p01-billing-sandbox` (P2) — **commercial / billing / payment → OUT OF SCOPE.**
- `golden-path-scaffolder-poc`, `commercial-ops-substrate-h3` (P2 DEFERRED) — **productization = owner commercial decision → OUT OF SCOPE.**
- `historical-roadmap-excellence-28jul-recover` (P0) — pure document recovery; owner supplies the original (confirmed absent from git history). Not a technical defect.
- `p0-autonomy-measure-slice3-delegate-provenance` (P0 DEFERRED) — measurement-only enhancement; current behaviour already honest; no technical defect.

## D. Dependency graph / execution order (in-scope only)
```
NOW (ODG autonomous, parallel-safe, no owner):
  p0e-audit-log-keyed-mechanism[ACCEPTED #326] ─▶ evidence-provenance keyed-HMAC (next mission)
  new-language-families toolchain-absent hardening (independent)
  status reconciliation: broad-it-corpus-grow, structured-roadmap-deps (register-only)
OWNER (private/dev only, any order):
  ODG_AUDIT_HMAC_KEY → p0e-audit-log-keyed-integrity
  systemd (private VPS) → campaign-runner-systemd-activation
  hadolint binary → new-language-families
  labelled dataset → broad-it-independent-eval-set
  VPS smoke → p0c3-frontdoor-vps-smoke
```

## E. Owner-action checklist (in-scope, private/dev only)
1. Provision `ODG_AUDIT_HMAC_KEY` (private secret store) + authorize wiring + tip-anchor storage.
2. Install the campaign systemd timer on the **private** VPS (`sudo`).
3. Install `hadolint` in the dev toolchain.
4. Supply the independently-labelled broad-IT dataset.
5. Run `scripts/odg-local-pipeline.sh` once on the private VPS.
6. (Governance) Decide whether to require human PR reviews on `main` (currently 0 required so autonomy works; force-push/deletion blocked, CI required).

## F. Exact next command (resume the in-scope technical campaign without repeating work)
```
git checkout main && git pull --ff-only origin main
# then ODG contracts the next in-scope mission: evidence-provenance keyed-HMAC (mirror audit-log #326)
```
