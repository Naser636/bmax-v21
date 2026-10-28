# ODG dashboard — access control (preparatory; NOT activated)

The dashboard serves **internal operational state**. Public reachability is admissible only after the
`dashboard-exposure-readiness` gate returns `READY` **and** the owner explicitly confirms exposure.

## Layers (defense in depth)

1. **Application auth (already enforced, fail-closed).** `src/lib/dashboard-auth.ts` denies the internal-state API
   and page with `503` when `ODG_DASHBOARD_TOKEN` is unset, and `401` on a bad/absent bearer/`x-api-key` (constant-time
   compare). `/api/health` is intentionally public (liveness only, no internal state).
2. **Transport (reverse proxy).** TLS terminates at the proxy (`reverse-proxy.Caddyfile` / `reverse-proxy.nginx.conf`).
   The Next.js process stays bound to `127.0.0.1:3000` only — it is **never** bound to a public interface directly.
3. **Network allowlist (optional, recommended).** Restrict source IPs at the proxy and/or host firewall to known
   operator CIDRs. Record the authorized CIDRs here at activation time. Default posture = deny.

## Authorized source ranges

> **TBD at activation** — left empty on purpose. An empty allowlist means **no public source is authorized yet**;
> the firewall/proxy default remains deny. Do not populate without owner authorization.

## What is deliberately NOT done here

- No binding to `0.0.0.0`, no firewall rule change, no proxy start, no cert issuance. Those are the owner-gated
  activation steps in `EXPOSURE_RUNBOOK.md`.
