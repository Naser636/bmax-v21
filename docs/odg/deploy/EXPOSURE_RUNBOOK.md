# ODG dashboard — public exposure runbook (owner-gated activation + rollback)

**Status: NOT ACTIVATED.** This runbook documents the exact, reversible steps to expose the dashboard publicly.
It is executed **only** by/with explicit owner authorization, and **only** after the readiness gate passes.

## 0. Preflight gate (must pass before anything else)

```
npx tsx runtime/core/dashboard-exposure-readiness.ts
```

Proceed **only** if `verdict == "READY"`. The gate is fail-closed: it reports every missing control. Expected
missing controls until activation: `ownerExposureConfirmed` (set `ODG_DASHBOARD_EXPOSURE_CONFIRMED=1` only with
owner authorization) and `authTokenConfigured` (set `ODG_DASHBOARD_TOKEN` via secure config, never in code).

## 1. Activation (gated, reversible)

1. Set `ODG_DASHBOARD_TOKEN` in the service's secure environment (not in the repo).
2. Confirm the app is bound to `127.0.0.1:3000` only (the systemd unit `odg-preprod.service` already does this).
3. Install the reverse proxy config (`reverse-proxy.Caddyfile`), set the real hostname, obtain the TLS cert.
4. Apply the host firewall + proxy allowlist from `access-control.md` (deny-by-default; add only authorized CIDRs).
5. With owner authorization, set `ODG_DASHBOARD_EXPOSURE_CONFIRMED=1` and re-run the preflight gate — require `READY`.
6. Start the proxy. Verify: `https://<host>/api/health` returns 200; the internal-state API returns `401` without a
   token and `200` with the valid token; plaintext `http://<host>` redirects to `https`.

## 2. Rollback / teardown (always available)

1. Stop the reverse proxy (public entry point closes immediately).
2. Remove the firewall rule exposing the proxy port.
3. Unset `ODG_DASHBOARD_EXPOSURE_CONFIRMED`.
4. The app remains on loopback `127.0.0.1:3000` — no public surface remains.
5. Re-run the preflight gate; confirm `verdict == "NOT_READY"` (exposure closed).

## 3. Invariants (never violate)

- The Next.js process is **never** bound to a public interface directly — the proxy is the only public entry point.
- `ODG_DASHBOARD_TOKEN` lives only in secure config, never in the repo or image.
- Exposure is reversible at every step; teardown leaves zero public surface.
