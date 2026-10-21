# ODG MISSION-RUNNER SERVICE — DESIGN & HOST-ACTIVATION PACKAGE (NOT installed)

> **Status: DESIGNED + ISOLATED-VALIDATED ONLY. Not installed, not active.** No host, systemd, permission,
> credential, or persistent-config change has been made. Any activation requires the reviewed package below
> plus explicit operational authorization. Truth Lock @ design: `main == origin/main`, clean, 5 stashes.

## Stage 1 — Dependency verdict (evidenced)
Ownership today: **scheduling** = `mission-scheduler.js` is a pure injected driver, **unwired** (no bin runs it);
**execution** = `odg mission` → `mission-cli.ts` → (migrated-local | provider-adapter | local-pipeline→`odg-run`),
invoked **manually**; **enforcement** = Truth-Lock at 6–7 process-scoped chokepoints (read `process.env`);
**recovery** = in-process `AutonomyRuntimeAdapter.recoverLocally` + release-level `odg-recover.service`.

**Verdict:** a persistent service is required **only for UNATTENDED** operation. **Attended/supervised**
scheduled execution is already satisfied by existing mechanisms (`odg autonomy` loop, `odg mission`, and the
proven supervised canary §8.7) — **no new service needed for supervised use**. For unattended use, the missing
piece is a *periodic driver process*; everything else (scheduler decisions, governed executor, enforcement,
recovery, dedup, audit, stop) already exists and is reused. **No second orchestrator / scheduler / ledger is
introduced.**

## Stage 2 — Bounded service design (least-privilege, fail-closed)
- **Shape:** a **systemd TIMER + oneshot** (NOT a long-running loop) — each tick is ONE bounded `runnerTick`
  (startup Truth-Lock precondition → one `schedulerStep` wired to the governed executor → exit). Bounded ticks
  are inherently stoppable and cannot run away. (A long-running `Type=simple` loop is the rejected alternative:
  larger blast radius, harder to bound.)
- **Identity:** `User=ubuntu` **non-root** (the repo + node are owned by `ubuntu`; no root needed to RUN — only
  to install the unit file). No new user required.
- **Executable / cwd:** `ExecStart=/usr/bin/node <repo>/runtime/dist/bin/odg-schedule-tick.js`;
  `WorkingDirectory=<repo>` (the one code artifact to ADD at activation — a thin bin composing the already-tested
  `runnerTick` contract; it introduces no new logic, only wires existing primitives + a read-only allowlist).
- **Minimal access (REVIEW-CORRECTED):** `ProtectSystem=strict` + **`ProtectHome=read-only`** +
  **`ReadWritePaths=<repo>`** (writes confined to the repo tree; the rest of `/home` + the system are read-only;
  node + node_modules remain readable). `NoNewPrivileges=true`; `PrivateTmp=true`; `CapabilityBoundingSet=`
  (empty); `IPAddressDeny=any` (no network). **Why `<repo>` not `<repo>/runtime/generated`:** a read-only
  mission's writes are confined to `runtime/generated` in the sandbox (service-contract B: git clean), but the
  real-repo verify step may touch build caches (`.next`, `node_modules/.cache`, `dist`) outside
  `runtime/generated` — confining to `runtime/generated` alone is NOT_MEASURABLE-sufficient without an empirical
  real-repo write-audit. `ReadWritePaths=<repo>` is the safe least-privilege choice that is provably compatible
  (the runtime writes within the repo); tightening to `runtime/generated` (+ enumerated cache paths) is a
  FOLLOW-UP hardening pending that write-audit.
- **Enforcement propagation:** `Environment=ODG_TRUTH_LOCK_ENFORCE=1` in the unit ⇒ scoped to the runner process
  and its `odg-run` child (propagation PROVEN in §8.7 / service-contract B). This is the **persistent-default
  scope** that §5 lacked — it lives on the runner unit ONLY, never global, never on the dashboard service.
- **Scheduler↔executor integration:** `runnerTick` = canonical `truthLockGate` (startup) + `schedulerStep`
  (eligibility/authz/dedup/bounds/stop) + `AutonomyRuntimeAdapter.runPipeline` (dispatch). No bypass path.
- **Allowlist / write-set:** INITIAL allowlist = **read-only mission classes ONLY** (empty write-set).
  Consequential missions are explicitly OUT until a separate decision widens the allowlist.
