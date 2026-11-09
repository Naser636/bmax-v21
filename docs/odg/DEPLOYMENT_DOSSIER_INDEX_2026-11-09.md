# V12.4 — Infrastructure & Deployment Dossier (CTO Continuation §9, 2026-11-09)

**Consolidation/index of EXISTING deployment artifacts (no duplication).** Local preparation + tests only; **nothing
exposed publicly, no real provider enabled, no spend (§9).** Owner-gated items marked `[OWNER-GATED]`.

| §9 topic | Existing artifact (real, in-repo) | State |
|---|---|---|
| Target architecture | `docs/odg-operational/DEPLOYMENT.md`, `ODG_DEPLOYMENT_OPERATIONS_GUIDE.md` | documented (mono-instance VPS; Next.js app + same-origin site + governed runtime) |
| Hosting | the existing single VPS (host IS the VPS) | provisioned; public exposure `[OWNER-GATED]` (`dashboard-tls-exposure`) |
| Environments | preprod candidate (`deploy/odg-preprod.service.candidate`) | prepared (candidate unit, not activated) |
| Backups / restore | `rollback-recovery-drill` (worktree + `cp -al`), checkpoint/resume engine | VALIDATED (reboot drill passed earlier) |
| Supervision | `deploy/odg-monitor.*.candidate`, `odg-healthcheck.*.candidate`, `/api/health` | prepared; systemd activation `[OWNER-GATED]` (`campaign-runner-systemd-activation`) |
| Security | `dashboard-auth` (fail-closed), static-route allowlist, `root-of-trust`, bash-governor, SSRF/egress guards | OP + gate-tested |
| Access management | `ODG_DASHBOARD_TOKEN` gating; key custody `[OWNER-GATED]` (`AUDIT_LOG_KEY_MANAGEMENT_OPTIONS.md`) | prepared |
| Deployment | `deploy/README.md`, `deploy/README-systemd.md`, `odg-frontdoor-smoke.sh` | documented; activation `[OWNER-GATED]` |
| Rollback | worktree rollback drill + `build-recovery-engine` | VALIDATED |
| Continuity | checkpoint/resume + the Boussole (single resume point) | OP |
| Incidents | `incident-resolution-lifecycle` (evidence-gated RESOLVED) | OP |
| Ops documentation | `ODG_DEPLOYMENT_OPERATIONS_GUIDE.md` | documented |
| Progressive delivery | `canary-decision-pack`, `progressive-delivery-gate`, `deployment-readiness` | OP + gate-tested |

## State

Infrastructure is **prepared and locally testable**; the readiness gates (`deployment-readiness`, `dashboard-exposure-
readiness`) are in place. **Three activations remain owner-gated and are NOT performed by ODG:** public TLS exposure,
systemd timer activation, and HMAC key custody. Each has a prepared runbook and a one-step resume test in
`OWNER_GATED_DEPENDENCY_DOSSIER.md`. Nothing was exposed, activated, or charged.
