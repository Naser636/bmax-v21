#!/usr/bin/env bash
# V242 — install/uninstall the ODG resident driver (L0 OBSERVE) as a user-systemd unit (root-free, linger-backed).
# NO sudo, NO privilege elevation, NO system units. Reversible. Usage:
#   scripts/odg-resident-driver-install.sh install     # install + enable + start the L0 timer
#   scripts/odg-resident-driver-install.sh uninstall   # disable + stop + remove the units (full rollback)
#   scripts/odg-resident-driver-install.sh status      # show unit + timer state (read-only)
#   scripts/odg-resident-driver-install.sh runonce      # start one L0 service cycle now (read-only)
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UDIR="${HOME}/.config/systemd/user"
SVC="odg-resident-driver.service"
TMR="odg-resident-driver.timer"

cmd="${1:-status}"
case "$cmd" in
  install)
    mkdir -p "$UDIR"
    # backup any pre-existing same-named units before overwrite (never clobber silently)
    for u in "$SVC" "$TMR"; do [ -f "$UDIR/$u" ] && cp -a "$UDIR/$u" "$UDIR/$u.bak.$(date -u +%Y%m%dT%H%M%SZ)" || true; done
    cp "$REPO/deploy/$SVC" "$UDIR/$SVC"
    cp "$REPO/deploy/$TMR" "$UDIR/$TMR"
    systemctl --user daemon-reload
    systemctl --user enable --now "$TMR"
    echo "installed + enabled $TMR (L0 OBSERVE, read-only). Rollback: $0 uninstall"
    ;;
  uninstall)
    systemctl --user disable --now "$TMR" 2>/dev/null || true
    systemctl --user stop "$SVC" 2>/dev/null || true
    rm -f "$UDIR/$SVC" "$UDIR/$TMR"
    systemctl --user daemon-reload
    echo "uninstalled $SVC + $TMR (units removed, daemon reloaded)"
    ;;
  runonce)
    systemctl --user start "$SVC"
    echo "started one L0 cycle ($SVC)"
    ;;
  status)
    systemctl --user list-timers --all 2>/dev/null | grep -i resident || echo "(timer not installed)"
    systemctl --user status "$SVC" --no-pager 2>/dev/null | head -12 || true
    ;;
  *) echo "usage: $0 {install|uninstall|runonce|status}"; exit 2 ;;
esac