- **Limits:** scheduler policy `maxAttemptsPerMission`, `maxBudget`, `maxDurationMs`, `maxConsecutiveFailures`;
  timer `OnUnitActiveSec` (e.g. 15m) + `RuntimeMaxSec` per tick; concurrency = 1 (oneshot + timer, no overlap).
- **Credential/provider isolation:** no provider configured (`ODG_PROVIDER_LIVE` unset ⇒ fail-closed); read-only
  missions never call a provider; no credentials mounted.
- **Logging / evidence / health / stop:** audit via `recordAttempt` + `truth-lock.json` + `mission-report.json`
  under `runtime/generated`; health = last-tick audit; **stop** = `systemctl stop/disable` the timer OR
  `ODG_SCHEDULER_STOP=1` (honored every tick).
- **Startup fail-closed:** a tick REFUSES (STARTUP_REFUSED, no scheduling) on a non-conforming repo under
  enforce, on a missing governance input, or when stopped (service-contract A/D).
- **Recovery / dedup / rollback:** dedup via the ledger proven-gate (same-(mission,run) no-op); resume via
  checkpoint-engine; rollback = `systemctl disable --now` the timer + delete the unit (record-only restored,
  no repo change). `odg-recover.service` still guards the dashboard independently.

## Runner artifact (BUILT — gap closed)
- **Source:** `runtime/bin/odg-schedule-tick.ts` (the smallest bounded entry point; composes `truthLockGate` +
  `schedulerStep` + spawned governed `odg-run` + `mission-attempt-log` + ledger-derived dedup — no new
  orchestrator). **Allowlist is `ODG_CANARY_ALLOWLIST` (comma-separated, deny-by-default, EMPTY ⇒ safe no-op).**
- **Build:** added to `tsconfig.runtime-dist.json` include; `npm run build:runtime` emits
  **`runtime/dist/bin/odg-schedule-tick.js`** (the service `ExecStart` target). Verified present (5.3 KB).
- **Dispatch path:** spawns `node <corePort runtime/bin/odg-run.js>` (the real 13-stage governed pipeline),
  inheriting `ODG_TRUTH_LOCK_ENFORCE` so enforcement reaches the child; reads `mission-report.json` for the
  Validation-Engine verdict. No provider is constructed. Exit 0 = PASS/IDLE (safe); non-zero =
  STARTUP_REFUSED/STOPPED/BLOCKED/FAIL/NOT_MEASURABLE.
- **Note:** TS-canonical, compiled to dist (no `.js` rollback sibling — the `ExecStart` uses the dist output;
  its core deps resolve via the existing `corePort` dist-or-source fallback).

## Stage 3 — Isolated validation results (performed; no host change)
- `runtime/__bench__/odg-schedule-tick.e2e.test.ts` — **11/11 PASS** against the REAL built bin: (A)
  conforming+enforce+allowlisted read-only ⇒ PASS, mission ran through the governed pipeline, enforcement
  reached the child (truth-lock.json enforce=true), git clean; (B) non-conforming+enforce ⇒ STARTUP_REFUSED
  (exit 2) before dispatch; (C) empty allowlist ⇒ IDLE (safe default); (D) stop ⇒ STOPPED; (E) non-allowlisted
  mutating mission ⇒ not dispatched (deny-by-default); (F) dedup ⇒ re-tick IDLE.
- `runtime/__bench__/mission-runner-service-contract.e2e.test.ts` — **6/6 PASS**: (A) safe startup fail-closed on
  non-conforming+enforce; (B) bounded tick dispatches a read-only mission to the REAL executor with enforcement
  reaching the child + zero effect; (C) IDLE on a proven queue; (D) stop halts + enforcement rollback leaves no
  persistence. Composed ENTIRELY from existing primitives — no new production code, no systemd.
- Reuses the already-green `g6-scheduler-dryrun` (12/12), `g7-canary` (10/10), `g4-end-to-end-loop` (19/19).

## Stage 4 — EXACT host-activation package (for a LATER authorized change only)
1. **Files:** `runtime/bin/odg-schedule-tick.ts` + `runtime/dist/bin/odg-schedule-tick.js` are **already built
   and in-repo** (gap closed). The ONLY host files to add at activation: `/etc/systemd/system/
   odg-mission-runner.service` (oneshot) + `odg-mission-runner.timer` (Appendix A) — plus setting
   `ODG_CANARY_ALLOWLIST` to the reviewed read-only mission ids.
