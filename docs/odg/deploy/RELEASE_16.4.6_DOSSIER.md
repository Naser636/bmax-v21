# Next.js 16.4.6 — release preparation dossier (V315 Chantier B)

**Status: STAGED + VERIFIED on an isolated slot, NOT DEPLOYED.** No production bascule, no `current` swap on the
real release root, no public exposure. ODG is the sole GO authority; this is technical-provider preparation evidence.

## B.1 Source / identity (verified)

| Field | Value |
|---|---|
| Release commit | `bb9e392878201e77dce0f57a20616338778a55c2` (main) |
| Git state | clean worktree |
| Next.js | **16.4.6** — consistent across `package.json`, `package-lock.json`, installed |
| Security basis | includes V312-A fix (16.2.9→16.4.6 critical advisories); v97 supply-chain guard preserved |

## B.2 / B.3 Clean rebuild + provenance (isolated slot, from the exact commit)

Rebuild from `git archive HEAD`: `npm ci` (exit 0) → `npm run build:runtime` (exit 0) → `npm run build` (exit 0),
static/public copied into standalone.

| Artifact identity | Value |
|---|---|
| `treeDigest` (sha256 of `git archive bb9e3928`) | `f07bf99df3075c0314ee840fca431efecb373bd569043399aacf533e3d560839` |
| `buildId` (`.next/BUILD_ID`) | `s6wFpQDyKQ-A9TRVw3KAI` |
| `packageDigest` (path-sorted `sha256  path` manifest over the standalone) | `935f51eee6274f3f435adf45b40d4610e7be89a75511b6286baa263096c8a747` |
| Standalone file count | 5535 |
| Secrets in artifact | **none** — no `.pem/.key/.env`; the no-secrets check's 2 "offenders" are source modules (`secret-rotation-hygiene.ts`) matched by filename substring, not credentials |

SBOM: available via the existing multi-ecosystem SBOM tooling (not regenerated in this dossier).

## B.4 Standalone + scripts (verified)

- `scripts/odg-release.sh` artifact-completeness logic (`server.js`, `.next/BUILD_ID`, `.next/static`, `public/`,
  traced `node_modules`) — a release missing any is refused, not activated.
- `deploy/odg-stage-and-verify.sh`, `deploy/odg-rollback.sh`, `scripts/odg-release.sh` — syntax OK (`bash -n`).

## B.5 / B.6 Staging on the isolated slot (`127.0.0.1:3100`, isolated persistent data)

| Check | Result |
|---|---|
| Health | `/api/health` **200**, `storage: READY`, buildId matches artifact |
| Root | **200** |
| Auth (live, fail-closed) | no-creds **401** · bad token **401** · valid token **200** · token unset **503** |
| Bind | **loopback-only** `127.0.0.1:3100` (no public interface) |
| Performance | 600 req, **0 errors**, 305 req/s, p50 3.11ms / p95 4.45ms / p99 5.91ms |
| Resilience | unknown route **404**, malformed POST **405**, 50/50 concurrent **200**, health stable after faults |

## B.7 Blue/Green rollback drill (isolated release root, staging port — PROVEN)

Ran `scripts/odg-release.sh` with `ODG_RELEASE_ROOT` = isolated drill dir on staging port 3900 (prod `:3000`
untouched throughout):

```
build relA (bb9e3928)  → rel-20261118T212308Z-bb9e39287820-VDoGnQIo008ZdHRgG4OCT
build relB (fc66ef43)  → rel-20261118T195347Z-fc66ef43c07a-RNFO6248oxXtqYLdM1fjc
activate relA → health 200
activate relB → health 200   (atomic `current` swap)
rollback      → health 200   (back to previous release)
```

Rollback to the previous release is **operational** and documented. Persistent data (`ODG_RUNTIME_STATE_DIR`,
`ODG_CLIENT_STORE`) lives outside every release and is never copied/deleted by the pipeline.

## B.8 Blue/Green activation plan (owner/VPS-gated — NOT executed)

1. **Preconditions (hard gates):** canonical ODG **GO** (`productionReady=true`), all deploy gates PASS, backups
   verified, rollback ready. Today `productionReady=false` → **no bascule**.
2. `scripts/odg-release.sh build --commit <sha>` on the real release root (immutable, additive; existing releases
   untouched).
3. `scripts/odg-release.sh verify <releaseId>` — boot on staging port, assert health + buildId.
4. `scripts/odg-release.sh activate <releaseId>` — staging health-check → **atomic `current` swap** → restart →
   health, with bounded auto-recovery. **Stop criteria:** if health ≠ 200 within the bounded attempts, auto-rollback.
5. **Post-bascule checks:** `/api/health` 200, auth 401/200, loopback-only bind, buildId = deployed.
6. **Immediate rollback:** `scripts/odg-release.sh rollback` (atomic swap to previous + restart) — proven above.

## Owner / VPS-only remaining actions

- Canonical ODG **GO** + all gates PASS (exposure + ISO are the outstanding gates).
- Authorize build + `activate` on the real release root (`/home/ubuntu/odg-releases`) — the only `current`-swap step.
- If systemd owns the process: `sudo systemctl restart odg-preprod.service` after the `current` swap (privileged, owner).
- Verified backups before bascule.
