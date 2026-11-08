# ODG Deployment Package — what is prepared, and the ONE human (root) action

> Prepared WITHOUT root (per the owner authorization + the environment's real limits). Everything that can be done in
> user space is here and runnable now; the single step that genuinely needs root is isolated and documented. Nothing
> here auto-installs, auto-exposes, or restarts an existing service.

## What runs NOW (user-space, no root, non-disruptive)
- **`deploy/odg-stage-and-verify.sh`** — builds the runtime + app, runs `odg verify` (build + typescript + contracts)
  and the runtime health smoke test, **without restarting any running service** (edg-core:8080, next:3000,
  ollama:11434 are left as-is). Exit 0 ⇔ staged + verified. Proven runnable 2026-11-08.
- **`deploy/odg-rollback.sh <git-ref>`** — checks out a known-good ref on a fresh `rollback/*` branch and re-stages;
  **no force-push, no `reset --hard`, no discard of untracked/stashed work**; `main` history untouched.

## Current live services (observed, preserved — NOT managed by this package)
| Service | Port | Bind | Note |
|---|---|---|---|
| edg-core (Docker) | 8080→80 | public | pre-existing; observed read-only, never mutated |
| next-server | 3000 | local | pre-existing app process |
| ollama | 11434 | local | model runtime |

## The ONE action that needs root (the single human step)
A new *managed, supervised* ODG service (survives reboot, auto-restart) needs systemd, which needs root. This agent's
environment **denies `sudo`** — a real limit, not a choice; it is not worked around.

**Owner, to go live as a managed service:**
1. Review + fill the placeholders in `deploy/odg.service.template` (`<DEPLOY_USER>`, `<REPO_ABS_PATH>`, a `<PORT>`
   that does NOT collide with 3000/8080/11434), and review the hardening directives.
2. `sudo cp deploy/odg.service.template /etc/systemd/system/odg.service`
3. `sudo systemctl daemon-reload && sudo systemctl enable --now odg.service`
4. Confirm: `systemctl status odg.service` and health on the chosen port.

Public exposure (a new port through the firewall / reverse proxy) is a **separate root/owner decision** and is out of
scope here — do not open a public port without a security review.

## Backups / preservation
- Code + history: git (every lot is a clean commit; `main` is branch-protected: require PR + CI, no force-push).
- Preserved work (never deleted by any script here): the untracked working set (≥404 files, recursive), 5 git stashes,
  and the `edg-core` container. `runtime/core/preservation-invariant.ts` verifies this read-only, fail-closed.
