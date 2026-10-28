# Dashboard fail-closed auth — production activation runbook (owner-gated)

**Status: PREPARED, NOT EXECUTED.** The fail-closed auth is on `main` (PRs #152/#153); the running release predates it
(see `VPS_STATUS.md`). This runbook activates it on the VPS **loopback-only** service. Steps 1–2 are **privileged**
(sudo: write `/etc` + reload/restart systemd) and are run **by the owner**, not autonomously. The service stays
`127.0.0.1`-only throughout — **no public exposure**.

## Prerequisite that was missing (now prepared)

`ODG_DASHBOARD_TOKEN` was unprovided and the unit had no EnvironmentFile to read one. Mechanism now prepared + tested:
`runtime/core/dashboard-token-provision.ts` (suite 14) + `scripts/provision-dashboard-token.sh` (fingerprint-only,
idempotent, writes 0600; token value never printed).

## 1. Provision the token (owner, sudo) — writes a 0600 EnvironmentFile

```
sudo ODG_DASHBOARD_ENV_PATH=/etc/odg/odg-preprod.env bash scripts/provision-dashboard-token.sh
# prints: WROTE ... fingerprint=sha256:xxxxxxxxxxxx   (token value NEVER shown)
```

## 2. Wire the EnvironmentFile into the unit (owner, sudo) — systemd drop-in

```
sudo install -d /etc/systemd/system/odg-preprod.service.d
printf '[Service]\nEnvironmentFile=/etc/odg/odg-preprod.env\n' | sudo tee /etc/systemd/system/odg-preprod.service.d/10-dashboard-token.conf
sudo systemctl daemon-reload
```

## 3. Redeploy the current `main` build (immutable pipeline — loopback-only, no sudo)

```
cd /home/ubuntu/bmax-v21 && git checkout main && git pull --ff-only
scripts/odg-release.sh build                 # immutable release from HEAD
scripts/odg-release.sh verify  <releaseId>   # artifact completeness + staging boot + buildId
scripts/odg-release.sh activate <releaseId>  # staging health-check → atomic `current` swap → restart → health
```

If the systemd unit (not the pipeline's own process) owns the running process, instead of the pipeline restart do:
`sudo systemctl restart odg-preprod.service` **after** the `current` symlink points at the new release.

## 4. Post-deploy verification (record as evidence — NEVER print the token)

```
# health public:
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/health            # expect 200
# internal-state DENIED without token (fail-closed):
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/runtime-state      # expect 401 (or 503 if token unset)
# internal-state ALLOWED with the configured token (read from the env file; value never echoed):
TOK="$(sudo sed -n 's/^ODG_DASHBOARD_TOKEN=//p' /etc/odg/odg-preprod.env)"
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOK" http://127.0.0.1:3000/api/runtime-state   # expect 200
unset TOK
# still loopback-only:
ss -ltn | grep ':3000'                                                                # expect 127.0.0.1:3000 only
```

## 5. Rollback (always available)

```
scripts/odg-release.sh rollback        # atomic swap `current` → previous release + restart
# or, if systemd owns the process:
sudo systemctl restart odg-preprod.service   # after `current` restored to previous
```

## 6. Acceptance checklist (all must hold)

- [ ] `/api/runtime-state` + page **deny** without a valid token (401/503)
- [ ] authorized request (valid Bearer) **succeeds** (200)
- [ ] `/api/health` 200; service active
- [ ] **no secret** in any output/log (only fingerprints)
- [ ] bind remains `127.0.0.1` only (no public exposure)
- [ ] rollback executed once in staging/again available and verified
- [ ] independent post-deploy evidence recorded (status codes above) in the closure register

## Governance notes

- No public exposure is enabled here (that is the separate, owner-confirmed `dashboard-tls-exposure` item).
- No protected governance file is modified. No credential beyond ODG's own self-minted loopback token is configured.
- Steps 1, 2, and the systemd restart are **privileged** and **owner-executed**; ODG does not run them autonomously.