2. **Service definition / identity:** oneshot, `User=ubuntu`, `WorkingDirectory=<repo>`, hardening flags above,
   `Environment=ODG_TRUTH_LOCK_ENFORCE=1`; timer `OnBootSec`/`OnUnitActiveSec=15m`, `Persistent=false`.
3. **Permissions + justification:** root is required ONLY to write the two unit files + `daemon-reload` +
   enable the timer (standard systemd install). The service RUNS as non-root `ubuntu`. No other privilege.
4. **Pre-activation checks:** `git` in-sync + clean; `odg health` 200; `runtime/dist` built; the 3 isolated
   benches green; allowlist reviewed (read-only only).
5. **Activation + verification sequence:** install units → `daemon-reload` → `systemctl start
   odg-mission-runner.service` ONCE (manual tick) → verify `truth-lock.json enforce=true` + audit + zero
   consequential effect → only then `systemctl enable --now odg-mission-runner.timer`.
6. **Conforming vs non-conforming behavior:** conforming ⇒ read-only mission runs, verified, no effect;
   non-conforming ⇒ STARTUP_REFUSED (no scheduling), exit non-zero, audited.
7. **Stop / disable / rollback:** `systemctl disable --now odg-mission-runner.timer` + `systemctl stop
   odg-mission-runner.service` + remove the two unit files + `daemon-reload`. Record-only restored; no repo change.
8. **Recovery if startup/mission fails:** tick is fail-closed (no partial effect); `odg-recover.service`
   unaffected; a failed tick leaves an honest audit and exits — the next tick re-evaluates from canonical state.
9. **Acceptance criteria + evidence:** ≥1 real tick dispatches a read-only mission, verified SUCCESS, enforce=true
   in the child, zero commit/working-tree change, audit present, stop verified, rollback verified.
10. **Residual risks / required access:** needs root (one-time) to install/enable the units — the ONLY gated
    operational access. Widening the allowlist to consequential missions is a SEPARATE decision. Host reboot
    persistence (G8) remains a separate maintenance-window drill.

**This package is not executed. No unit exists, nothing is enabled.** Activation = this package + explicit
operational authorization for the one-time root install.

## Appendix A — EXACT literal unit files (for the one-time authorized root install; `<repo>`=/home/ubuntu/bmax-v21)
```ini
# /etc/systemd/system/odg-mission-runner.service
[Unit]
Description=ODG governed mission runner (one bounded tick; read-only allowlist)
After=network.target
# Fail-closed: do not start if the repo path is missing.
ConditionPathExists=/home/ubuntu/bmax-v21/runtime/dist/bin/odg-schedule-tick.js

[Service]
Type=oneshot
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/bmax-v21
Environment=ODG_TRUTH_LOCK_ENFORCE=1
Environment=NODE_ENV=production
# REVIEWED read-only canary allowlist (comma-separated mission ids). EMPTY ⇒ safe no-op (IDLE). Fill ONLY with
# reviewed read-only mission classes; widening to consequential missions is a separate CTO decision.
Environment=ODG_CANARY_ALLOWLIST=
ExecStart=/usr/bin/node /home/ubuntu/bmax-v21/runtime/dist/bin/odg-schedule-tick.js
TimeoutStartSec=600
# Hardening (least-privilege)
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/ubuntu/bmax-v21
PrivateTmp=true
CapabilityBoundingSet=
IPAddressDeny=any
# NOTE: no [Install] — the SERVICE is driven by the timer below, never enabled on its own.
```
```ini
# /etc/systemd/system/odg-mission-runner.timer
[Unit]
Description=ODG mission-runner periodic tick (bounded, read-only canary)

[Timer]
OnBootSec=10min
OnUnitActiveSec=15min
Persistent=false
Unit=odg-mission-runner.service

[Install]
WantedBy=timers.target
```
These are the DESIGN artifacts; **they are not installed**. The canary runs read-only missions only; widening
the allowlist (the `odg-schedule-tick.js` CANARY_ALLOWLIST) to consequential missions is a separate decision.

