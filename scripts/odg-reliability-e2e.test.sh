#!/usr/bin/env bash
# odg-reliability-e2e.test — ISOLATED end-to-end proof of the FULL chain with the REAL scripts (no stubbed recover):
#   odg-healthcheck.sh → odg-recover.sh → odg-release.sh
# A DURABLE HTTP process stays ALIVE and serves 503 (the alive-but-unhealthy fault). A stub `systemctl` boots
# current/app (as the service manager would). Test port 4079 + temp release root — NEVER touches production :3000,
# never real systemctl, loopback only. Cleans up all processes/dirs on exit.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
T="$(mktemp -d)"; PORT=4079
fails=0; chk(){ [ "$1" = 0 ] && echo "  PASS $2" || { echo "  FAIL $2"; fails=$((fails+1)); }; }
cleanup(){ for p in $(ss -ltnp 2>/dev/null|grep ":$PORT "|grep -oE 'pid=[0-9]+'|cut -d= -f2); do kill "$p" 2>/dev/null; done; rm -rf "$T"; }
trap cleanup EXIT

# Two real releases: GOOD (health 200) and SICK (health 503, stays ALIVE). Complete artifacts (pass verify_artifact).
mkrel(){ local id="$1"; local code="$2"; local d="$T/rel-$id/app"; mkdir -p "$d/.next/static" "$d/public" "$d/node_modules"; echo "$id">"$d/.next/BUILD_ID"; echo '{}'>"$T/rel-$id/RELEASE.json"
  printf "%s\n" "const http=require('http');process.on('SIGTERM',()=>process.exit(0));http.createServer((q,r)=>{if(q.url==='/api/health'){r.writeHead($code);r.end('$id')}else{r.writeHead(200);r.end('ok')}}).listen(process.env.PORT||$PORT,'127.0.0.1');" > "$d/server.js"; }
mkrel GOOD 200; mkrel SICK 503
ln -sfn "$T/rel-SICK" "$T/current"; ln -sfn "$T/rel-GOOD" "$T/previous"

# Boot the current app on the test port (simulates systemd running current/app). Used at start + by the stub restart.
boot_current(){ for p in $(ss -ltnp 2>/dev/null|grep ":$PORT "|grep -oE 'pid=[0-9]+'|cut -d= -f2); do kill "$p" 2>/dev/null; done; sleep 1
  HOSTNAME=127.0.0.1 PORT=$PORT nohup node "$T/current/app/server.js" >/dev/null 2>&1 & sleep 1; }
# Stub systemctl for odg-recover: `restart` reboots current/app (now GOOD after the swap).
STUB="$T/systemctl"; printf '#!/usr/bin/env bash\n[ "$1" = restart ] || exit 0\nfor p in $(ss -ltnp 2>/dev/null|grep ":%s "|grep -oE "pid=[0-9]+"|cut -d= -f2); do kill "$p" 2>/dev/null; done; sleep 1\nHOSTNAME=127.0.0.1 PORT=%s nohup node "%s/current/app/server.js" >/dev/null 2>&1 &\nexit 0\n' "$PORT" "$PORT" "$T" > "$STUB"; chmod +x "$STUB"

export ODG_REPO="$REPO" ODG_RELEASE_ROOT="$T" ODG_RECOVER_PORT="$PORT" ODG_RECOVER_HOST=127.0.0.1 \
  ODG_HEALTH_URL="http://127.0.0.1:$PORT/api/health" ODG_ISACTIVE_CMD="echo active" ODG_SYSTEMCTL="$STUB" \
  ODG_HEALTH_THRESHOLD=3 ODG_RELEASE_HEALTH_ATTEMPTS=4 ODG_RELEASE_HEALTH_INTERVAL=1 ODG_RECOVER_MAX=2 ODG_RECOVER_WINDOW=300
served(){ curl -s "http://127.0.0.1:$PORT/api/health" --max-time 4 2>/dev/null; }
HC(){ bash "$REPO/scripts/odg-healthcheck.sh" >/dev/null 2>&1; }

echo "ODG-RELIABILITY E2E — real healthcheck→recover→release vs a DURABLE 503 process (port $PORT)"
boot_current
# Precondition: a REAL, LIVE process that serves 503 (alive-but-unhealthy).
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 "http://127.0.0.1:$PORT/api/health" 2>/dev/null)
{ [ "$code" = 503 ] && [ -n "$(ss -ltnp 2>/dev/null|grep ":$PORT ")" ]; } && chk 0 "precondition: a LIVE process serves 503 (alive-but-unhealthy)" || chk 1 "precondition alive+503 (got $code)"
# 1-2: two consecutive failures do NOT recover.
HC; HC; { [ "$(served)" = SICK ] && [ "$(cat "$T/.health-fails")" = 2 ]; } && chk 0 "two failures (2/3) ⇒ NO recovery (still SICK)" || chk 1 "no premature recovery"
# 3: third failure triggers EXACTLY ONE recovery through the real chain ⇒ served becomes GOOD.
HC; sleep 2
{ [ "$(served)" = GOOD ] && [ "$(basename "$(readlink "$T/current")")" = rel-GOOD ]; } && chk 0 "3rd failure ⇒ real recovery via healthcheck→recover→release ⇒ serving GOOD" || chk 1 "3rd triggers recovery"
# incidents from EACH real script in the chain.
grep -q '"result":"UNHEALTHY_PERSISTENT"' "$T/incidents.jsonl" && chk 0 "healthcheck incident UNHEALTHY_PERSISTENT" || chk 1 "healthcheck incident"
grep -q '"result":"SWITCHED"' "$T/incidents.jsonl" && chk 0 "odg-release rollback incident SWITCHED (release layer reached)" || chk 1 "release incident"
grep -q '"result":"RECOVERED"' "$T/incidents.jsonl" && chk 0 "odg-recover incident RECOVERED (health re-verified 200)" || chk 1 "recover incident"
# 4: counter reset + healthy ⇒ no second recovery.
HC; { [ "$(cat "$T/.health-fails")" = 0 ] && [ "$(served)" = GOOD ]; } && chk 0 "post-recovery healthy ⇒ counter reset, no second recovery" || chk 1 "post-recovery stable"
# 5: concurrency lock blocks a second recovery.
echo "503" >/dev/null; for p in $(ss -ltnp 2>/dev/null|grep ":$PORT "|grep -oE 'pid=[0-9]+'|cut -d= -f2); do kill "$p" 2>/dev/null; done; sleep 1
ln -sfn "$T/rel-SICK" "$T/current"; boot_current; mkdir -p "$T/.recovery.lock"
before=$(cat "$T/.health-fails"); HC; [ "$(cat "$T/.health-fails")" = "$before" ] && chk 0 "recovery lock held ⇒ healthcheck skips (no concurrent recovery)" || chk 1 "lock skip"; rmdir "$T/.recovery.lock"
# 6: loopback only.
ss -ltnp 2>/dev/null|grep ":$PORT "|grep -q "127.0.0.1:$PORT" && chk 0 "test process loopback only (no public)" || chk 1 "loopback"

echo ""; [ "$fails" = 0 ] && echo "ALL PASS — reliability e2e (real chain)" || echo "$fails FAILURE(S)"
exit "$fails"
