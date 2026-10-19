#!/usr/bin/env bash
# odg-release — immutable release pipeline for the BMAX dashboard on the VPS (CTO Phase 2).
#
# Each release is an IMMUTABLE directory keyed by commit+buildId under $ODG_RELEASE_ROOT, built from a precise
# checkout, validated (artifact completeness incl. static assets), activated via an ATOMIC `current` symlink swap
# + a clean process restart from the selected release dir, health-checked, and rollback-able to the previous
# release. Persistent data (ODG_RUNTIME_STATE_DIR, ODG_CLIENT_STORE) is ABSOLUTE and lives OUTSIDE every release;
# it is never copied into or deleted by this pipeline.
#
# Safety: set -euo pipefail (stop on first error); loopback-only host default; NEVER rm persistent data; no sudo;
# does not touch systemd. The old process keeps running from its OWN intact release dir until a validated switch,
# so there is never a process pointing at a replaced/deleted directory.
#
# Subcommands:
#   build [--commit <sha>]          build an immutable release from a checkout (default: current HEAD)
#   verify <releaseId>              re-check artifact completeness; boot on a staging port; assert health+buildId
#   activate <releaseId> [--port N] [--host H]   staging health-check → atomic `current` swap → restart → health
#   rollback [--port N] [--host H]  switch `current` back to the previous release and restart
#   status                          show current/previous release + running listener
#   list                            list releases (newest first)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_ROOT="${ODG_RELEASE_ROOT:-/home/ubuntu/odg-releases}"
DATA_STATE="${ODG_RUNTIME_STATE_DIR:-$REPO/runtime/generated}"   # absolute persistent runtime artifacts
DATA_STORE="${ODG_CLIENT_STORE:-/var/lib/odg/clients}"           # absolute persistent client intake
HOST_DEFAULT="127.0.0.1"                                         # loopback only (no public exposure)
PORT_DEFAULT="3000"
STAGING_PORT="${ODG_RELEASE_STAGING_PORT:-3999}"

log() { printf '[odg-release] %s\n' "$*" >&2; }
die() { printf '[odg-release] ERROR: %s\n' "$*" >&2; exit 1; }

# --- artifact completeness: the standalone server + traced node_modules + BOTH static asset trees + BUILD_ID ---
# (Next standalone does NOT auto-copy public/ or .next/static — a release missing them is INCOMPLETE and must be
#  refused rather than activated into a broken dashboard.)
verify_artifact() {
  local app="$1"
  [ -f "$app/server.js" ]                 || { echo "MISSING server.js"; return 1; }
  [ -d "$app/.next" ]                      || { echo "MISSING .next"; return 1; }
  [ -f "$app/.next/BUILD_ID" ]             || { echo "MISSING .next/BUILD_ID"; return 1; }
  [ -d "$app/.next/static" ]               || { echo "MISSING .next/static (static assets not copied)"; return 1; }
  [ -d "$app/public" ]                     || { echo "MISSING public/"; return 1; }
  [ -d "$app/node_modules" ]               || { echo "MISSING node_modules (traced deps)"; return 1; }
  return 0
}