## Appendix B — FINAL HOST PREFLIGHT (read-only; NO host change) → verdict
**Truth Lock:** HEAD==origin/main @ `254ad65`, worktree clean, `254ad65` in canonical history, 5 stashes untouched. **PASS.**
**Non-root preflight:** dist artifact `runtime/dist/bin/odg-schedule-tick.js` present **PASS**; `odg health` runs **PASS**; `odg-schedule-tick.e2e` 11/11 **PASS** (current — bin unchanged since `254ad65`, not re-run per no-redundant-rerun). Repo still clean after checks **PASS**.
**Unit review (Appendix A):** ExecStart→the built dist bin **PASS**; `User=ubuntu` + `WorkingDirectory=<repo>` + node `/usr/bin/node` match host **PASS**; `Environment=ODG_TRUTH_LOCK_ENFORCE=1` propagates to the spawned `odg-run` child (proven: e2e A `truth-lock.json enforce=true`) **PASS**; clean stop (`ODG_SCHEDULER_STOP`/`systemctl`), fail-closed error exits, ledger dedup, append-only audit **PASS**; no provider constructed / no consequential effect **PASS**; `ProtectSystem=strict`+`ProtectHome=read-only`+`PrivateTmp=true`+`NoNewPrivileges=true`+`CapabilityBoundingSet=`+`IPAddressDeny=any` compatible with a read-only tick **PASS**; no name/port conflict with existing units (odg-preprod/fleet-bridge/odg-monitor/healthcheck/recover) **PASS**. **No new defect**; the one residual is the deliberately-broad `ReadWritePaths=<repo>` (NOT_MEASURABLE-to-tighten without a real-repo write-audit).
**Proposed allowlist (minimal; each proven read-only by CONTRACT, not name):** candidates `M0000 M0001 M0002 RUNTIME_SELF_AUDIT MEASURE_DEMO_CLEAN QUAL_CLEAN_GATEB` all = mode∈{AUDIT,READ_ONLY} · requires_engineering=false · authorized_paths=0 · verify∈{none, Clean Workspace(observational)}. **Recommendation:** first install with `ODG_CANARY_ALLOWLIST=` **EMPTY** (the runner ticks as a pure IDLE no-op → proves wiring/enforce/stop with ZERO mission execution); then, after one clean IDLE tick, set `ODG_CANARY_ALLOWLIST=M0001` (single, contract-proven read-only AUDIT) for the first real read-only tick. Do NOT add consequential missions (separate decision).
**Exact root commands (PROPOSED — NOT executed; for CTO approval):**
```
# 1. install units (root, one-time — the ONLY privileged step)
sudo install -m 0644 ./deploy/odg-mission-runner.service /etc/systemd/system/odg-mission-runner.service
sudo install -m 0644 ./deploy/odg-mission-runner.timer   /etc/systemd/system/odg-mission-runner.timer
sudo systemctl daemon-reload
# 2. first tick = pure IDLE no-op (ODG_CANARY_ALLOWLIST empty in the unit)
sudo systemctl start odg-mission-runner.service
systemctl status odg-mission-runner.service --no-pager      # expect: finished, exit 0, "[odg-schedule-tick] IDLE"
# 3. (after review) set the allowlist to M0001, daemon-reload, start once, verify
sudo sed -i 's/^Environment=ODG_CANARY_ALLOWLIST=.*/Environment=ODG_CANARY_ALLOWLIST=M0001/' /etc/systemd/system/odg-mission-runner.service
sudo systemctl daemon-reload && sudo systemctl start odg-mission-runner.service
node -e 'console.log(require("/home/ubuntu/bmax-v21/runtime/generated/truth-lock.json").enforce)'   # expect true
git -C /home/ubuntu/bmax-v21 status --porcelain             # expect empty
# 4. only after a clean verified tick: enable the timer
sudo systemctl enable --now odg-mission-runner.timer
```
**Rollback:** `sudo systemctl disable --now odg-mission-runner.timer; sudo systemctl stop odg-mission-runner.service; sudo rm -f /etc/systemd/system/odg-mission-runner.{service,timer}; sudo systemctl daemon-reload` (record-only restored; `odg-recover.service` unaffected; no repo/data change).
**VERDICT: READY_FOR_CTO_APPROVAL** — all preflight checks PASS; nothing installed/activated; only the one-time root install is gated.
