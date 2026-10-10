# ODG Deployment Procedure (local-hardened; host steps are prerequisites)

Scope: reproducible startup/shutdown, persistent storage, backup/restore, rollback, and the HTTP
health probe for the ODG Next.js app. **Local readiness only** is proven here; every value marked
**(HOST)** or **(HUMAN)** is a prerequisite that CANNOT be verified in this repo and must be
established on the target host / by a human. This document does not deploy anything and does not
claim production availability.

## 0. Consolidated deployment checklist (status-disciplined — the operational source of truth)

**State vocabulary (exactly one per item):** `PROVEN` · `NOT PROVEN` · `BLOCKED BY HOST` · `BLOCKED BY HUMAN`
· `DEFERRED`. Each item carries an evidence reference OR the exact missing proof. Missing evidence is **never**
recorded as success. Baseline for this consolidation: HEAD `3ae6053`, `main`, clean, synced with `origin/main`.

### A. LOCAL READINESS
| Item | State | Evidence / missing proof |
|---|---|---|
| Production build, standalone output | PROVEN | `next build` exit 0; `output:"standalone"` → `.next/standalone/server.js` (§1); CHG-OD-8 |
| TypeScript (`tsc --noEmit`) | PROVEN | exit 0; CHG-OD-8 |
| Full regression runner | PROVEN | project runner green; CHG-OD-8 (not re-run in this docs-only mission — no source change) |
| `odg verify` (build+tsc+gitClean+contracts) | PROVEN | exit 0; `runtime/generated/runtime-verify.json` (build/typescript/gitClean=true, contracts 88/88) @ 2026-10-10T11:37; CHG-OD-5/7/8 |
| Generated contracts valid | PROVEN | 88/88 valid; same artifact |
| Health endpoint behavior + shape + read-only | PROVEN | `src/tests/health-endpoint.test.ts` 12/12 (healthy/not-configured/missing/blocked, codes, no-leak, no `.intake-probe` write); CHG-OD-8 |
| Clean + synchronized Git | PROVEN | HEAD `3ae6053`, `main`, worktree clean, `origin/main` 0 ahead / 0 behind |
| Startup/shutdown, env, secrets handling | PROVEN (documented) | §2–§4; secret **values** never committed (`.env*` git-ignored); only names listed |

### B. HOST / PREPRODUCTION
| Item | State | Evidence / missing proof |
|---|---|---|
| Persistent `$ODG_CLIENT_STORE`, `0700` perms | PROVEN (preprod `vps-6d919042`) | `/var/lib/odg/clients`, `ubuntu:ubuntu`, 0700, empty; CHG-OD-9. A **new** host must re-establish → BLOCKED BY HOST until then |
| Restart persistence | PROVEN (preprod) | `odg-preprod.service` `Restart=on-failure`, 0 restarts observed (CHG-OD-9); store durability by `deployment-readiness.test.js` |
| Private loopback `GET /api/health` | PROVEN | HTTP 200 READY, 5/5 consecutive, 0 restarts; CHG-OD-9 |
| Private loopback `/api/intake` integration | PROVEN | POST `application/json` → **201**, one NEW record persisted (store 0→1); decoy `apiKey` NOT persisted; non-JSON → **415** no-write; synthetic record cleaned (→0); CHG-OD-10 |
| Backup (off-host copy/restore) | BLOCKED BY HOST | integrity-verified helper proven byte-identical (`client-store-backup.test.js`); **off-host destination undefined** → not executed |
| Rollback drill (code revert + data restore) | NOT PROVEN | procedure documented (§7); end-to-end host drill not executed → BLOCKED BY HOST |
| Public `/api/intake` reachability | NOT PROVEN | public curl probe over DNS/TLS not run; DEF-012 (BLOCKED BY HOST) |
| Public `/site/*` reachability | NOT PROVEN | not deployed publicly; DEF-012 (BLOCKED BY HOST) |
| DNS / TLS / reverse-proxy | BLOCKED BY HOST | not provisioned; no nginx/TLS artifact shipped (§9) |
| Numeric SLO thresholds + monitoring | NOT PROVEN | undefined; require a real deployment to measure; `ODG_INCIDENT_RUNBOOK.md` §7 (BLOCKED BY HOST) |

