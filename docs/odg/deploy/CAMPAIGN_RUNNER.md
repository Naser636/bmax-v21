# Campaign continuity runner — activation runbook (owner-gated systemd change)

**Status: PREPARED, NOT APPLIED.** The continuity software is complete and proven by tests:
- `runtime/core/campaign-loop.ts` (pure loop, suite 13) + `runtime/bin/odg-campaign-run.ts` (real entry point) +
  `runtime/bin/odg-campaign-run.test.ts` (**spawned-process integration**, suite 5: multi-mission, resume across
  process terminations, idempotent re-run, fail-closed NO_EXECUTOR).

What remains is an **operational** change (install a systemd unit + enable a timer on the VPS) — privileged, so
owner-gated. This runbook makes it reproducible, health-checked and reversible. It is **not applied autonomously**.

## The one remaining operational prerequisite

An **authorized executor** must be configured. By default `ODG_CAMPAIGN_EXECUTOR` is unset ⇒ the runner stops
`NO_EXECUTOR_AUTHORIZED` (it refuses to run a fictitious executor). Autonomously performing *engineering/governance*
lots requires a governed executor that is **deny-by-default** (the canary-dispatch allowlist is empty by design).
Until such an executor is authorized, the runner will honestly report `NO_EXECUTOR_AUTHORIZED` / `IDLE_BLOCKED`.

The shipped real executor `verification` runs genuine code-execution checks for lots that carry an `exec` verification
spec — suitable for a self-verification campaign, not for arbitrary engineering lots.

## Prepared unit (install only with owner authorization)

`/etc/systemd/system/odg-campaign.service` (template):
```
[Unit]
Description=ODG persistent campaign continuity runner
After=network.target

[Service]
Type=oneshot
User=ubuntu
WorkingDirectory=/home/ubuntu/bmax-v21
Environment=ODG_CAMPAIGN_EXECUTOR=none            # set to an AUTHORIZED executor before enabling
Environment=ODG_CAMPAIGN_MAX_ITER=200
ExecStart=/usr/bin/npx tsx runtime/bin/odg-campaign-run.ts docs/odg/closure-register.json
# checkpoint = the register file (persisted after each mission) ⇒ safe to re-run; idempotent.
```
`/etc/systemd/system/odg-campaign.timer` (template): fire every 10 min (`OnUnitInactiveSec=600`), `Persistent=true`.

## Activation (owner, sudo)
```
sudo install -m 0644 <template>.service /etc/systemd/system/odg-campaign.service
sudo install -m 0644 <template>.timer   /etc/systemd/system/odg-campaign.timer
# edit ODG_CAMPAIGN_EXECUTOR to an authorized executor first
sudo systemctl daemon-reload
sudo systemctl enable --now odg-campaign.timer
```

## Health check (after activation)
`systemctl status odg-campaign.service` → last run exit 0 with a structured stop reason; the register advances
(ACCEPTED count rises) across firings when admissible work + an authorized executor exist; otherwise it reports
`NO_EXECUTOR_AUTHORIZED` / `IDLE_BLOCKED` (healthy idle, not a crash).

## Rollback
```
sudo systemctl disable --now odg-campaign.timer
sudo rm -f /etc/systemd/system/odg-campaign.{service,timer}
sudo systemctl daemon-reload
```
The register is never mutated destructively by the runner (only governed state transitions with evidence); a bad run
leaves a resumable checkpoint. No data is deleted.

## Why not wired to the existing odg-mission-runner

`odg-mission-runner.timer` → `odg-schedule-tick` is the **deny-by-default canary dispatch** tick (exits non-zero when
nothing is dispatchable — by design). It is a different concern from campaign continuity. Replacing or augmenting it
is itself an owner decision; this runbook adds a **separate** campaign runner rather than silently repurposing the
canary tick.

## Minimal human action required

(1) authorize + configure an executor; (2) install the unit + enable the timer (sudo). Everything else — the loop, the
entry point, the resume/idempotence/fail-closed behaviour, and the integration tests — is complete and verified.
