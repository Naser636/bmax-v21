# Resident driver — L1 qualification dossier (V375 §5) — FOR OWNER DECISION, NOT ACTIVATED

> L0 stays the only operational level during this lot. This dossier presents evidence and risks; **activation is the owner's decision**. Nothing in this PR changes the driver, its unit or its level.

## 1. What L1 is (in code, not aspiration)
- Levels (`runtime/core/odg-resident-driver.ts`): `L0_OBSERVE`, `L1_SIMULATE`, `L2_CONTROLLED_LOCAL`, `L3_SENSITIVE`.
- `observe()` refuses every level except `L0_OBSERVE`; there is no self-promotion and no auto-escalation.
- An `L1_SIMULATE` contract exists. It is **declared** and built on an L0 observation, but it is not operational.
- Meaning of L1: SIMULATE the authorized work that L0 reports, i.e. plan it and dry-run it, still **without** executing missions or writing business state.

## 2. Evidence available today
| Item | Status | Evidence |
|---|---|---|
| Permissions actually available | user-systemd timer (no root); `PrivateNetwork=yes`, `RestrictAddressFamilies=AF_UNIX`, `NoNewPrivileges`; V364 hardening drop-in (`LockPersonality`, `RestrictNamespaces`, `MemoryMax=1G`, `CPUQuota=50%`, `TasksMax=128`) | `deploy/odg-resident-driver.service`, `deploy/odg-resident-driver.service.d/v364-hardening.conf`; real ticks `Result=success` |
| Authorized missions | L0 reports `nextEligible=CM-RADAR-GATE-CHAIN`; it executes nothing (`executedMission=false`, `writes=0` on every logged tick) | `runtime/logs/resident-driver-l0.log` |
| Isolation | no network; repo working directory; Truth Lock enforced (`ODG_TRUTH_LOCK_ENFORCE=1`) | unit file |
| Logging | one line per tick (level, state, workAvailable, nextEligible, writes, modifiedBusinessState, executedMission) | log file |
| Emergency stop | core honours `emergencyStopEngaged` (STOPPED, no observation). **Correction (Lot B):** the L0 tick never passed the signal; it now injects the canonical `ODG_SCHEDULER_STOP=1` (same as mission-scheduler), tested | `odg-resident-driver.ts:39-41`, `odg-resident-driver-tick.ts`, `odg-resident-driver-l1-sandbox.test.ts` |
| Drift detection | Truth Lock (branch / origin divergence / audit-chain integrity) at each tick; **V375 main-worktree guard** prevents the organizational drift that caused 1180 refusals | PR #860, `mission-attempt-log` |
| Resume tests | cross-session continuity proven earlier (V325–V326, #766/#767); interruption/recovery of the guard tested (#860) | merged tests |
| Independent results | L0 cycles independently inspected (V242/V244) | register / compass |

## 3. Gaps that block a recommendation to activate L1
1. ~~No L1 cycle run~~ **Lot B:** one L1 SIMULATE cycle ran on the real repository state inside a bubblewrap sandbox with a minimal read-only view (no host root, no /run ⇒ host Unix sockets such as the systemd user manager unreachable, checked by negative controls), no network: zero write, `wouldExecute=false`, `canTriggerL2=false`, stop honoured (`docs/odg/evidence/LOT_B_L1_SANDBOX_EVIDENCE.json`). **Still missing:** a cycle under the real systemd unit, and the unit's filesystem confinement (proposed in `deploy/odg-resident-driver.service.d/l1-fs-confinement.conf.proposed`, not installed).
2. **Mission reliability is NOT_MEASURED.** Only 3 executed attempts exist in `mission-attempt-log`, below n=20, so the value of simulating is unknown.
3. **Autonomy availability since 2026-11-08 is 0.58,** with every candidate SLO exhausted. The guard (#860) is installed, but its structural benefit still has to be **measured over a full window**.
4. **No configured SLO.** There is no target against which L1 could be judged, and choosing one is the owner's decision.

## 4. Risks and rollback
- **Risks.** L1 writes plans and simulation artefacts. The risk is mis-scoped writes: the user unit sets **no** filesystem restriction (no ProtectSystem/ReadWritePaths — the tick may rebuild runtime/dist), so the only limits are the write-set contention checks (`odg-writeset-contention`) and the closed-executor allowlist; a filesystem confinement would have to be added and tested before L1. Higher resource use is capped by the drop-in.
- **Rollback:**
  - set the level back to L0;
  - engage the emergency stop;
  - or disable the user timer.

  All three are owner actions on user-systemd and need no root.

## 4b. Filesystem confinement — V15 update
- **Host fact:** `kernel.apparmor_restrict_unprivileged_userns=1`. systemd `ProtectSystem`/`ProtectHome` in a USER unit need an unprivileged user namespace, which this restriction can deny. The earlier drop-in proposal is therefore fragile and is marked SUPERSEDED.
- **Replacement:** `scripts/odg-resident-driver-confined.sh` runs the normal launcher inside bubblewrap, which has its own AppArmor profile (`bwrap-userns-restrict`). It runs in two phases. First, outside the sandbox, the trusted launcher checks freshness and rebuilds if needed. Then the tick runs confined, where **only its own trace file** (`runtime/logs/resident-driver-l0.log`, bound alone; refused if it is a symlink) is writable. `runtime/dist`, the rest of `runtime/logs`, the sources, scripts and docs are read-only, so confined code can no longer plant JS that unconfined services (the mission runner, odg-run) execute, nor plant symlinks for other log writers. That closes an independent-inspection HIGH. There is no host root and no `/run`, so host Unix sockets are unreachable, and only loopback exists.
- **Tested end to end without systemd** (`runtime/core/odg-resident-driver-confined.test.ts`, throw-away copy):
  - rebuild, fresh-build and tsx-fallback paths;
  - stop signal;
  - source, `scripts/` and `docs/` writes refused;
  - sockets and network isolated.
- **npx:** the launcher fallback now calls the local `node_modules/.bin/tsx`. This removes by design the npx-cache dependency under a read-only HOME. It was a risk, not an observed failure: under bwrap HOME is a tmpfs, where npx also works.
- **Not tested:** the drop-in `deploy/odg-resident-driver.service.d/v15-confined-launcher.conf.proposed` under the real user unit. Installing it is a systemd change, outside this mandate; it is the owner's step.

- **Residual limits (inspection LOW).** The confined tick can still rewrite its own trace file, so `writes=0` lines are the driver's **self-report, not an attested record**. File size is capped inside the sandbox by `ulimit -f` (default 10 MiB). Attesting the trace (e.g. signed lines checked by an unconfined verifier) is open work.

## 4c. V15 — measured gate experiment and SLO recommendation
- **Experiment through the canonical gate** (`odg-gate-measured-evidence` + `runtime/bin/odg-gate-experiment-resident-confinement.ts`). All 12 conditions come from measurements; none is asserted.
  - RUN1, before merge, and RUN2, after merge on `45e46f3f`, both returned **RETURN_TO_EXPERIMENT, 10/12**.
  - Measured: 6 → 0 available attack surfaces; functional, stop and fallback paths; rollback; real repository unchanged; CI green.
  - Missing: `codeAndDepsReviewed` and `independentInspection`. These count **only** from an owner-anchored `INSPECTION_RECORD` signature (`TRUST_ANCHORS.json`, empty by design). The provider and its own inspection subagent cannot satisfy them, so the gate stays at RETURN until the owner signs.
  - Evidence: `docs/odg/evidence/V15_GATE_EXPERIMENT_RESIDENT_CONFINEMENT_RUN1.json` / `_RUN2.json`.
- **SLO recommendation** (`docs/odg/evidence/V15_SLO_RECOMMENDATION_EVIDENCE.json`; proposal `docs/odg/PROPOSAL_SLO_TARGETS_V15.json`, NOT applied).
  - Autonomy availability: **98% provisional**. After the fix, 54/54 ticks were available, but the Wilson lower bound is only 0.934 and supporting 98% needs ≥189 ticks. Re-decide after 14 days.
  - CI required check: **98%**. SLI 0.9837 over n=982, Wilson [0.9737, 0.9899].
  - Mission reliability: keep the CTO target of 0.95. It is NOT_MEASURED, with only 3 executed attempts.

## 4d. V15 closure — launcher hardening, trace integrity, attestation (2026-11-22)
- **Trace integrity (#868).** The confined tick has no writable host path. The trusted launcher appends the line, checks its format and stamps it with its own clock. The line *content* (e.g. `writes=0`) is still the tick's self-report, not an attestation.
- **Launcher hardening (#873).** All 7 findings of an independent escape audit are fixed, each with a test that fails before the fix and passes after; the confined launcher test passes 35/35. The fixes:
  - fds > 2 closed, stdin from `/dev/null`;
  - stderr bounded and sanitised;
  - tmpfs sized; root and `/dev` read-only;
  - `ulimit -n/-p`, plus `-v` on the precompiled path;
  - x86_64 seccomp filter denying memfd/SysV shm;
  - `timeout -k` with `pdeathsig`; `TIMEOUT` and `truncated=1` lines;
  - freshness covers the emitted dist `.js` and their resolved requires (drift detection, not tamper-proof).
  Independent re-inspection: ACCEPT.
- **Gate (#871).** Review and inspection count only from an owner-anchored record bound to the exact candidate commit and experiment. Anchors are read from `origin/main`, the measured code is `git archive <candidate>`, and replace objects and `GIT_*` are neutralised.
- **RUN4** on candidate `3a88de01`: `RETURN_TO_EXPERIMENT` 10/12. 7 probed surfaces 7 → 0. The only missing conditions are the owner review/inspection (`subjectCommit` not set by the owner).

**Remaining residual risks:**
- the tsx fallback has no virtual-memory cap (bounded only by the proposed `MemoryMax=`);
- the seccomp filter is x86_64-only;
- the bwrap ⇄ `RestrictAddressFamilies`/`PrivateNetwork` interaction under the real unit is NOT reproduced;
- a same-user unconfined writer can DoS the tick via `runtime/dist/package.json` (LOW);
- the local `origin/main` is provider-writable, so a local gate verdict is never the trust decision (owner re-verifies on own clone).

**Technical decision (provider's recommendation, owner decides): L1 stays NOT ACTIVATED.**
Grounds:
- (a) no owner-anchored review exists;
- (b) the proposed drop-in has never run under the real unit;
- (c) post-fix availability has < 1 day of data (64/65 slots, scheduled-slot SLI r2), short of the ≥ 14 days required;
- (d) mission reliability is NOT_MEASURED (1 pass, 2 policy-refused, n = 3 < 20).

**Refusal criteria (any one ⇒ do not activate):**
- an INVALID_TRACE or TIMEOUT line in the dry-run;
- any write outside the trace;
- availability Wilson low < the chosen SLO over 14 days;
- `odg-trust-anchor-audit --require-signed` not passing on the owner's clone.

**Owner dry-run procedure for the drop-in (isolated, user systemd, no root):**
1. copy the proposal to `~/.config/systemd/user/odg-resident-driver.service.d/`;
2. `systemctl --user daemon-reload`;
3. `systemctl --user start odg-resident-driver.service` once;
4. expect `Result=success` and exactly one new L0 line, not INVALID_TRACE/TIMEOUT;
5. roll back by deleting the file and running `daemon-reload`.

## 5. Recommendation
**Do not activate L1 yet.** First:
1. ~~run and independently inspect an L1 simulation cycle in a sandbox~~ (done, Lot B); owner installs and tests the proposed filesystem confinement on the user unit;
2. measure autonomy availability over ≥14 days with the guard installed;
3. let the owner choose an availability SLO.

Then present this dossier again with those three results.
