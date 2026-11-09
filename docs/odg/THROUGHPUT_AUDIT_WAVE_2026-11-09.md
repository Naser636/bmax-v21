# V12.4 — Engineering Throughput Intelligence: wave audit + multi-agent evaluation + checkpoint (2026-11-09)

**CTO Intelligent Engineering Acceleration V2 — §4/§6/§9/§10.** Real measurements only; no invented baseline; no promised
% gain. Reuses the existing instruments (gate-instrumentation, performance-observability, engineering-scheduler,
validation-selector, verified-result-cache, delivery-batch-coherence) — **no new scheduler** (§3 anti-concurrent-engine).

## §11B — the 28 missions are genuinely closed (verified, not assumed)

Manifest `master-technological-superiority-program.json`: **28 missions, all COMPLETED**, every one carries non-empty
`evidence`; **0 PROPOSED, 0 IN_PROGRESS, 0 VALIDATED** (nothing over-claimed — COMPLETED ≠ VALIDATED). The register's
3 IN_PROGRESS / 10 BLOCKED / 3 DEFERRED are the **separate owner-gated frontier** items (`broad-it-corpus-grow`,
`eleven-profession-program-definition`, `master-unified-campaign`, …), never claimed as manifest missions. The
`master-program-integration` test's old `PROPOSED ≥ 1` premise was therefore genuinely obsolete; it was fixed to the
canonical invariant (*every COMPLETED mission carries evidence*), strengthening — not weakening — the check.

## §4/§10 — measured bottleneck audit of this 6-mission wave (P50/P95)

| Stage | Measured | Note |
|---|---|---|
| **CI wall-clock per PR** | **P50 = 246 s, P95 ≈ 253 s** (n=7; range 197–253) | GitHub Actions "build+typecheck+parity+tests" — real runs #413–#419 |
| local FULL gate | ~190 s (383→388 suites) | run once pre-commit; ~95% tsx cold-start |
| per-suite tsx | 1.66–1.75 s | ~95% startup, not assertions |
| deliveries this wave | 7 PRs for 6 missions | the extra PR carried the honest test-fix |

**#1 bottleneck (confirmed, now with a distribution): the per-PR serial CI wait, P50 246 s / P95 253 s** — paid once
per delivery, blocking. 7 waits ≈ **1 720 s** of pure wait this wave.

## §11E/F — which improvement is justified by the measurement (and which is NOT)

- **Batching (delivery-batch-coherence, already shipped) did NOT apply this wave.** The 6 missions touch disjoint
  write-sets (memory-architecture, metier-baseline, security-control-plane, benchmark-contamination, repair-planner,
  throughput) — the tool correctly classifies them **MUST_SEPARATE** (grouping independent changes would add regression
  risk, §5). Honest: the lever exists but this wave had nothing coherent to batch.
- **The dev-loop lever (targeted-verify, already shipped) is the applicable one** and was used: FULL gate only at the
  certification point (pre-commit), targeted suites during iteration.
- **No NEW throughput module is justified by this wave's data.** CI is irreducible without skipping mandatory controls
  (forbidden, §8); the mission roster is complete, so there is no pending queue for a scheduler/critical-path planner to
  order. Building one now would be a speculative abstraction with no load to carry (anti-gas-factory, §3). The honest
  action is to **not** build it until a real multi-mission queue exists.

**Net:** the throughput system is already composed from existing primitives; the measured gain is the arithmetic
CI-wait reduction on *proven-coherent* lots (count, not %) — which future waves will realize when related missions queue
together.

## §6/§11G — multi-agent: honest evaluation (pilot DEFERRED under current governance)

The current restrictions (§12: **synchronous, visible, foreground only; no detached shell; no background agents; no
concurrent execution**) are incompatible with background/parallel subagents: the fork/Agent execution model runs work
in the background, which is exactly what is prohibited. **Therefore multi-agent parallelism stays DEFERRED and execution
remains sequential** — the governed guarantee ODG requires (synchronous, visible, awaited, controlled) cannot be met
while background execution is disallowed.

A future pilot would be admissible only with **all** of: one owner per task · non-overlapping file scopes · minimal
permissions · isolated modifications (worktree) · execution budget/limit · structured results · conflict control ·
independent validation · **merge only by ODG decision** · and **no agent may modify the Boussole, roadmap, permissions,
or canonical policies on its own initiative**. Until background execution is governed-permitted, none of these can be
satisfied, so sequential execution is retained (the honest, restriction-respecting choice).

## §9 — persistent checkpoint (resume without re-exploration)

```
mission:        M-CH3-02 repair-planner — DELIVERED (PR #419, merged)
wave:           V5 roster COMPLETE (28/28 COMPLETED) + 2 transversal CTO missions (Architecture audit, Throughput)
phase:          V12.4 — all manifest missions COMPLETED; frontier = owner-gated register items + COMPLETED→VALIDATED deepening
git:            origin/main @ d34d292 (this doc adds one more PR); branch excellence/v3-wave3-demonstrators-20261101
preservation:   5 stashes + 6 untracked + edg-core — INTACT (verified each merge)
gate:           test:report 388/388 PASS; campaign-controller 36/36; tsc clean
register:       346 items [330 ACCEPTED / 10 BLOCKED / 3 IN_PROGRESS / 3 DEFERRED], 0 ACCEPTED missing evidence
PRs this session: #413–#419 merged (7), all CI-green, FF-merged into main
next authorized: no PROPOSED manifest mission remains; continue = (a) owner-gated frontier needs owner action,
                 (b) COMPLETED→VALIDATED requires independent (separate-context) validation, or (c) a new CTO directive.
restrictions:   no VPS/SSH/sudo/systemd/deploy/secrets/paid; synchronous foreground only; no background/concurrent;
                npm auto-update warning = Claude Code CLI issue, UNRELATED to ODG — install perms NOT modified.
```

## Discipline

V12.4 single roadmap; Boussole single operational guide; ODG sole authority. Nine primitives, Truth Lock, 15 métiers,
permissions, evidence requirements intact. No assertion removed; no FLAKY/UNKNOWN/NOT_RUN presented as PASS; no speed
gain bought with a control. Speed comes from method (coherent lots when applicable + targeted dev loop), never from
fewer checks.
