# V12.4 — V8 Closure: SSH Hardening (§1) + Campaign-Runner Canonical Proof (§2), 2026-11-09

## §1 — SSH:22 audit (P0) — key-only already in place; further hardening is sudo-gated

**Read-only audit (I must not sudo; never risk VPS access):**
- **`PasswordAuthentication no`** — ✅ the single most important hardening is **already in place**: key-only auth, **no
  password-bruteforce vector**. SSH:22 being public is the standard, acceptable VPS-access posture with key-only auth.
- `X11Forwarding yes` (minor; low risk headless); `PermitRootLogin`/`MaxAuthTries`/`AllowUsers` = defaults (modern Ubuntu
  `PermitRootLogin prohibit-password` = root key-only).
- `fail2ban`: not installed/active.
- `/etc/ssh/sshd_config` is **NOT writable by ubuntu** → **any hardening change requires root/sudo, which is DENIED**.

**Honest conclusion:** the critical control (no password auth) is active. The optional extras (disable X11Forwarding,
explicit `PermitRootLogin no`, lower `MaxAuthTries`, install `fail2ban`, IP allowlist) **require root/sudo** → **owner/
sudo-gated**. ODG did **not** touch SSH (can't without sudo, and per §1 never risk access / never close SSH blindly). An
IP allowlist is explicitly **not** applied (the real admin IP is unknown — applying one could lock out access).

## §2 — Campaign-runner: canonical activation PROVEN on `main` (no bypass)

**Demonstration (temporary main worktree, then removed; primary repo untouched):**
1. Synced the stale local `main` (`ec2b9d3`) to `origin/main` (`8e8d14a`) — a safe **forward-only** fast-forward (main
   not checked out in the primary worktree).
2. Worktree on `main`: **branch=main · HEAD==origin/main=YES · clean=YES** — all Truth-Lock repo-safety conditions met.
3. Built `runtime/dist`; ran the governed tick with an **empty allowlist**:
   **`[odg-schedule-tick] IDLE — no eligible pre-authorized PENDING mission (empty queue)` · exit 0 · 0 files modified.**

**Result:** the Truth-Lock gate **PASSED** on the canonical-safe main checkout (it did **not** refuse) and the tick is a
safe **IDLE** no-op — proving the runner is canonically activatable **without removing or bypassing the main-only
invariant**. In the primary repo (on the dev branch `excellence/…`) it correctly **refuses** (branch≠main). 

**Persistent activation** therefore requires the **deployed repo to track `main`** (HEAD==origin/main, clean) — an
**owner/operational** decision (point the VPS release at `main`); ODG does **not** switch the primary working repo (it
holds the active dev branch + the 6 preserved untracked items). No timer was force-activated on the dev branch (that
would just log STARTUP_REFUSED = an artificial success, forbidden). **The safety invariant was not touched.**

## §3/§4/§5 — reconciliation (no duplication)

- **§3 (13 owner decisions):** already individually classified in `CLOSURE_V7.1_…` (2 DÉJÀ SATISFAIT, 13 DÉCISION
  PROPRIÉTAIRE RÉELLE) and detailed 14-point in `OWNER_DECISION_DOSSIER_V2`. Re-verified: no new internal solution emerged
  (each needs real external input / a human decision; none self-clearable without fabricating data or bypassing a control).
- **§4 (native completeness):** covered by `SYSTEM_INTEGRATION_AUDIT` (352 capabilities, 0 cycles, components×métiers,
  Claude-dependency) + `capability-map` + the 15/15 parity. No orphan/incoherent contract found to fix.
- **§5 (deployment completeness):** `PRIVATE_VPS_DEPLOYMENT` + `VPS_SECURITY_CLOSURE` — ODG verified-operational, private
  (loopback), edg-core closed, radar timer active. No public port added.

**Net:** §1 and §2 are closed with proof (key-only SSH confirmed; runner proven on main, invariant intact). The residuals
are genuinely sudo-gated (SSH extras) or owner/operational (deploy-from-main; the 13 decisions).
