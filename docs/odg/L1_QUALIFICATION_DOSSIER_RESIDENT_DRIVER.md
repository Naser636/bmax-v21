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
1. ~~No L1 cycle run~~ **Lot B:** one L1 SIMULATE cycle ran on the real repository state inside a read-only, no-network bubblewrap sandbox: zero write, `wouldExecute=false`, `canTriggerL2=false`, stop honoured (`docs/odg/evidence/LOT_B_L1_SANDBOX_EVIDENCE.json`). **Still missing:** a cycle under the real systemd unit, and the unit's filesystem confinement (proposed in `deploy/odg-resident-driver.service.d/l1-fs-confinement.conf.proposed`, not installed).
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

## 5. Recommendation
**Do not activate L1 yet.** First:
1. ~~run and independently inspect an L1 simulation cycle in a sandbox~~ (done, Lot B); owner installs and tests the proposed filesystem confinement on the user unit;
2. measure autonomy availability over ≥14 days with the guard installed;
3. let the owner choose an availability SLO.

Then present this dossier again with those three results.
