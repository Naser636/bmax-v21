#!/usr/bin/env bash
# V375 Lot B — run ONE resident-driver L1 SIMULATE cycle under bubblewrap with a MINIMAL READ-ONLY view (no host root,
# no /run ⇒ no host Unix sockets) and NO
# network (all namespaces unshared), then compare a repository fingerprint before/after. The READ-ONLY mount is the
# structural proof; the fingerprint is a supplementary check (a concurrent mission-runner tick writing
# runtime/generated would change it without any L1 write — re-run if zeroWrite=false and inspect).
# Dev/sandbox only: no systemd, no sudo, no unit change. Usage: scripts/odg-resident-driver-l1-sandbox.sh [repo]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"   # code (cycle + core) comes from THIS checkout
REPO="$(cd "${1:-$HERE}" && pwd -P)"; cd "$REPO"                 # state (companion, fingerprint) comes from the target repo
fp() {   # HEAD + index/worktree status + content hash of tracked files + listing of runtime/{generated,logs}
  { git rev-parse HEAD; git status --porcelain=v1 --untracked-files=all; git ls-files -s | sha256sum;
    { find runtime/generated runtime/logs -type f -printf '%p %s %T@\n' 2>/dev/null || true; } | sort; } | sha256sum | cut -d' ' -f1
}
before=$(fp)
NODE="$(readlink -f "$(command -v node)")"; TSX="$HERE/node_modules/.bin/tsx"; NM="$(readlink -f "$HERE/node_modules")"
# MINIMAL view (inspection HIGH): NOT the host root. Only system dirs (ro), node, the code checkout, node_modules and the
# target repo (ro). No /run, no /home except those binds ⇒ no host Unix sockets (systemd user manager, D-Bus, ssh-agent).
BW=(bwrap --unshare-all --die-with-parent --new-session --clearenv --setenv PATH /usr/bin:/bin --setenv TMPDIR /tmp --setenv HOME /tmp
    --ro-bind /usr /usr --ro-bind /etc /etc --dev /dev --proc /proc --tmpfs /tmp --tmpfs /run)
for d in /bin /lib /lib64 /sbin; do [ -e "$d" ] && BW+=(--ro-bind "$d" "$d"); done
NODE_PREFIX="$(dirname "$(dirname "$NODE")")"   # node outside /usr (CI tool cache, nvm) ⇒ bind its install prefix read-only
case "$NODE_PREFIX" in /usr|/usr/*|/) ;; *) BW+=(--ro-bind "$NODE_PREFIX" "$NODE_PREFIX") ;; esac
BW+=(--ro-bind "$NM" "$NM" --ro-bind "$HERE" "$HERE"); [ "$REPO" != "$HERE" ] && BW+=(--ro-bind "$REPO" "$REPO")
out=$("${BW[@]}" --chdir "$REPO" ${ODG_SCHEDULER_STOP:+--setenv ODG_SCHEDULER_STOP "$ODG_SCHEDULER_STOP"} \
        "$NODE" "$TSX" "$HERE/runtime/bin/odg-resident-driver-l1-cycle.ts")
# negative controls inside the SAME sandbox: a repo write must fail; host sockets must be unreachable; only loopback.
if "${BW[@]}" --chdir "$REPO" /bin/sh -c 'echo x > runtime/.l1-write-probe' 2>/dev/null; then rw=WRITABLE; rm -f "$REPO/runtime/.l1-write-probe"; else rw=READ_ONLY; fi
sock=$("${BW[@]}" "$NODE" -e '
  const net=require("net"); const ps=["/run/user/'"$(id -u)"'/bus","/run/user/'"$(id -u)"'/systemd/private","/run/dbus/system_bus_socket","/run/snapd.socket"];
  let left=ps.length, hit=[]; for (const p of ps){ const c=net.connect(p); c.on("connect",()=>{hit.push(p);c.destroy();if(!--left)done();}); c.on("error",()=>{if(!--left)done();}); }
  function done(){ process.stdout.write(hit.length?("REACHABLE:"+hit.join(",")):"NONE_REACHABLE"); }')
net=$("${BW[@]}" "$NODE" -e 'process.stdout.write(Object.keys(require("os").networkInterfaces()).join(","))')
after=$(fp)
printf '{"sandbox":{"fs":"%s","hostSockets":"%s","netInterfaces":"%s"},"fingerprintBefore":"%s","fingerprintAfter":"%s","zeroWrite":%s,"cycle":%s}\n' \
  "$rw" "$sock" "$net" "$before" "$after" "$([ "$before" = "$after" ] && echo true || echo false)" "$out"