> **Distinction (do not conflate):** the private **loopback** `/api/intake` proof (PROVEN, CHG-OD-10) is NOT
> public reachability (NOT PROVEN) and is NOT production readiness (NOT PROVEN). Preproduction ≠ production.

### C. SECURITY / GOVERNANCE
| Item | State | Evidence / missing proof |
|---|---|---|
| Provider config without exposing secret values | PROVEN (doc convention) | names-only; `.env*` git-ignored; health/intake expose no secrets/paths (CHG-OD-8/10) |
| Explicit budget before ANY paid provider call; fail closed if absent/insufficient | BLOCKED BY HUMAN | required control; no budget authorized → no paid call permitted. Live enforcement NOT PROVEN (no live run performed) |
| Human authorization — live provider execution | BLOCKED BY HUMAN | DEF-008/Track F; no credentials, send disabled by default |
| Human authorization — commit gate (`ODG_HUMAN_COMMIT_APPROVED`) | BLOCKED BY HUMAN | gate preserved; not auto-enabled |
| Retention / deletion (GDPR) policy | BLOCKED BY HUMAN | NOT implemented; RWL-D2 (§5) |
| Legal / fiscal sign-off (FR e-invoicing, SIREN/VAT) | BLOCKED BY HUMAN | DEF-009 |
| Payments & email credentials/live paths | BLOCKED BY HUMAN | DEF-008; `LAUNCH_READINESS.md` |
| Deployment authorization | BLOCKED BY HUMAN | no deploy performed by any mission |

> Existing authorization gates are **preserved as-is**; none was enabled to satisfy this checklist.

### D. LIVE AUTONOMY (Track F)
| Item | State | Evidence / missing proof |
|---|---|---|
| Real end-to-end authorized provider loop producing + verifying a real deliverable | **NOT PROVEN** | only proven with an injected fake (`claude-provider-integration.test.ts`); live loop NOT PROVEN (roadmap Track D/F) |

- **Prerequisites:** provider credentials (HUMAN), explicit token/cost budget (HUMAN), `ODG_HUMAN_COMMIT_APPROVED`
  where a commit results, network egress authorization.
- **Evidence to capture:** the real deliverable artifact, its Validation-Engine verdict, mission-ledger entry,
  and `mission-report.json` — not a green build alone.
- **Stop conditions:** budget exhausted/absent, Validation BLOCKED/NO_RELEASE, any governance BLOCK.
- **Cost controls:** explicit budget, fail-closed when absent/insufficient (no paid call without it).
- **Recovery:** checkpoint/resume (`pipeline-checkpoint.json`) + defer-on-BLOCKED (DEF-014 RESOLVED/VERIFIED).
- **This mission performs NO provider call and NO deployment.**

### FINAL DEPLOYMENT GATE (production-ready ⇔ ALL of)
1. All mandatory **LOCAL** checks (§A) `PROVEN` — currently **met**.
2. All mandatory **HOST** checks (§B) verified on the target: public `/api/intake` + `/site/*` reachability,
   DNS/TLS, defined+measured SLOs, backup executed off-host, rollback drill demonstrated — currently **NOT met**.
3. Required **HUMAN/LEGAL** decisions (§C) recorded: retention/deletion, fiscal/legal, payments/email, deploy
   authorization — currently **NOT met**.
4. Rollback/recovery (code + data) **demonstrated**, not merely documented — currently **NOT met**.

**Current verdict: NOT production-ready.** Local readiness is PROVEN; host and production readiness are not.
Do not claim production-ready until gates 2–4 pass with captured evidence.

---

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
`odg client launch`. The private **loopback** `/api/intake` path is already PROVEN (201 + persisted record;
CHG-OD-10) — but **public** `/site/*` + `/api/intake` reachability over DNS/TLS remains `NOT PROVEN`; DEF-012 is
**PARTIAL** until the public curl probe is run on the host.

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
- **`/api/intake` loopback integration: PROVEN** (recorded 2026-10-10, CHG-OD-10) — POST `application/json` →
  201 one NEW record persisted (store 0→1); decoy `apiKey` NOT persisted; non-JSON → 415 no-write; synthetic
  record cleaned (→0).
- **NOT proven here:** **public** reachability / DNS / TLS (RWL-C1/C2, DEF-012) and numeric SLOs **not** proven;
  rollback drill **not** executed; **off-host backup BLOCKED pending a defined destination**. This is
  preproduction, not production.
