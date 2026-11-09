# V12.4 — Private Weekly Radar: ACTIVATED (CTO Directive V3 §3, 2026-11-09)

**Owner authorization V3 covers private-VPS scheduling activation.** The weekly Radar now runs on a **strictly-private
user-level systemd timer** — no sudo, no public port, no inbound access, no new secret, no privilege escalation, no
system-unit modification. Truth Lock `main @ 0541ca2`; preservation intact (5 stashes / 6 untracked).

## What was activated (least-privileged: USER timer, not system/sudo)

- **`~/.config/systemd/user/odg-radar-weekly.service`** (oneshot) runs `npx tsx runtime/bin/odg-frontier.ts`, appending
  to the private `runtime/logs/radar-weekly.log`. Templates committed at `deploy/odg-radar-weekly.{service,timer}.user`.
- **`~/.config/systemd/user/odg-radar-weekly.timer`** — `OnCalendar=weekly`, `Persistent=true`.
- Enabled via `systemctl --user enable --now` (uid 1000, **no sudo** — the user systemd instance is running).

## Why `odg-frontier` is safe to schedule unattended (verified)

`odg-frontier` drives the canonical Frontier chain `RADAR → ODG(integrate) → POLICY/AUTHORITY → campaign-controller →
LAB+EVOLUTION(sandbox) → EVIDENCE → DECISION`. It is **fail-closed** (no authorization ⇒ lot stays DEFERRED, chain not
traversed), emits a **PROMOTION_REVIEW** (`promoted:false` — it **never auto-promotes/auto-executes**), and does **no git
push / network / privilege**. A scheduled tick therefore *feeds* the improvement system (proposals + evidence) without
making unsupervised changes — exactly the §4 intent (a discovery becomes a governed proposal, never an auto-applied change).

## Proof (demonstrated)

- Manual run: exit 0, `chainTraversed:true`, `outcome:PROMOTION_REVIEW`, `promoted:false`, `evidencePresent:true`.
- **Timer-driven run** (`systemctl --user start odg-radar-weekly.service`): **Result=success, ExecMainStatus=0**; the
  private log captured the radar chain stages (RADAR→…→DECISION).
- Scheduled: `systemctl --user list-timers` ⇒ **next Mon 2026-11-16 00:00:00 UTC**, weekly; `is-enabled` ⇒ enabled.

## §7 honesty

The weekly execution is now **effectively scheduled and demonstrated** — not merely a document. ODG no longer claims a
weekly cycle that isn't programmed; it is programmed (private user timer) and proven to run.

## Rollback / disable (documented)

```
systemctl --user disable --now odg-radar-weekly.timer
rm ~/.config/systemd/user/odg-radar-weekly.{service,timer}
systemctl --user daemon-reload
```
Fully reversible; removes nothing else. No system units were installed or modified.

## Scope boundary

Strictly private (user session). It does **not** expose a port, publish, deploy publicly, spend, create secrets, or
escalate permissions. The separate **system-level** `campaign-runner-systemd-activation` (the mission-runner in `/etc`)
remains distinct and is not modified here (that needs sudo/owner — out of this user-timer scope).
