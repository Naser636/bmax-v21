#!/bin/bash
# odg-app-cutover.sh — hand the live :3000 process over to the user systemd service odg-app.service, HEALTH-GATED
# with AUTO-ROLLBACK. Dry-run by default; pass --execute to perform. Never proceeds unless the current process is
# healthy first (point 8: replacement already demonstrated separately). NO sudo, no root, no reboot.
set -u
PORT=3000
HEALTH="http://127.0.0.1:$PORT/api/health"
LAUNCH=/home/ubuntu/bmax-v21/scripts/odg-app-launch.sh
ROLLBACK_LOG=/home/ubuntu/odg-releases/cutover-rollback.log
DRY=1; [ "${1:-}" = "--execute" ] && DRY=0
cur_pid(){ ss -tlnpH 2>/dev/null | grep -E "127\.0\.0\.1:${PORT}([^0-9]|$)" | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2; }
health_ok(){ local h; h=$(curl -s -m3 "$HEALTH" 2>/dev/null); echo "$h" | grep -q '"status":"ready"' && echo "$h" | grep -q '"storage":"READY"'; }
PID=$(cur_pid)
echo "current :3000 pid=${PID:-none}"
health_ok || { echo "ABORT: current :3000 not healthy/READY before cutover"; exit 1; }
echo "current :3000 health OK (ready/READY)"
if [ "$DRY" = 1 ]; then echo "DRY-RUN ok (pass --execute to perform). Plan: SIGTERM $PID -> wait port free -> systemctl --user start odg-app -> health-gate 40s -> verify MainPID ownership; on fail: stop odg-app + nohup replacement + health-gate."; exit 0; fi
rollback(){
  echo "ROLLBACK: restoring service via fresh nohup replacement on :$PORT"
  systemctl --user stop odg-app.service 2>/dev/null
  for i in $(seq 1 10); do [ -z "$(cur_pid)" ] && break; sleep 1; done
  setsid nohup /bin/bash "$LAUNCH" >"$ROLLBACK_LOG" 2>&1 </dev/null &
  for i in $(seq 1 40); do health_ok && { echo "ROLLBACK healthy — production restored (unsupervised nohup)"; return 0; }; sleep 1; done
  echo "ROLLBACK FAILED — PRODUCTION MAY BE DOWN (investigate $ROLLBACK_LOG)"; return 1
}
echo "stopping current pid $PID (SIGTERM)"; kill "$PID" 2>/dev/null
for i in $(seq 1 15); do [ -z "$(cur_pid)" ] && break; sleep 1; done
if [ -n "$(cur_pid)" ]; then echo "port still held after 15s; SIGKILL"; kill -9 "$PID" 2>/dev/null; sleep 2; fi
echo "starting odg-app.service (user, supervised)"; systemctl --user start odg-app.service
for i in $(seq 1 40); do health_ok && break; sleep 1; done
NPID=$(cur_pid); MPID=$(systemctl --user show odg-app.service -p MainPID --value 2>/dev/null)
if health_ok && [ -n "$NPID" ] && [ "$NPID" = "$MPID" ]; then
  echo "CUTOVER OK: odg-app.service supervises :$PORT (MainPID=$MPID), health ready/READY"; exit 0
else
  echo "CUTOVER health/ownership FAILED (health_ok=$(health_ok && echo y || echo n) pid=$NPID mainpid=$MPID) — rolling back"; rollback; exit 1
fi
