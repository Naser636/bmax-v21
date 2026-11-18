# Dashboard-Exposure — local preparation audit (V315 Chantier A)

**Status: PREPARED + AUDITED, NOT EXPOSED.** No public listener, no TLS/DNS activated, no bascule. This dossier
records the audit of the existing exposure preparation and the live local evidence gathered on an isolated slot.
Commit audited: `bb9e3928` (main). ODG is the sole validation authority; this is a technical-provider audit, not a PASS.

## Readiness gate (real on-disk probe)

`npx tsx runtime/core/dashboard-exposure-readiness.ts` → verdict **NOT_READY** (fail-closed), with **4 of 6 controls
already satisfied on disk** and **2 genuinely owner-runtime**:

| Control | State | Owner of the remaining action |
|---|---|---|
| `tlsTermination` | ✅ present (`reverse-proxy.Caddyfile`) | — |
| `reverseProxyConfigured` | ✅ present (`reverse-proxy.Caddyfile`) | — |
| `accessControlConfigured` | ✅ present (`access-control.md`) | — |
| `rollbackProcedure` | ✅ present (`EXPOSURE_RUNBOOK.md`) | — |
| `authTokenConfigured` | ❌ env `ODG_DASHBOARD_TOKEN` unset | **OWNER** sets it in secure env at activation |
| `ownerExposureConfirmed` | ❌ default false | **OWNER** sets `ODG_DASHBOARD_EXPOSURE_CONFIRMED=1` |

## Audit of the prepared controls

- **Reverse proxy (`reverse-proxy.Caddyfile`)** — TLS terminated at the proxy (automatic HTTPS); upstream stays
  `127.0.0.1:3000` only (app never bound to a public interface); security headers (HSTS, `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `-Server`); health check `/api/health`; IP-allowlist stub (deny-default).
- **Access control (`access-control.md`)** — 3-layer defense in depth (app auth fail-closed, TLS proxy, network
  allowlist deny-by-default); authorized CIDRs intentionally empty until owner activation.
- **Application auth (`src/lib/dashboard-auth.ts`)** — fail-closed. Unit suite **10/10 PASS**. LIVE on the isolated
  slot (:3100): `/api/health` public **200**; `/api/runtime-state` → **401** (no creds), **401** (bad token),
  **200** (valid token); with the token UNSET → **503** (withheld). Token value never printed.
- **Secure secret handling** — `dashboard-token-provision.ts` + `scripts/provision-dashboard-token.sh` write a
  `0600` EnvironmentFile, fingerprint-only, token value never printed/committed/logged.
- **Rollback / teardown** — `EXPOSURE_RUNBOOK.md` (reversible steps; teardown leaves zero public surface) +
  release-level `scripts/odg-release.sh rollback`.
- **Real exposure posture** — `runtime/bin/odg-exposure-check.ts`: ODG bound **loopback-only** `127.0.0.1:3000`,
  drift=0, no public listener (only co-tenant SSH, untouched).

## Tests re-run (reused existing proof)

`dashboard-exposure-readiness`, `exposure-audit`, `dashboard-token-provision` suites → **PASS**; `dashboard-auth`
→ **10/10**. No control weakened; nothing fabricated.

## Owner / VPS-only remaining actions (nothing here substitutes for these)

1. Provision `ODG_DASHBOARD_TOKEN` in the service's secure env (owner, sudo — `0600` EnvironmentFile).
2. Obtain the TLS certificate and install the reverse proxy with the real hostname.
3. DNS record for the hostname.
4. Host firewall / proxy allowlist CIDRs (deny-by-default; add only authorized operators).
5. Explicit `ODG_DASHBOARD_EXPOSURE_CONFIRMED=1` and re-run the gate (require READY).
6. Start the proxy; verify HTTPS health + auth + http→https redirect.

A local preparation is never treated as proof of real exposure.
