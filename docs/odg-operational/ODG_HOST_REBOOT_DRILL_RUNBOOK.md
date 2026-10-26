# ODG Host-Reboot Drill — Runbook (EXECUTED + VALIDATED 2026-10-26)

**Status:** ✅ **EXECUTED + VALIDATED 2026-10-26** on `vps-6d919042`. A real `sudo systemctl reboot` was triggered at
`16:46:39Z`; an INDEPENDENT boot-time observer (`odg-reboot-drill-capture.service`, self-disabling) captured
timestamped evidence (`/home/ubuntu/odg-releases/reboot-drill-evidence.json`, verdict **PASS**), then confirmed by a
LIVE independent re-verification in the next session. All PASS criteria met — see "EXECUTION RESULT" below. The last
supervision residual (V2 Phase-A matrix §SUPERVISION) is now CLOSED.

## EXECUTION RESULT (2026-10-26, timestamped, dual-observed)
- **Real reboot:** boot_id `f919951d…` → `290b91c3…`; uptime reset `2026-10-23 22:15` → `2026-10-26 16:46:47`.
- **Auto-restart (no manual start):** `odg-preprod.service` active+enabled at boot `16:46:56Z`, `NRestarts=0`;
  observer captured active at `16:47:01Z` (~14 s post-boot).
- **Endpoints:** `/api/health`=200, `/`=200, `/api/runtime-state`=200 (payload 3231 B, coherent: health READY,
  autonomy 100 %, caps total 240/proven 240, queue 3, release.present=true).
- **Version identity:** served buildId `r-lFDoxyDMohywdhPDESc` == active release `rel-…268be2c…` (SAME as pre-reboot
  — no unintended `odg-recover` rollback; odg-recover inactive); `runtime-identity: CONSISTENT`.
- **Listener:** `127.0.0.1:3000` only (loopback preserved). **Boot logs:** 0 critical errors.
- **Recovery/rollback available:** `previous`→hbTMmA, OnFailure=odg-recover present, backup bundle @268be2c in
  `/var/backups/odg-vault/20261026T162737Z`. Observer one-shot self-disabled after capture.
- **Verdict: PASS** (independent observer + live re-verification agree). Original prepared procedure retained below.

## Why it is deferred (honest)
`odg-preprod.service` supervises the loopback-only dashboard and auto-recovers on crash (proven: SIGKILL ⇒ ~2–3 s
restart via `Restart=on-failure`/`RestartSec=3`, plus `OnFailure=odg-recover.service`). What is NOT yet empirically
proven is that the service comes back **after a full host reboot** — high-impact on a live host, so it waits for a
window. A reboot is a host operation (`sudo systemctl reboot`) outside ODG's authority.

## Boot-persistence preconditions — VERIFIED NOW (read-only, 2026-10-26)
- `systemctl is-enabled odg-preprod.service` → **enabled**
- `[Install] WantedBy=multi-user.target` present ⇒ starts at boot in the normal multi-user target
- `UnitFileState=enabled`, `ActiveState=active`, `MainPID=30367` (up since 2026-10-24)
- `OnFailure=odg-recover.service` present; `Restart=on-failure`, `RestartSec=3`, `StartLimitBurst=4/30s`
- Runtime-identity LIVE: **CONSISTENT** (served build == active release `hbTMmAnqzN1Ei07fXdlPG`)
- Dashboard LIVE: `/api/health`=200, `/`=200 on 127.0.0.1:3000

Because the unit is `enabled` with `WantedBy=multi-user.target`, systemd WILL start it on boot by design; the drill
confirms this empirically and measures recovery time.

## Pre-drill capture (operator, before reboot)
```
date -u +%FT%TZ
systemctl is-active odg-preprod.service; systemctl is-enabled odg-preprod.service
systemctl show odg-preprod.service -p MainPID -p ActiveEnterTimestamp
curl -s -o /dev/null -w 'health=%{http_code} root=%{http_code}\n' http://127.0.0.1:3000/api/health
npx --prefix /home/ubuntu/bmax-v21 tsx /home/ubuntu/bmax-v21/scripts/runtime-identity-check.ts   # expect CONSISTENT
readlink -f /home/ubuntu/odg-releases/current                                                      # record active release
```

## Drill (operator, in the maintenance window — requires sudo/host authority)
```
sudo systemctl reboot
```

## Post-reboot verification (operator, after the host is back)
```
uptime -s                                                   # confirm the box actually rebooted
systemctl is-active odg-preprod.service                     # EXPECT: active  (started by boot, no manual start)
systemctl show odg-preprod.service -p MainPID -p ActiveEnterTimestamp   # new PID, timestamp ~boot
curl -s -o /dev/null -w 'health=%{http_code} root=%{http_code}\n' http://127.0.0.1:3000/api/health  # EXPECT 200/200
npx --prefix /home/ubuntu/bmax-v21 tsx /home/ubuntu/bmax-v21/scripts/runtime-identity-check.ts       # EXPECT: CONSISTENT, same release as pre-drill
readlink -f /home/ubuntu/odg-releases/current               # EXPECT: identical to pre-drill (no unintended rollback)
journalctl -u odg-preprod.service -b 0 --no-pager | tail -40   # confirm clean start, no crash-loop / OnFailure trigger
```

## PASS criteria (ALL required; anything else ⇒ FAIL, record real result + diagnose)
1. Host uptime resets (real reboot occurred).
2. `odg-preprod.service` is `active` after boot **without any manual start**.
3. `/api/health` and `/` return 200 on 127.0.0.1:3000.
4. `runtime-identity-check` reports CONSISTENT and the SAME active release as pre-drill (no unintended
   `odg-recover` rollback at boot).
5. `journalctl` shows a single clean start (no crash-loop, no `OnFailure` activation).

## Rollback / safety
No application change is made by the drill. If the service fails to come up: `journalctl -u odg-preprod.service -b`
for the cause; `odg-recover.service` auto-rolls `current`→last-verified-good on persistent failure; manual
`sudo systemctl start odg-preprod.service` after fixing the cause. Record the exact failure and root-cause it; never
mark the drill passed on a partial or inferred result.

## Evidence to persist (on execution)
Append the pre/post command outputs + verdict to the compass (`ODG_PROJECT_STATE.md`) under a dated REBOOT-DRILL
checkpoint, and flip the V2 matrix §SUPERVISION residual from "host-REBOOT drill NOT RUN" to the real outcome.
