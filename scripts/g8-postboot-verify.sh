#!/usr/bin/env bash
# G8 POST-BOOT VERIFIER (non-privileged; reproducible; survives session closure).
# Run from a RECONNECTED session AFTER an authorized reboot (allow ~120s boot grace) to PROVE G8 —
# odg-preprod auto-restarted on boot, healthy, loopback-only, clean logs, and a read-only E2E succeeds.
# Uses ONLY existing mechanisms + read-only checks (+ one read-only AUDIT mission). NO sudo, NO install,
# NO config change. Emits per-criterion PASS/FAIL and an overall G8 verdict (exit 0 = PASS).
# A PASS here is the ONLY acceptable G8 proof — NOT a pre-reboot health check or an `enabled` unit.
set -u
cd "$(dirname "$0")/.."
fail=0
ck() { if eval "$2" >/dev/null 2>&1; then echo "  PASS $1"; else echo "  FAIL $1"; fail=1; fi; }
echo "G8 POST-BOOT VERIFY @ $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "boot time: $(uptime -s 2>/dev/null || echo '?')  (expect RECENT = a real reboot happened)"
ck "odg-preprod active (auto-restarted on boot)"      'test "$(systemctl is-active odg-preprod)" = active'
ck "odg-preprod enabled"                               'test "$(systemctl is-enabled odg-preprod)" = enabled'
H=$(curl -s --max-time 6 http://127.0.0.1:3000/api/health 2>/dev/null)
ck "health 200 status=ready"                           'echo "$H" | grep -q "\"status\":\"ready\""'
ck "health storage=READY"                              'echo "$H" | grep -q "\"storage\":\"READY\""'
ck "bind 127.0.0.1 ONLY (never 0.0.0.0)"               'ss -ltn 2>/dev/null | grep -q "127.0.0.1:3000" && ! ss -ltn 2>/dev/null | grep -q "0.0.0.0:3000"'
ck "journal since boot: no fatal odg-preprod error"    '! journalctl -b -u odg-preprod --no-pager 2>/dev/null | grep -iE "fatal|unhandled|EADDRINUSE|cannot find module" | grep -q .'
# Control E2E: a read-only AUDIT mission through the REAL host pipeline must validate SUCCESS.
FLEET_BRIDGE_MOCK=1 node runtime/bin/odg-run.js M0001 >/tmp/g8-e2e.out 2>&1
ck "control E2E: M0001 PIPELINE SUCCESS 13/13"         'grep -q "PIPELINE SUCCESS — 13/13 stages" /tmp/g8-e2e.out'
ck "control E2E: mission-report SUCCESS+validated"     'node -e "const r=require(\"./runtime/generated/mission-report.json\");process.exit(r.status===\"SUCCESS\"&&r.validated===true?0:1)"'
echo "G8 VERDICT: $([ $fail -eq 0 ] && echo PASS || echo FAIL)"
exit $fail
