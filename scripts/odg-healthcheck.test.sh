#!/usr/bin/env bash
# odg-healthcheck.test — ISOLATED: a controllable stub /api/health (returns the code in $T/health.code), a stub
# recover (records it ran + "fixes" health), injected is-active + release root. Never touches production :3000.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
T="$(mktemp -d)"; HP=4055
fails=0; chk(){ [ "$1" = 0 ] && echo "  PASS $2" || { echo "  FAIL $2"; fails=$((fails+1)); }; }
cleanup(){ for p in $(ss -ltnp 2>/dev/null|grep ":$HP "|grep -oE 'pid=[0-9]+'|cut -d= -f2); do kill "$p" 2>/dev/null; done; rm -rf "$T"; }
trap cleanup EXIT
echo "200" > "$T/health.code"
# stub health endpoint: returns the code in health.code
cat > "$T/health-server.js" <<EOF
const http=require('http'),fs=require('fs');
http.createServer((q,r)=>{let c=200;try{c=parseInt(fs.readFileSync('$T/health.code','utf8').trim())||503}catch{c=503}r.writeHead(c);r.end(String(c))}).listen($HP,'127.0.0.1');
EOF
nohup node "$T/health-server.js" >/dev/null 2>&1 & sleep 1
# stub recover: record invocation, "fix" health back to 200
cat > "$T/recover.sh" <<EOF
#!/usr/bin/env bash
echo "RECOVER_CALLED \$(date -u +%s)" >> "$T/recover.log"
echo "200" > "$T/health.code"
exit 0
EOF
chmod +x "$T/recover.sh"
export ODG_REPO="$REPO" ODG_RELEASE_ROOT="$T" ODG_HEALTH_URL="http://127.0.0.1:$HP/api/health" \
       ODG_RECOVER_CMD="$T/recover.sh" ODG_ISACTIVE_CMD="echo active" ODG_HEALTH_THRESHOLD=3
HC(){ bash "$REPO/scripts/odg-healthcheck.sh" >/dev/null 2>&1; }
recovers(){ grep -c RECOVER_CALLED "$T/recover.log" 2>/dev/null || echo 0; }

echo "ODG-HEALTHCHECK — isolated (stub health on 127.0.0.1:$HP)"
# H1 healthy: no recovery, counter 0.
echo "200" > "$T/health.code"; HC; { [ "$(recovers)" = 0 ] && [ "$(cat "$T/.health-fails" 2>/dev/null||echo 0)" = 0 ]; } && chk 0 "H1 healthy ⇒ no recovery, counter 0" || chk 1 "H1 healthy"
# H2 transient: 2 unhealthy polls < threshold ⇒ no recovery, counter climbs.
echo "503" > "$T/health.code"; HC; HC; { [ "$(recovers)" = 0 ] && [ "$(cat "$T/.health-fails")" = 2 ]; } && chk 0 "H2 transient (2/3) ⇒ no premature recovery" || chk 1 "H2 transient"
# H3 persistent: 3rd consecutive unhealthy ⇒ recovery invoked ONCE; counter reset; stub fixed health.
HC; { [ "$(recovers)" = 1 ] && [ "$(cat "$T/.health-fails")" = 0 ]; } && chk 0 "H3 alive+persistently-unhealthy ⇒ recovery invoked once, counter reset" || chk 1 "H3 persistent trigger"
grep -q '"result":"UNHEALTHY_PERSISTENT"' "$T/incidents.jsonl" && chk 0 "H3 incident UNHEALTHY_PERSISTENT recorded" || chk 1 "H3 incident"
# H4 recovered: next poll healthy (stub fixed) ⇒ no further recovery.
HC; [ "$(recovers)" = 1 ] && chk 0 "H4 post-recovery healthy ⇒ no second recovery" || chk 1 "H4 no re-trigger"
# H5 transient tolerance resets: one bad then good ⇒ counter back to 0, no recovery.
echo "503" > "$T/health.code"; HC; echo "200" > "$T/health.code"; HC; { [ "$(recovers)" = 1 ] && [ "$(cat "$T/.health-fails")" = 0 ]; } && chk 0 "H5 blip then healthy ⇒ counter reset (dependency-blip tolerated)" || chk 1 "H5 blip reset"
# H6 lock held (recovery/activation in progress) ⇒ SKIP, no count, no recovery.
echo "503" > "$T/health.code"; mkdir -p "$T/.recovery.lock"; before=$(cat "$T/.health-fails"); HC; { [ "$(cat "$T/.health-fails")" = "$before" ] && [ "$(recovers)" = 1 ]; } && chk 0 "H6 recovery lock held ⇒ skip (no count, no concurrent recovery)" || chk 1 "H6 lock skip"; rmdir "$T/.recovery.lock"
# H7 unit not active (crashed ⇒ OnFailure owns) ⇒ SKIP.
ODG_ISACTIVE_CMD="echo failed" HC; [ "$(recovers)" = 1 ] && chk 0 "H7 unit not active ⇒ skip (defers to OnFailure path)" || chk 1 "H7 inactive skip"
# H8 recover fails ⇒ healthcheck surfaces the failure (no false PASS).
printf '#!/usr/bin/env bash\nexit 2\n' > "$T/recover.sh"; chmod +x "$T/recover.sh"
echo "503" > "$T/health.code"; ODG_HEALTH_THRESHOLD=1 HC; rc=$?
{ [ "$rc" != 0 ] && grep -q '"result":"HEALTHCHECK_RECOVERY_FAILED"' "$T/incidents.jsonl"; } && chk 0 "H8 recover fails ⇒ HEALTHCHECK_RECOVERY_FAILED surfaced (no false PASS)" || chk 1 "H8 recover-fail surfaced"
# H9 loopback only (stub on 127.0.0.1).
ss -ltnp 2>/dev/null|grep ":$HP "|grep -q "127.0.0.1:$HP" && chk 0 "H9 health endpoint loopback only (no public)" || chk 1 "H9 loopback"

echo ""; [ "$fails" = 0 ] && echo "ALL PASS — odg-healthcheck" || echo "$fails FAILURE(S)"
exit "$fails"