cmd_build() {
  local commit="HEAD"
  while [ $# -gt 0 ]; do case "$1" in --commit) commit="$2"; shift 2;; *) die "unknown build arg $1";; esac; done
  local sha; sha="$(git -C "$REPO" rev-parse --verify "$commit")" || die "bad commit $commit"
  local short="${sha:0:12}"
  mkdir -p "$RELEASE_ROOT"
  local wt; wt="$(mktemp -d "$RELEASE_ROOT/.build-XXXXXX")"
  log "building release from $short in isolated worktree $wt"
  # Build from a PRECISE checkout (immutable source); clean worktree ⇒ reproducible.
  git -C "$REPO" worktree add -q --detach "$wt" "$sha"
  local buildId rid app blog="$wt/.release-build.log"
  (
    cd "$wt"
    npm ci --no-audit --no-fund >"$blog" 2>&1 || die "npm ci failed (see $blog)"
    # The Next app requires the COMPILED runtime (runtime/dist, git-ignored) — e.g. api/intake requires
    # runtime/dist/core/intake-endpoint.js. Build it BEFORE next build, else Turbopack fails module resolution.
    npm run build:runtime >>"$blog" 2>&1 || die "build:runtime failed (see $blog)"
    npm run build >>"$blog" 2>&1 || die "next build failed (see $blog)"
    # Static assets are NOT auto-copied into standalone — copy them so the artifact is COMPLETE.
    cp -r public .next/standalone/ 2>/dev/null || true
    mkdir -p .next/standalone/.next && cp -r .next/static .next/standalone/.next/
  ) || die "build steps failed (see $blog)"
  buildId="$(cat "$wt/.next/BUILD_ID")"
  rid="rel-$(git -C "$REPO" show -s --format=%cd --date=format:%Y%m%dT%H%M%SZ "$sha" | tr -d :)-$short-$buildId"
  app="$RELEASE_ROOT/$rid/app"
  if [ -e "$RELEASE_ROOT/$rid" ]; then log "release $rid already exists (idempotent); reusing"; else
    mkdir -p "$RELEASE_ROOT/$rid"
    mv "$wt/.next/standalone" "$app"
    cat > "$RELEASE_ROOT/$rid/RELEASE.json" <<EOF
{"releaseId":"$rid","commit":"$sha","buildId":"$buildId","createdAt":"$(git -C "$REPO" show -s --format=%cI "$sha")","node":"$(node -v)","host":"$(hostname)"}
EOF
  fi
  git -C "$REPO" worktree remove --force "$wt" 2>/dev/null || rm -rf "$wt"
  # Refuse to leave an INCOMPLETE release usable.
  local why; if ! why="$(verify_artifact "$app")"; then rm -rf "$RELEASE_ROOT/$rid"; die "artifact incomplete ($why) — release refused"; fi
  log "built + verified release: $rid (buildId=$buildId commit=$short)"
  echo "$rid"
}

# Boot a release on a given host:port in the background; echo the pid. Persistent data via ABSOLUTE env.
_boot() {
  local app="$1" host="$2" port="$3" logf="$4"
  HOSTNAME="$host" PORT="$port" \
    ODG_RUNTIME_STATE_DIR="$DATA_STATE" ODG_CLIENT_STORE="$DATA_STORE" \
    ODG_DEPLOYED_BUILD_ID="$(cat "$app/.next/BUILD_ID")" \
    nohup node "$app/server.js" > "$logf" 2>&1 &
  echo $!
}

_health() { # host port -> echoes http code; 000 on no-answer
  curl -s -o /dev/null -w '%{http_code}' --max-time 8 "http://$1:$2/api/health" 2>/dev/null || echo "000"
}

# --- Bounded auto-recovery primitives (Phase 10) -----------------------------------------------------------
HEALTH_ATTEMPTS="${ODG_RELEASE_HEALTH_ATTEMPTS:-5}"   # bounded retries (slow-start tolerance, no infinite wait)
HEALTH_INTERVAL="${ODG_RELEASE_HEALTH_INTERVAL:-2}"   # seconds between attempts
LOCK_DIR="$RELEASE_ROOT/.recovery.lock"
INCIDENTS="$RELEASE_ROOT/incidents.jsonl"

# Poll health up to HEALTH_ATTEMPTS × HEALTH_INTERVAL; echoes final code (200 on success). Distinguishes a
# temporary slow start from a persistent failure without an unbounded wait.
_health_wait() {
  local host="$1" port="$2" i code="000"
  for ((i=1; i<=HEALTH_ATTEMPTS; i++)); do
    code="$(_health "$host" "$port")"
    [ "$code" = "200" ] && { echo "200"; return 0; }
    sleep "$HEALTH_INTERVAL"
  done
  echo "$code"; return 1
}

# Single active recovery per release root (mkdir is atomic). Fail-closed on a held lock ⇒ no concurrent recovery.
# Acquired once at command dispatch; internal cmd_activate→cmd_rollback runs UNDER the same lock (no re-acquire).
_acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then echo "$$:$(date -u +%s)" > "$LOCK_DIR/owner"; trap '_release_lock' EXIT; return 0; fi
  die "RECOVERY_IN_PROGRESS: $LOCK_DIR held (owner $(cat "$LOCK_DIR/owner" 2>/dev/null)) — refusing concurrent recovery"
}
_release_lock() { rm -rf "$LOCK_DIR" 2>/dev/null || true; }

