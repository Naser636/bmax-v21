# V15 — shared bubblewrap view for the resident driver (sourced, not executed).
# odg_confined_view <repo> [writable-subdir ...] → fills the global array BW with: all namespaces unshared (network:
# loopback only), cleared env, system dirs + node prefix + node_modules + repo READ-ONLY, the listed repo subdirs
# WRITABLE, private /tmp and /run (no host Unix socket: systemd user manager, D-Bus, ssh-agent).
# Memory bound (V15 hardening): every writable tmpfs is SIZE-CAPPED (bwrap --size, needs bubblewrap >= 0.10) —
# /tmp = ODG_CONFINED_TMP_MB MiB (default 64), /run and /dev/shm 1 MiB — and the sandbox root tmpfs and the /dev tmpfs
# (both unsized) are remounted READ-ONLY, so no RAM-backed write in the sandbox is unbounded.
odg_confined_view() {
  local repo="$1"; shift
  local node nm prefix d tmpmb
  tmpmb="${ODG_CONFINED_TMP_MB:-64}"; case "$tmpmb" in ''|*[!0-9]*) tmpmb=64 ;; esac; [ "${#tmpmb}" -gt 5 ] && tmpmb=64
  [ "$(( 10#$tmpmb ))" -lt 1 ] && tmpmb=64   # tmpfs size=0 would mean UNLIMITED
  node="$(readlink -f "$(command -v node)")"; nm="$(readlink -f "$repo/node_modules")"; prefix="$(dirname "$(dirname "$node")")"
  BW=(bwrap --unshare-all --die-with-parent --new-session --clearenv
      --setenv PATH /usr/local/bin:/usr/bin:/bin --setenv TMPDIR /tmp --setenv HOME /tmp
      --ro-bind /usr /usr --ro-bind /etc /etc --dev /dev --proc /proc
      --size $(( 10#$tmpmb * 1048576 )) --tmpfs /tmp --size 1048576 --tmpfs /run --size 1048576 --tmpfs /dev/shm)
  for d in /bin /lib /lib64 /sbin; do [ -e "$d" ] && BW+=(--ro-bind "$d" "$d"); done
  case "$prefix" in /usr|/usr/*|/) ;; *) BW+=(--ro-bind "$prefix" "$prefix") ;; esac
  BW+=(--ro-bind "$repo" "$repo")
  [ "${nm#"$repo"/}" = "$nm" ] && BW+=(--ro-bind "$nm" "$nm")
  for d in "$@"; do mkdir -p "$repo/$d"; BW+=(--bind "$repo/$d" "$repo/$d"); done   # callers: prefer binding single files (no shared dirs)
  BW+=(--remount-ro /dev --remount-ro /)   # last: after every mount point has been created in the (unsized) root tmpfs
  return 0
}
