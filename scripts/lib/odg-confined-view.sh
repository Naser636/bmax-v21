# V15 — shared bubblewrap view for the resident driver (sourced, not executed).
# odg_confined_view <repo> [writable-subdir ...] → fills the global array BW with: all namespaces unshared (network:
# loopback only), cleared env, system dirs + node prefix + node_modules + repo READ-ONLY, the listed repo subdirs
# WRITABLE, private /tmp and /run (no host Unix socket: systemd user manager, D-Bus, ssh-agent).
odg_confined_view() {
  local repo="$1"; shift
  local node nm prefix d
  node="$(readlink -f "$(command -v node)")"; nm="$(readlink -f "$repo/node_modules")"; prefix="$(dirname "$(dirname "$node")")"
  BW=(bwrap --unshare-all --die-with-parent --new-session --clearenv
      --setenv PATH /usr/local/bin:/usr/bin:/bin --setenv TMPDIR /tmp --setenv HOME /tmp
      --ro-bind /usr /usr --ro-bind /etc /etc --dev /dev --proc /proc --tmpfs /tmp --tmpfs /run)
  for d in /bin /lib /lib64 /sbin; do [ -e "$d" ] && BW+=(--ro-bind "$d" "$d"); done
  case "$prefix" in /usr|/usr/*|/) ;; *) BW+=(--ro-bind "$prefix" "$prefix") ;; esac
  BW+=(--ro-bind "$repo" "$repo")
  [ "${nm#"$repo"/}" = "$nm" ] && BW+=(--ro-bind "$nm" "$nm")
  for d in "$@"; do mkdir -p "$repo/$d"; BW+=(--bind "$repo/$d" "$repo/$d"); done   # callers: prefer binding single files (no shared dirs)
  return 0
}