# Append-only, deduped incident trace (never deletes). Fields: from action result durationMs exitCode blocker.
_incident() {
  mkdir -p "$RELEASE_ROOT"
  local rec="{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"from\":\"$1\",\"action\":\"$2\",\"result\":\"$3\",\"durationMs\":${4:-0},\"exitCode\":${5:-0},\"blocker\":\"${6:-}\"}"
  local last now
  last="$( { tail -1 "$INCIDENTS" 2>/dev/null || true; } | sed 's/"ts":"[^"]*",//' || true)"   # file may not exist yet
  now="$(echo "$rec" | sed 's/"ts":"[^"]*",//' || true)"
  [ "$last" = "$now" ] || echo "$rec" >> "$INCIDENTS"   # dedup identical consecutive (minus timestamp)
  log "INCIDENT $2/$3 from=$1 (${4:-0}ms exit=${5:-0})${6:+ blocker=$6}"
}

cmd_verify() {
  local rid="$1"; local app="$RELEASE_ROOT/$rid/app"
  [ -d "$app" ] || die "no such release $rid"
  local why; why="$(verify_artifact "$app")" || die "artifact incomplete: $why"
  local logf; logf="$(mktemp)"; local pid; pid="$(_boot "$app" "$HOST_DEFAULT" "$STAGING_PORT" "$logf")"
  sleep 4
  local code; code="$(_health "$HOST_DEFAULT" "$STAGING_PORT")"
  local served; served="$(curl -s --max-time 8 "http://$HOST_DEFAULT:$STAGING_PORT/api/health" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).buildId)}catch{console.log("")}})' 2>/dev/null || echo "")"
  kill "$pid" 2>/dev/null || true; sleep 1
  local want; want="$(cat "$app/.next/BUILD_ID")"
  [ "$code" = "200" ] || die "staging health not 200 (got $code); log: $(tail -2 "$logf")"
  [ "$served" = "$want" ] || die "served buildId ($served) != artifact buildId ($want)"
  log "verify OK: $rid health=200 buildId=$want"
}

cmd_activate() {
  local rid="$1"; shift; local host="$HOST_DEFAULT" port="$PORT_DEFAULT"
  while [ $# -gt 0 ]; do case "$1" in --port) port="$2"; shift 2;; --host) host="$2"; shift 2;; *) die "unknown activate arg $1";; esac; done
  local app="$RELEASE_ROOT/$rid/app"
  [ -d "$app" ] || die "no such release $rid"
  cmd_verify "$rid"   # staging validation BEFORE any switch
  # Record the previous current for rollback, then ATOMIC swap of the current pointer.
  if [ -L "$RELEASE_ROOT/current" ]; then ln -sfn "$(readlink "$RELEASE_ROOT/current")" "$RELEASE_ROOT/previous"; fi
  ln -sfn "$RELEASE_ROOT/$rid" "$RELEASE_ROOT/current.tmp" && mv -T "$RELEASE_ROOT/current.tmp" "$RELEASE_ROOT/current"
  # Stop whatever currently listens on the target port (our own prior release), then start the new one.
  local old; old="$(ss -ltnp 2>/dev/null | grep ":$port " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2 || true)"
  [ -n "${old:-}" ] && { kill "$old" 2>/dev/null || true; sleep 2; }
  local logf="$RELEASE_ROOT/$rid/server.log"; local pid started; started=$(date +%s%3N 2>/dev/null || echo 0); pid="$(_boot "$RELEASE_ROOT/current/app" "$host" "$port" "$logf")"
  local code; code="$(_health_wait "$host" "$port" || true)"   # BOUNDED retries; || true so set -e cannot abort before the incident/rollback logic
  local dur=$(( $(date +%s%3N 2>/dev/null || echo 0) - started ))
  if [ "$code" != "200" ]; then
    _incident "$rid" "activate" "HEALTH_FAIL" "$dur" "$code" ""
    log "activation health FAILED ($code after $HEALTH_ATTEMPTS attempts) — auto-rolling back"; kill "$pid" 2>/dev/null || true
    cmd_rollback --port "$port" --host "$host"   # rollback verifies previous integrity + is itself fail-closed
    die "activation failed; rolled back"
  fi
  _incident "$rid" "activate" "OK" "$dur" "200" ""
  log "ACTIVATED $rid on $host:$port health=200 pid=$pid"
}

cmd_rollback() {
  local host="$HOST_DEFAULT" port="$PORT_DEFAULT"
  while [ $# -gt 0 ]; do case "$1" in --port) port="$2"; shift 2;; --host) host="$2"; shift 2;; *) die "unknown rollback arg $1";; esac; done
  [ -L "$RELEASE_ROOT/previous" ] || { _incident "none" "rollback" "NO_PREVIOUS" 0 1 "no previous release"; die "no previous release to roll back to"; }
  local prev; prev="$(readlink "$RELEASE_ROOT/previous")"
  [ -d "$prev/app" ] || { _incident "$(basename "$prev")" "rollback" "PREV_MISSING" 0 1 "previous artifact missing"; die "previous release artifact missing: $prev"; }
  # NO BLIND ROLLBACK — the previous release must be a COMPLETE artifact (integrity/identity) before we switch to it.
  local why; if ! why="$(verify_artifact "$prev/app")"; then _incident "$(basename "$prev")" "rollback" "PREV_INVALID" 0 1 "$why"; die "previous release invalid ($why) — refusing blind rollback"; fi
  ln -sfn "$prev" "$RELEASE_ROOT/current.tmp" && mv -T "$RELEASE_ROOT/current.tmp" "$RELEASE_ROOT/current"
  local old; old="$(ss -ltnp 2>/dev/null | grep ":$port " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2 || true)"
  [ -n "${old:-}" ] && { kill "$old" 2>/dev/null || true; sleep 2; }
  local pid started; started=$(date +%s%3N 2>/dev/null || echo 0); pid="$(_boot "$prev/app" "$host" "$port" "$prev/server.log")"
  local code; code="$(_health_wait "$host" "$port" || true)"
  local dur=$(( $(date +%s%3N 2>/dev/null || echo 0) - started ))
  if [ "$code" != "200" ]; then
    # Rollback ITSELF failed — STOP automatic attempts (no infinite loop), preserve evidence, declare the incident.
    _incident "$(basename "$prev")" "rollback" "ROLLBACK_FAILED" "$dur" "$code" "manual intervention required"
    die "ROLLBACK FAILED (health $code) — automatic recovery STOPPED, incident recorded, no retry loop"
  fi
  _incident "$(basename "$prev")" "rollback" "OK" "$dur" "200" ""
  log "ROLLED BACK to $(basename "$prev") on $host:$port health=200 pid=$pid"
}

cmd_status() {
  echo "release_root: $RELEASE_ROOT"
  echo "current:  $([ -L "$RELEASE_ROOT/current" ] && basename "$(readlink "$RELEASE_ROOT/current")" || echo '(none)')"
  echo "previous: $([ -L "$RELEASE_ROOT/previous" ] && basename "$(readlink "$RELEASE_ROOT/previous")" || echo '(none)')"
  echo "data_state_dir: $DATA_STATE"
  echo "data_store: $DATA_STORE"
  ss -ltnp 2>/dev/null | grep -E ":(3000|$PORT_DEFAULT) " || echo "no listener on $PORT_DEFAULT"
}

cmd_list() { ls -1t "$RELEASE_ROOT" 2>/dev/null | grep '^rel-' || echo "(no releases)"; }

case "${1:-}" in
  build) shift; cmd_build "$@";;
  verify) shift; cmd_verify "$@";;
  activate) shift; _acquire_lock; cmd_activate "$@";;
  rollback) shift; _acquire_lock; cmd_rollback "$@";;
  status) shift; cmd_status "$@";;
  list) shift; cmd_list "$@";;
  *) die "usage: odg-release {build|verify|activate|rollback|status|list}";;
esac
