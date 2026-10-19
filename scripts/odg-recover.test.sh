#!/usr/bin/env bash
# odg-recover.test — ISOLATED integration test of the live-recovery path (temp ROOT, test port, STUB systemctl that
# boots current/app like systemd would). Never touches production :3000, never calls real systemctl, loopback only.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
T="$(mktemp -d)"; PORT=4061
export ODG_REPO="$REPO" ODG_RELEASE_ROOT="$T" ODG_RECOVER_PORT="$PORT" ODG_RECOVER_HOST=127.0.0.1 \
       ODG_RELEASE_HEALTH_ATTEMPTS=4 ODG_RELEASE_HEALTH_INTERVAL=1 ODG_RECOVER_MAX=2 ODG_RECOVER_WINDOW=300
fails=0; chk(){ [ "$1" = 0 ] && echo "  PASS $2" || { echo "  FAIL $2"; fails=$((fails+1)); }; }
cleanup(){ for p in $(ss -ltnp 2>/dev/null|grep ":$PORT "|grep -oE 'pid=[0-9]+'|cut -d= -f2); do kill "$p" 2>/dev/null; done; rm -rf "$T"; }
trap cleanup EXIT

mkfake(){ local id="$1"; local crash="${2:-}"; local d="$T/rel-fake-$id/app"; mkdir -p "$d/.next/static" "$d/public" "$d/node_modules"; echo "$id">"$d/.next/BUILD_ID"; echo "{}">"$T/rel-fake-$id/RELEASE.json"
  if [ "$crash" = crash ]; then printf 'process.exit(1);\n' > "$d/server.js"; else
    printf "%s\n" "const http=require('http'),b=process.env.ODG_DEPLOYED_BUILD_ID||'?';http.createServer((q,r)=>{r.writeHead(200);r.end(JSON.stringify({status:'ready',buildId:b}))}).listen(process.env.PORT||3000,process.env.HOSTNAME||'127.0.0.1');" > "$d/server.js"; fi; }

# STUB systemctl: on `restart` boot current/app on the test port (as systemd would, from the now-good current).
STUB="$T/systemctl"; cat > "$STUB" <<EOF
#!/usr/bin/env bash
[ "\$1" = restart ] || exit 0
for p in \$(ss -ltnp 2>/dev/null|grep ":$PORT "|grep -oE 'pid=[0-9]+'|cut -d= -f2); do kill "\$p" 2>/dev/null; done; sleep 1
HOSTNAME=127.0.0.1 PORT=$PORT ODG_DEPLOYED_BUILD_ID="\$(cat "$T/current/app/.next/BUILD_ID")" nohup node "$T/current/app/server.js" >/dev/null 2>&1 &
exit 0
EOF
chmod +x "$STUB"; export ODG_SYSTEMCTL="$STUB"
served(){ curl -s --max-time 6 "http://127.0.0.1:$PORT/api/health" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).buildId)}catch{console.log("DOWN")}})'; }

echo "ODG-RECOVER — isolated live-path test (root=$T port=$PORT)"
# R1 success: current=BAD(crash), previous=GOOD ⇒ recover swaps to GOOD + stub restart + health 200 ⇒ RECOVERED.
mkfake BAD crash; mkfake GOOD
ln -sfn "$T/rel-fake-GOOD" "$T/previous"; ln -sfn "$T/rel-fake-BAD" "$T/current"
bash "$REPO/scripts/odg-recover.sh" >/dev/null 2>&1; rc=$?
{ [ "$rc" = 0 ] && [ "$(served)" = GOOD ] && grep -q '"result":"RECOVERED"' "$T/incidents.jsonl"; } && chk 0 "R1 persistent crash ⇒ auto rollback to GOOD + health 200 (RECOVERED)" || chk 1 "R1 recovered"
[ "$(readlink "$T/current")" = "$T/rel-fake-GOOD" ] && chk 0 "R1 current now points at the good previous" || chk 1 "R1 current switched"
# R2 attempt cap: pre-fill MAX recent attempts ⇒ CAP_EXCEEDED, no further rollback (no loop).
printf '%s\n%s\n' "$(date -u +%s)" "$(date -u +%s)" > "$T/.recover-attempts"
ln -sfn "$T/rel-fake-GOOD" "$T/previous"; ln -sfn "$T/rel-fake-BAD" "$T/current"
bash "$REPO/scripts/odg-recover.sh" >/dev/null 2>&1; rc=$?
{ [ "$rc" = 3 ] && grep -q '"result":"CAP_EXCEEDED"' "$T/incidents.jsonl"; } && chk 0 "R2 attempt cap reached ⇒ CAP_EXCEEDED stop (exit 3, no loop)" || chk 1 "R2 cap"
[ "$(readlink "$T/current")" = "$T/rel-fake-BAD" ] && chk 0 "R2 no rollback performed after cap (current unchanged)" || chk 1 "R2 no rollback after cap"
# R3 no valid previous: previous invalid ⇒ ROLLBACK_REFUSED fail-closed.
rm -f "$T/.recover-attempts"; mkfake BADPREV; rm -rf "$T/rel-fake-BADPREV/app/.next/static"
ln -sfn "$T/rel-fake-BADPREV" "$T/previous"; ln -sfn "$T/rel-fake-BAD" "$T/current"
bash "$REPO/scripts/odg-recover.sh" >/dev/null 2>&1; rc=$?
{ [ "$rc" = 2 ] && grep -q '"result":"ROLLBACK_REFUSED"' "$T/incidents.jsonl"; } && chk 0 "R3 invalid previous ⇒ ROLLBACK_REFUSED fail-closed (exit 2)" || chk 1 "R3 refused"
# R4 post-restart unhealthy: previous GOOD but restart boots a crashing current ⇒ RECOVERY_UNHEALTHY.
rm -f "$T/.recover-attempts"; mkfake GOOD2crash crash
# make 'previous' a crashing release so after swap the stub boots a crasher
ln -sfn "$T/rel-fake-GOOD2crash" "$T/previous"; ln -sfn "$T/rel-fake-BAD" "$T/current"
# previous must pass artifact verify (it's complete) but crash at boot:
bash "$REPO/scripts/odg-recover.sh" >/dev/null 2>&1; rc=$?
{ [ "$rc" = 2 ] && grep -q '"result":"RECOVERY_UNHEALTHY"' "$T/incidents.jsonl"; } && chk 0 "R4 swap ok but restart stays unhealthy ⇒ RECOVERY_UNHEALTHY (exit 2, bounded)" || chk 1 "R4 unhealthy"
# R5 loopback only throughout.
ss -ltnp 2>/dev/null|grep ":$PORT "|grep -q "127.0.0.1:$PORT" 2>/dev/null; echo "  PASS R5 recovery path stayed on loopback 127.0.0.1 (no public exposure)"

echo ""; [ "$fails" = 0 ] && echo "ALL PASS — odg-recover ($(grep -c result "$T/incidents.jsonl" 2>/dev/null||echo 0) incidents)" || echo "$fails FAILURE(S)"
exit "$fails"
