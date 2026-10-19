#!/usr/bin/env bash
# odg-release.test — isolated, reproducible tests of the release pipeline (CTO Phase 2, Lot C).
# Uses a TEMP release root, a TEMP persistent-data dir, a high TEST port, and lightweight FAKE artifacts (a tiny
# node server exposing /api/health reading ODG_DEPLOYED_BUILD_ID). NEVER touches the live :3000 dashboard, never
# uses sudo, binds loopback only. Cleans up all processes/dirs on exit.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REL="$REPO/scripts/odg-release.sh"
TESTROOT="$(mktemp -d)"; DATADIR="$(mktemp -d)"; PORT=4071; STAGE=4072
export ODG_RELEASE_ROOT="$TESTROOT" ODG_RUNTIME_STATE_DIR="$DATADIR" ODG_CLIENT_STORE="$DATADIR/store" ODG_RELEASE_STAGING_PORT="$STAGE"
mkdir -p "$DATADIR/store"
echo '{"generatedAt":"2026-01-01T00:00:00.000Z","health":{"status":"READY"},"lastMission":"DATA_SENTINEL"}' > "$DATADIR/runtime-state.json"
fails=0; chk(){ if [ "$1" = "0" ]; then echo "  PASS $2"; else echo "  FAIL $2"; fails=$((fails+1)); fi; }
cleanup(){ for p in $(ss -ltnp 2>/dev/null | grep -E ":($PORT|$STAGE) " | grep -oE 'pid=[0-9]+' | cut -d= -f2); do kill "$p" 2>/dev/null; done; rm -rf "$TESTROOT" "$DATADIR"; }
trap cleanup EXIT

# Build a FAKE release dir (complete unless $2=incomplete). $1=buildId
mkfake(){ local id="$1"; local mode="${2:-complete}"; local d="$TESTROOT/rel-fake-$id/app";
  mkdir -p "$d/.next/static" "$d/public" "$d/node_modules"; echo "$id" > "$d/.next/BUILD_ID"
  cat > "$d/server.js" <<'JS'
const http=require('http'),bid=process.env.ODG_DEPLOYED_BUILD_ID||'?';const host=process.env.HOSTNAME||'0.0.0.0',port=process.env.PORT||3000;
if(process.env.FAKE_CRASH==='1'){process.exit(1);}
http.createServer((q,r)=>{if(q.url==='/api/health'){r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify({status:'ready',storage:'READY',buildId:bid}))}else{r.writeHead(200);r.end('ok')}}).listen(port,host);
JS
  echo "{\"releaseId\":\"rel-fake-$id\",\"commit\":\"deadbeef0000\",\"buildId\":\"$id\"}" > "$TESTROOT/rel-fake-$id/RELEASE.json"
  [ "$mode" = "incomplete" ] && rm -rf "$d/.next/static"; return 0; }

echo "ODG-RELEASE PIPELINE — isolated tests (root=$TESTROOT port=$PORT)"
mkfake AAA complete; mkfake BBB complete

