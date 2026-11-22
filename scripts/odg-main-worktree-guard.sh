#!/usr/bin/env bash
# ODG main-worktree guard installer (V375 Lot A). Repo-local only (.git/hooks of the given clone) — no system change.
#   bash scripts/odg-main-worktree-guard.sh install   [repo]   # copies .githooks/reference-transaction (backs up any existing hook)
#   bash scripts/odg-main-worktree-guard.sh status    [repo]   # installed? identical to the tracked source? main worktree on main?
#   bash scripts/odg-main-worktree-guard.sh audit     [repo]   # read-only: worktrees, orphans (prunable), branches, HEADs — never deletes
#   bash scripts/odg-main-worktree-guard.sh uninstall [repo]   # removes the hook, restores a backup if one exists (rollback)
set -euo pipefail
cmd="${1:-status}"; repo="${2:-$(git rev-parse --show-toplevel)}"
src="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.githooks/reference-transaction"
common="$(cd "$repo" && cd "$(git rev-parse --git-common-dir)" && pwd -P)"
dst="$common/hooks/reference-transaction"
case "$cmd" in
  install)
    [ -f "$src" ] || { echo "source hook missing: $src"; exit 2; }
    if [ -f "$dst" ] && ! cmp -s "$src" "$dst"; then cp -p "$dst" "$dst.bak-$(date -u +%Y%m%dT%H%M%SZ)"; echo "backed up existing hook"; fi
    install -m 0755 "$src" "$dst"; echo "installed: $dst" ;;
  status)
    if [ -f "$dst" ] && cmp -s "$src" "$dst"; then echo "guard: INSTALLED (identical to tracked source)"; elif [ -f "$dst" ]; then echo "guard: INSTALLED but DIFFERS from source"; else echo "guard: NOT INSTALLED"; fi
    echo "main worktree branch: $(git -C "$repo" branch --show-current || echo detached)" ;;
  audit)
    git -C "$repo" worktree list --porcelain | awk '/^worktree /{w=$2} /^HEAD /{h=substr($2,1,8)} /^branch /{b=$2} /^detached/{b="(detached)"} /^prunable/{p=" PRUNABLE(orphan)"} /^$/{print w" "h" "b p; w=h=b=p=""} END{if(w) print w" "h" "b p}'
    echo "(read-only: nothing pruned or deleted)" ;;
  uninstall)
    rm -f "$dst"; last="$(ls -1 "$dst".bak-* 2>/dev/null | tail -1 || true)"; [ -n "$last" ] && mv "$last" "$dst" && echo "restored backup $last"; echo "uninstalled" ;;
  *) echo "usage: $0 {install|status|audit|uninstall} [repo]"; exit 2 ;;
esac
