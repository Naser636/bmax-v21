#!/bin/bash
# odg-preprod-cutover-runbook.sh — PATH A: hand the live :3000 process over to the BLESSED system unit odg-preprod.service.
# RUN AS ROOT. Default is --check (NON-mutating pre-checks only). Pass --execute to perform the atomic cutover with
# health-gated AUTO-ROLLBACK. Does NOT bypass anything: it uses the normal `systemctl start odg-preprod` (root).
#   Pre:  verifies current :3000 healthy, release intact, unit config, no odg-app boot conflict.
#   Do:   stop the session process holding :3000  ->  wait port free  ->  systemctl start odg-preprod  ->  health-gate.
#   Post: verify ready/READY + buildId + systemd MainPID ownership.  On failure -> ROLLBACK (relaunch unsupervised, healthy).
set -u
PORT=3000; HEALTH="http://127.0.0.1:$PORT/api/health"; EXPECT_BUILD="WEyqonrDYirNE0T99qGGC"
LAUNCH=/home/ubuntu/bmax-v21/scripts/odg-app-launch.sh; ROLLBACK_LOG=/home/ubuntu/odg-releases/pathA-rollback.log
MODE=check; [ "${1:-}" = "--execute" ] && MODE=execute
cur_pid(){ ss -tlnpH 2>/dev/null | grep "127.0.0.1:$PORT" | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2; }
hjson(){ curl -s -m3 "$HEALTH" 2>/dev/null; }
health_ok(){ local h; h=$(hjson); echo "$h" | grep -q '"status":"ready"' && echo "$h" | grep -q '"storage":"READY"'; }
build_ok(){ hjson | grep -q "\"buildId\":\"$EXPECT_BUILD\""; }
fail(){ echo "PRECHECK FAIL: $1"; exit 1; }

echo "== odg-preprod cutover runbook ($MODE) =="
[ "$(id -u)" = "0" ] || echo "WARN: not root — --execute will fail without root (systemctl start odg-preprod needs root)"
# ---- PRE-CHECKS (always) ----
PID=$(cur_pid); echo "current :$PORT pid=${PID:-none}"
[ -n "$PID" ] || fail "nothing is serving :$PORT (refusing — no known-good current state)"
health_ok || fail "current :$PORT not ready/READY"
build_ok  || fail "current :$PORT buildId != $EXPECT_BUILD"
[ -f /home/ubuntu/odg-releases/current/app/server.js ] || fail "ExecStart target missing"
[ "$(cat /home/ubuntu/odg-releases/current/app/.next/BUILD_ID 2>/dev/null)" = "$EXPECT_BUILD" ] || fail "release BUILD_ID mismatch"
[ -e /etc/odg/odg-preprod.env ] || fail "EnvironmentFile /etc/odg/odg-preprod.env missing (ignore_errors=no)"
systemd-analyze verify odg-preprod.service 2>&1 | grep -iE 'error|not found|failed' | grep -ivE 'CPUAccounting|xfs_scrub' && fail "unit verify errors" || true
# odg-app(user) must NOT be enabled (else it would also start at boot and fight for :3000). An enabled user unit
# leaves a wants-symlink under the user's config — root-readable, no privilege-drop needed.
[ -L /home/ubuntu/.config/systemd/user/default.target.wants/odg-app.service ] && fail "odg-app(user) is ENABLED — reboot conflict risk; disable it first (systemctl --user disable odg-app)" || true
echo "PRECHECKS OK: current healthy, release intact, unit verifies clean, no odg-app boot conflict."
if [ "$MODE" = check ]; then echo "CHECK-ONLY: pass --execute (as root) to perform the cutover."; exit 0; fi

# ---- EXECUTE (root) ----
rollback(){
  echo "ROLLBACK: restoring service (unsupervised but healthy) via $LAUNCH as ubuntu"
  systemctl stop odg-preprod.service 2>/dev/null
  for i in $(seq 1 10); do [ -z "$(cur_pid)" ] && break; sleep 1; done
  runuser -u ubuntu -- bash -c "cd /home/ubuntu/odg-releases/current/app && setsid nohup bash '$LAUNCH' >'$ROLLBACK_LOG' 2>&1 < /dev/null &"
  for i in $(seq 1 40); do health_ok && { echo "ROLLBACK OK — production restored (unsupervised nohup); investigate odg-preprod before retrying"; return 0; }; sleep 1; done
  echo "ROLLBACK FAILED — PRODUCTION DOWN — inspect: journalctl -u odg-preprod -n 50 ; $ROLLBACK_LOG"; return 1
}
echo "[1/4] stopping session process pid $PID (SIGTERM)"; kill "$PID" 2>/dev/null
for i in $(seq 1 15); do [ -z "$(cur_pid)" ] && break; sleep 1; done
[ -n "$(cur_pid)" ] && { echo "[1b] port still held; SIGKILL $PID"; kill -9 "$PID" 2>/dev/null; sleep 2; }
echo "[2/4] starting odg-preprod.service (blessed system unit)"; systemctl start odg-preprod.service || { echo "start failed"; rollback; exit 1; }
echo "[3/4] health-gating :$PORT (up to 40s)"; for i in $(seq 1 40); do health_ok && break; sleep 1; done
NPID=$(cur_pid); MPID=$(systemctl show odg-preprod.service -p MainPID --value 2>/dev/null)
echo "[4/4] verify: health=$(health_ok && echo ready/READY || echo NOT-READY) build=$(build_ok && echo match || echo MISMATCH) MainPID=$MPID portPid=$NPID"
if health_ok && build_ok && [ -n "$NPID" ] && [ "$NPID" = "$MPID" ]; then
  echo "CUTOVER OK: odg-preprod.service supervises :$PORT (MainPID=$MPID), ready/READY, buildId $EXPECT_BUILD. Reboot-survival active (enabled)."
  echo "post: systemctl status odg-preprod --no-pager | head ; curl -s $HEALTH"
  exit 0
else
  echo "CUTOVER health/ownership FAILED — rolling back"; rollback; exit 1
fi