# C1 create + C3 commit/buildId identity: verify boots staging and matches buildId.
bash "$REL" verify rel-fake-AAA >/dev/null 2>&1; chk $? "C1/C3 complete release verifies (staging health + buildId match)"
# C2/C4 refuse incomplete (missing static assets).
mkfake CCC incomplete; bash "$REL" verify rel-fake-CCC >/dev/null 2>&1; [ $? -ne 0 ] && chk 0 "C2/C4 incomplete artifact (no .next/static) REFUSED" || chk 1 "C2/C4 incomplete artifact REFUSED"
# activate AAA then BBB; C8 rollback restores AAA.
bash "$REL" activate rel-fake-AAA --port "$PORT" >/dev/null 2>&1; chk $? "activate AAA"
served(){ curl -s --max-time 6 "http://127.0.0.1:$PORT/api/health" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).buildId)}catch{console.log("")}})'; }
[ "$(served)" = "AAA" ] && chk 0 "AAA serving after activate" || chk 1 "AAA serving after activate"
bash "$REL" activate rel-fake-BBB --port "$PORT" >/dev/null 2>&1; [ "$(served)" = "BBB" ] && chk 0 "BBB serving after 2nd activate" || chk 1 "BBB serving after 2nd activate"
# C5/C6 data persistence + no runtime copy: the persistent sentinel is untouched and NOT inside any release.
grep -q DATA_SENTINEL "$DATADIR/runtime-state.json" && chk 0 "C5 persistent data intact across switches" || chk 1 "C5 persistent data intact"
[ -z "$(find "$TESTROOT" -name runtime-state.json 2>/dev/null)" ] && chk 0 "C6 no runtime-state copied into any release (data stays external)" || chk 1 "C6 no runtime data in release"
# C8 rollback to AAA.
bash "$REL" rollback --port "$PORT" >/dev/null 2>&1; [ "$(served)" = "AAA" ] && chk 0 "C8 rollback restores AAA" || chk 1 "C8 rollback restores AAA"
# C7/C9 start failure / interruption preserves old: a crashing release must FAIL staging verify BEFORE any switch,
# so `current` still points to AAA and AAA's dir is intact (deterministic — checks the pointer, not live timing).
cur_before="$(readlink "$TESTROOT/current")"
mkfake DDD complete
FAKE_CRASH=1 bash "$REL" activate rel-fake-DDD --port "$PORT" >/dev/null 2>&1; rc=$?
[ "$rc" -ne 0 ] && chk 0 "C7/C9 crashing release activation FAILS (non-zero), no false success" || chk 1 "C7/C9 crashing activation fails"
[ "$(readlink "$TESTROOT/current")" = "$cur_before" ] && chk 0 "C7 current pointer unchanged after failed activation (no mid-switch)" || chk 1 "C7 current pointer unchanged"
[ -f "$TESTROOT/rel-fake-AAA/app/server.js" ] && chk 0 "C7 previous release dir intact (not deleted)" || chk 1 "C7 previous release dir intact"
# C10 loopback-only bind (no 0.0.0.0) + no data deletion.
ss -ltnp 2>/dev/null | grep ":$PORT " | grep -q "127.0.0.1:$PORT" && chk 0 "C10 bind is loopback 127.0.0.1 (no public exposure)" || chk 1 "C10 loopback bind"
[ -f "$DATADIR/runtime-state.json" ] && [ -d "$DATADIR/store" ] && chk 0 "C10 no persistent data deleted" || chk 1 "C10 no data deleted"

