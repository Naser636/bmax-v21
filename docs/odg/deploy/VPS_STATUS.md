# ODG VPS / dashboard — verified runtime status (read-only probe 2026-10-28)

Observational Phase-5 verification. **Nothing was exposed, redeployed, or restarted.** All findings from a read-only
loopback probe on the VPS host.

## Verified facts

| Check | Result |
|---|---|
| `odg-preprod.service` | **active** |
| ExecStart | `/home/ubuntu/odg-releases/current/app/server.js` |
| Release start_time | **2026-10-27 06:26 UTC** |
| Listening socket | `127.0.0.1:3000` only — **no public-interface bind** |
| `GET /api/health` (no token) | `200` (public liveness — intended) |
| `GET /api/runtime-state` (no token) | **`200`** ← app-layer auth NOT active in the running release |
| `GET /` (no token) | `200` |
| `ODG_DASHBOARD_TOKEN` in service env | **unset** |

## Interpretation (honest)

- The **fail-closed dashboard auth** (PRs #152/#153, merged **2026-10-28**) is present on `main` but the **deployed
  release predates it** (started 2026-10-27). So the running artifact is **stale** w.r.t. the app-layer auth fix.
- **However, the service binds loopback (`127.0.0.1`) only** — internal state is **not reachable from any public
  interface**. The internal-state exposure is closed at the **network layer**; the application-layer defense-in-depth
  is simply not yet in the running release.
- `dashboard-exposure-readiness` live probe already returns **NOT_READY** (token + owner-confirmation absent), so the
  exposure gate correctly keeps the service closed to the public.

## Required (owner-gated) action to activate app-layer auth in production

A **deployment** — redeploy `main` to a new release + set `ODG_DASHBOARD_TOKEN` in the service's secure environment +
restart. This is a critical-gate action (deployment/restart) and is **not performed autonomously**. Steps are in
`EXPOSURE_RUNBOOK.md §1` (the token + preflight-gate parts apply even for a loopback-only refresh).

## Residual risk

**Low.** No public surface exists (loopback-only). A local user on the VPS host could read internal state from the
stale release; a redeploy closes that. No secrets are exposed over any network.
