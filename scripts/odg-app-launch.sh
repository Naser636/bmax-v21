#!/bin/bash
# odg-app-launch.sh — launch the ACTIVE ODG release under (user) systemd with the SAME environment the blessed
# deployment uses (scripts/odg-release.sh cmd_run), so storage reports READY. Release-agnostic: follows the `current`
# symlink and reads the build id at start. Loopback-only bind. NO sudo, no deploy, no data mutation. PORT overridable.
set -u
APP="${ODG_APP_DIR:-/home/ubuntu/odg-releases/current/app}"
[ -f "$APP/server.js" ] || { echo "odg-app-launch: missing $APP/server.js"; exit 1; }
# FORCE loopback-only bind (HOSTNAME is already set to the machine hostname in the shell, so a :- default
# would never apply — next-server would bind the public hostname. odg-release.sh hardcodes 127.0.0.1 too).
export HOSTNAME=127.0.0.1
export PORT="${PORT:-3000}"
export ODG_RUNTIME_STATE_DIR="${ODG_RUNTIME_STATE_DIR:-/home/ubuntu/bmax-v21/runtime/generated}"
export ODG_CLIENT_STORE="${ODG_CLIENT_STORE:-/var/lib/odg/clients}"
export ODG_DEPLOYED_BUILD_ID="$(cat "$APP/.next/BUILD_ID" 2>/dev/null)"
export NEXT_TELEMETRY_DISABLED=1
cd "$APP" || exit 1
exec /usr/bin/node "$APP/server.js"