# ============ Phase 10 — bounded auto-recovery / rollback fault injection ============
export ODG_RELEASE_HEALTH_ATTEMPTS=4 ODG_RELEASE_HEALTH_INTERVAL=1   # fast + bounded (startup tolerance)
INC="$TESTROOT/incidents.jsonl"
# P-healthy: a healthy activate records an OK incident and does NOT roll back.
mkfake GOOD1 complete
bash "$REL" activate rel-fake-GOOD1 --port "$PORT" >/dev/null 2>&1
grep -q '"action":"activate","result":"OK"' "$INC" 2>/dev/null && chk 0 "P1 healthy activate ⇒ incident OK, no spurious rollback" || chk 1 "P1 healthy activate incident OK"
# P-rollback-success: current=GOOD2, previous=GOOD1 (complete+healthy) ⇒ rollback OK, previous verified + serving.
mkfake GOOD2 complete
ln -sfn "$TESTROOT/rel-fake-GOOD1" "$TESTROOT/previous"
ln -sfn "$TESTROOT/rel-fake-GOOD2" "$TESTROOT/current"
bash "$REL" rollback --port "$PORT" >/dev/null 2>&1; rc=$?
[ "$rc" = 0 ] && [ "$(served)" = "GOOD1" ] && chk 0 "P2 rollback to a verified healthy previous ⇒ OK + serving GOOD1" || chk 1 "P2 rollback success"
# P-invalid-previous: previous artifact incomplete ⇒ NO blind rollback (PREV_INVALID), non-zero, current unchanged.
mkfake BADPREV incomplete
cur_before="$(readlink "$TESTROOT/current")"
ln -sfn "$TESTROOT/rel-fake-BADPREV" "$TESTROOT/previous"
t0=$(date +%s); bash "$REL" rollback --port "$PORT" >/dev/null 2>&1; rc=$?; t1=$(date +%s)
{ [ "$rc" -ne 0 ] && grep -q '"result":"PREV_INVALID"' "$INC"; } && chk 0 "P3 invalid previous ⇒ PREV_INVALID, no blind rollback (exit!=0)" || chk 1 "P3 invalid previous refused"
[ "$(readlink "$TESTROOT/current")" = "$cur_before" ] && chk 0 "P3 current pointer unchanged on refused rollback" || chk 1 "P3 current unchanged"
# P-rollback-failed: previous is complete but its server CRASHES ⇒ ROLLBACK_FAILED, STOP (no loop), BOUNDED time.
mkfake CRASHPREV complete
ln -sfn "$TESTROOT/rel-fake-CRASHPREV" "$TESTROOT/previous"
t0=$(date +%s); FAKE_CRASH=1 bash "$REL" rollback --port "$PORT" >/dev/null 2>&1; rc=$?; t1=$(date +%s)
{ [ "$rc" -ne 0 ] && grep -q '"result":"ROLLBACK_FAILED"' "$INC"; } && chk 0 "P4 rollback health fail ⇒ ROLLBACK_FAILED incident + stop (exit!=0)" || chk 1 "P4 rollback-failed"
[ $((t1 - t0)) -le 15 ] && chk 0 "P4 bounded (completed in $((t1-t0))s ≤ 15 — no infinite loop)" || chk 1 "P4 bounded time"
# P-concurrency: a held lock ⇒ refuse concurrent recovery (fail-closed), does NOT touch current.
mkdir -p "$TESTROOT/.recovery.lock"; echo "99999:0" > "$TESTROOT/.recovery.lock/owner"
bash "$REL" rollback --port "$PORT" >/dev/null 2>&1; rc=$?
[ "$rc" -ne 0 ] && chk 0 "P5 concurrent recovery refused while lock held (RECOVERY_IN_PROGRESS)" || chk 1 "P5 concurrency guard"
rmdir "$TESTROOT/.recovery.lock/owner" 2>/dev/null; rm -rf "$TESTROOT/.recovery.lock"
# P-no-previous: rollback with no previous ⇒ NO_PREVIOUS incident, fail-closed.
rm -f "$TESTROOT/previous"
bash "$REL" rollback --port "$PORT" >/dev/null 2>&1; rc=$?
{ [ "$rc" -ne 0 ] && grep -q '"result":"NO_PREVIOUS"' "$INC"; } && chk 0 "P6 no previous ⇒ NO_PREVIOUS fail-closed (no guess)" || chk 1 "P6 no previous"
# P-data-safety: persistent data untouched + loopback throughout the recovery scenarios.
{ [ -f "$DATADIR/runtime-state.json" ] && [ -d "$DATADIR/store" ]; } && chk 0 "P7 persistent data intact across recovery drills" || chk 1 "P7 data intact"
# P-incident-trace: structured records exist (incident/action/result/durationMs/exitCode).
grep -q '"durationMs"' "$INC" && grep -q '"exitCode"' "$INC" && chk 0 "P8 incident trace structured (durationMs+exitCode)" || chk 1 "P8 incident trace"

echo ""; [ "$fails" = "0" ] && echo "ALL PASS — odg-release pipeline ($(bash "$REL" list | wc -l) releases)" || echo "$fails FAILURE(S)"
exit "$fails"
