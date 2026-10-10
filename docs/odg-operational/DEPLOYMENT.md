# ODG Deployment Procedure (local-hardened; host steps are prerequisites)

Scope: reproducible startup/shutdown, persistent storage, backup/restore, rollback, and the HTTP
health probe for the ODG Next.js app. **Local readiness only** is proven here; every value marked
**(HOST)** or **(HUMAN)** is a prerequisite that CANNOT be verified in this repo and must be
established on the target host / by a human. This document does not deploy anything and does not
claim production availability.

## 1. Build (local, proven)
- `npm run build` (= `next build`). `next.config.ts` sets `output: "standalone"`, so the build emits a
  self-contained server at `.next/standalone/server.js` plus traced `node_modules` — deployable without
  re-installing dependencies. Proven green at HEAD (build exit 0; routes `/`, `/api/health`,
  `/api/intake`, `/site/[...slug]`).
- Static assets are **not** auto-copied into the standalone folder. After build, copy them:
  ```bash
  cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
  ```

## 2. Required environment (names only — never commit secret values; `.env*` is git-ignored)
- `ODG_CLIENT_STORE` — **(HOST)** absolute path to a persistent, writable directory on a real disk
  (e.g. `/var/lib/odg/clients`), owner-only perms `0700`. Without it, intake and `/api/health` fail
  closed (503). This is the decisive request-serving readiness gate.
- `PORT` / `HOSTNAME` — optional; `node server.js` honours them (e.g. `PORT=8080 HOSTNAME=0.0.0.0`).
- `NEXT_TELEMETRY_DISABLED=1` — recommended.
- Email/payments/fiscal provider config — **(HUMAN)** see `LAUNCH_READINESS.md`; not required to serve,
  required to launch commercially.

## 3. Startup
```bash
export ODG_CLIENT_STORE=/var/lib/odg/clients      # (HOST) persistent, 0700
PORT=8080 HOSTNAME=0.0.0.0 node .next/standalone/server.js
```
Readiness check (see §6): `curl -fsS http://127.0.0.1:8080/api/health` must return HTTP 200
`{"status":"ready","storage":"READY",...}` before routing live traffic.

## 4. Shutdown / restart / supervision **(HOST)**
- The app is a standard long-running Node process; stop with `SIGTERM` (graceful) / `SIGINT`.
- Keep it alive with a host supervisor (e.g. `systemd` service with `Restart=on-failure`, or a process
  manager). Exact unit file is host-specific and **not** provided here (no Dockerfile/systemd/nginx
  artifact is shipped in this repo — see Remaining gaps). Mission-pipeline work (`odg-run.js`) is
  separately crash-resumable via `runtime/generated/pipeline-checkpoint.json` (checkpoint-engine), but
  that is the autonomy pipeline, not the HTTP server.

## 5. Persistent storage, backup, restore
- All client intake persists under `$ODG_CLIENT_STORE/requests/` (durable; survives process restart —
  proven by `runtime/core/deployment-readiness.test.js`). The store holds **no secrets** by construction.
- Backup: read-only snapshot/rsync of `$ODG_CLIENT_STORE` on a host schedule **(HOST)**. The
  integrity-verified copy/restore helper is `runtime/core/client-store-backup.js` (round-trip proven
  byte-identical, `client-store-backup.test.js`). Restore refuses a non-empty target unless `force` and
  fail-closes on `INTEGRITY_MISMATCH`.
- Retention / deletion (GDPR) is **NOT implemented** — **(HUMAN)** policy decision (RWL-D2) required
  before real personal data is stored.

## 6. Health / readiness probe (local, proven)
- `GET /api/health` — read-only; 200 `{status:"ready",storage:"READY"}` only when `ODG_CLIENT_STORE`
  resolves to a readable directory; 503 `{status:"not_ready",storage:"NOT_CONFIGURED|MISSING|BLOCKED|
  UNKNOWN"}` otherwise. Exposes no secrets, tokens, paths or payloads; `Cache-Control: no-store`.
- Use it as a load-balancer / orchestrator liveness+readiness probe. **A 200 means only "this instance
  can accept intake" — it does NOT prove live autonomy, provider availability, external reachability, or
  production availability.** Deeper operational signals remain CLI-only: `odg health`, `odg verify`,
  `odg diagnose`, `odg client launch`.

## 7. Rollback
- Code: `git revert <bad-commit>` then redeploy the standalone build (never force-push; a pushed change
  is undone by a new revert commit — see `ODG_INCIDENT_RUNBOOK.md` §5).
- Data: restore `$ODG_CLIENT_STORE` from a verified backup (§5).
- No blue/green or versioned release mechanism is shipped — redeploy is build-then-restart.

## 8. Post-deploy verification **(HOST)**
After deploying (not in this repo): `curl` `GET /site/<page>` and `POST /api/intake` (expect `201
{requestId}` + a file under `$ODG_CLIENT_STORE/requests/`), then `GET /api/health` (expect 200), then
`odg client launch`. Until then `siteIntakeDeployment` stays `NOT_CONFIGURED` (DEF-012).

## 9. Remaining gaps (not in this repo; do not assume)
- **(HOST)** No Dockerfile / systemd unit / nginx+TLS / reverse-proxy / process-supervisor artifact is
  shipped — author per host conventions using §3–§4.
- **(HOST)** Numeric SLOs (latency, error-rate, uptime, disk/quota) are undefined — require a real
  deployment to measure (`ODG_INCIDENT_RUNBOOK.md` §7).
- **(HOST)** Multi-instance / HA is unsupported — mono-instance only (no shared lock/DB).
- **(HUMAN)** Retention policy, fiscal/legal sign-off, payment & email credentials, and commit/deploy
  authorizations — see `LAUNCH_READINESS.md`.

## 10. Current private preproduction instance (recorded 2026-10-10 — loopback only, NOT production)
A private preprod instance is provisioned and verified on host **`vps-6d919042`** (co-tenant with
nginx/docker/fleet-bridge/ollama; existing services left untouched). It is **not** publicly reachable.
- Service: dedicated `odg-preprod.service` (systemd, `/etc/systemd/system/`), runs as `ubuntu`,
  `Restart=on-failure`, `NoNewPrivileges`+`PrivateTmp`, `WorkingDirectory=.next/standalone`,
  `ExecStart=/usr/bin/node server.js`.
- Bind: **`127.0.0.1:3000` only** (`HOSTNAME=127.0.0.1`) — no public listener.
- Store: `ODG_CLIENT_STORE=/var/lib/odg/clients`, owner `ubuntu:ubuntu`, mode `0700`, provisioned empty.
- Verified: `GET /api/health` → **HTTP 200** `{status:"ready",storage:"READY"}`; **5/5** consecutive
  checks; **0 restarts**; no secret/path leak; store stayed empty (health read-only). Serves the
  committed standalone bundle (next-server 16.2.9).
- **NOT proven here:** `/api/intake` end-to-end (createRequire→`runtime/core` tracing) **NOT TESTED**;
  public reachability / DNS / TLS (RWL-C1/C2) and SLOs **not** proven; **off-host backup BLOCKED pending a
  defined destination**. This is preproduction, not production.
