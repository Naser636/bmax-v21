# odg-preprod.service — corrected candidate (NOT installed)

**Status:** PREPARED + config-VALIDATED (simulated the ExecStart+env on test port 4050 → loopback bind, `/api/health`
200 `ready`/`READY`, served `buildId` == `current` release buildId, live `runtime-state`). **NOT installed / not
activated** — installing writes `/etc/systemd/system` and `systemctl` operate a system unit ⇒ requires **sudo** +
a change window + rollback (RESERVED). Do not apply ad hoc.

## Why a change is needed (live state 2026-10-19)
The installed `/etc/systemd/system/odg-preprod.service` is **mis-configured for the Phase-2/3 model** and currently
**crash-looping** (`Active: activating (auto-restart)`, ExecStart exit 1):
- `WorkingDirectory=/home/ubuntu/bmax-v21/.next/standalone` — a **mutable/rebuildable** build dir (the anti-pattern
  the immutable release pipeline removes).
- **No `ODG_RUNTIME_STATE_DIR`** — would serve the build-time **bundled snapshot** (stale data), undoing the
  Phase-3 data-at-runtime fix.
- The crash loop is a **port conflict**: a correctly-configured process (release `current` artifact, live data) is
  currently serving :3000, so the unit's `node server.js` hits EADDRINUSE → exit 1.

**Risk:** on a host reboot (or if the correct process stops), systemd would start the mis-configured unit and serve
STALE data from a mutable dir. Durable correctness therefore depends on the sudo-gated unit update below → **BLOCKED**.

## Diff (live → candidate)
- `WorkingDirectory` / `ExecStart`: `/home/ubuntu/bmax-v21/.next/standalone` → `/home/ubuntu/odg-releases/current/app`
  (release pipeline's atomic `current` pointer; `odg-release.sh activate <rid>` swaps it, then `systemctl restart`).
- add `Environment=ODG_RUNTIME_STATE_DIR=/home/ubuntu/bmax-v21/runtime/generated` (live persistent state).
- add hardening: `ProtectSystem=strict`, `ProtectHome=read-only`, `ReadWritePaths=<store> <state-dir>`,
  `ProtectKernelTunables`, `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`.

## Install procedure (HUMAN, in an authorized change window — requires sudo)
Pre-checks: `odg-release.sh status` shows a valid `current`; `odg-release.sh verify <current-rid>` passes.
1. Backup live unit: `sudo cp /etc/systemd/system/odg-preprod.service /etc/systemd/system/odg-preprod.service.bak-$(date -u +%Y%m%dT%H%M%SZ)`
2. Stop the ad-hoc process holding :3000 (the correct nohup process) AND stop the unit: `sudo systemctl stop odg-preprod`; free :3000.
3. Install candidate: `sudo cp deploy/odg-preprod.service.candidate /etc/systemd/system/odg-preprod.service`
4. `sudo systemctl daemon-reload && sudo systemd-analyze security odg-preprod` (expect improved score) `&& sudo systemctl restart odg-preprod`
5. Post-checks (MUST pass, else rollback): `systemctl is-active odg-preprod` = active; `curl -s 127.0.0.1:3000/api/health` → 200 `{"status":"ready","storage":"READY","buildId":"<current buildId>"}`; `ss -ltnp | grep :3000` binds `127.0.0.1` only (never `0.0.0.0`); an E2E mission SUCCESS.

## Rollback
- Config rollback: `sudo cp /etc/systemd/system/odg-preprod.service.bak-<ts> /etc/systemd/system/odg-preprod.service && sudo systemctl daemon-reload && sudo systemctl restart odg-preprod`.
- Release rollback (bad artifact): `scripts/odg-release.sh rollback` (swaps `current` to previous) then `sudo systemctl restart odg-preprod`.

## Reboot test (NOT RUN)
After install, an authorized reboot drill must confirm the unit restarts the dashboard on boot and binds loopback.
Until executed in a window, the reboot result is **NOT RUN**.
