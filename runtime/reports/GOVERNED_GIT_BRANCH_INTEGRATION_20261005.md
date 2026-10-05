# Governed Git Branch Integration — Mission Report (2026-10-05)

Checkpoint-first. Truth Lock: HEAD 52e65c6 on `main`, worktree clean at start, ahead of origin by 2
(unpushed, as governed). Historical context read: SELF_DIAGNOSTIC_UPGRADE / AUTONOMOUS_CYCLE_INTEGRATION
/ ODG_DIAGNOSE_LIVE_RUN (2026-10-05) + MEMORY.md. One mission, reuse-first, additive. No commit/push.

## PRIORITY GAP — VERIFIED STILL ABSENT
`grep -r GOVERNED_GIT_BRANCH` → zero hits; no git-branch capability/engine anywhere. The gap was real
(52e65c6 is the self-diagnostic commit, NOT a git integration). Implemented its MINIMUM governed contract.

## FOUND (the real seam)
Objective → Capability → Execution → Evidence runs through ONE registry: `capability-executors.js`
`.resolve(patch)` → `executor.run()`, invoked by the real `patch-executor.js` `default` case, which
records `EXECUTED` + an evidence path; `validation-engine.js` then requires that evidence to exist.
Proofs are machine-verified by `capability-probes.js`; the Contract Factory declares a mission's proofs
from intent (`resolveVerifyProbes`). The C03 contract `state-transition.js` already models
STATE_before→ACTION→OBSERVED_EFFECT→STATE_after. The capability had to PLUG INTO these — not add any new
registry/executor/evidence/authority/policy system.

## FIXED (additive, in write-set)
- NEW `runtime/core/git-branch-integration.js` — governed FF engine. STATE_BEFORE→ACTION→OBSERVED→
  STATE_AFTER; local-only (git wrapper REFUSES `push`), fast-forward-only (ancestry verified), no merge
  commit (verified post-hoc via `^2`), worktree verified, target/source verified, protected-branch
  governed (`main|master|release|production` → HUMAN_APPROVAL_REQUIRED without
  `authorization.allow_protected`), dry-run HARD default (zero mutation), fail-closed, EXPECTED-vs-
  OBSERVED divergence → REJECTED. Builds + validates a C03 record with the EXISTING `state-transition.js`.
  Injectable git/cwd (real git, not mocks). FF on a checked-out target uses `merge --ff-only`; on a
  non-checked-out target `update-ref` with a CAS old-value guard.
- EDIT `capability-executors.js` — new "Governed Git Branch Integration" executor (objectiveId prefix
  `GIT_BRANCH_INTEGRATION`, placed first, disjoint), delegating to the engine, writing evidence; a live
  BLOCKED/HUMAN_APPROVAL writes honest evidence then throws → FAILED (never falsely done).
- EDIT `capability-probes.js` — probe `git-branch-integrated` (real INTEGRATED + pushed=false +
  merge_commit=false + C03 VALID + VERIFIED + observed==state_after; dry-run/no-op FAILS).
- EDIT `mission-contract-factory.js` — intent rule mapping branch-integration/fast-forward intent → the
  `git-branch-integrated` proof, completing NL→…→proof.
- NEW `runtime/core/git-branch-integration.test.js` — 43 assertions on REAL fixture repos.

## VERIFIED (actual evidence)
- New test: 43/43 on real git fixtures — dry-run, FF (checked-out + non-checked-out), already-up-to-date,
  non-fast-forward, dirty worktree, protected (with/without authority), push-absence (wrapper refusal),
  EXPECTED-vs-OBSERVED divergence (REJECTED), missing refs, full path through the real registry + probe,
  probe rejects a dry-run.
- REAL ODG PIPELINE E2E (isolated fixture repo): NL intent → `resolveVerifyProbes` → `git-branch-
  integrated`; a real `patch-plan.json` through the REAL `patch-executor.js` → `EXECUTED` + evidence;
  trunk actually fast-forwarded to feature tip; probe PASS; embedded C03 VALID + VERIFIED; pushed=false.
- Regression: full `runtime/core/*.test.js` 56/56 GREEN. Affected TS suites (phase0-c04-proof-binding,
  objective-proof-gate) GREEN. `tsc --noEmit` exit 0. `node --check` ok. `git diff --check` clean.
- `./runtime/bin/odg diagnose` on the real repo → NO_DIVERGENCE, exit 0. Real repo HEAD unchanged;
  no real branch touched (all git ran in throwaway fixtures).

## UNKNOWN-CAPABILITY HANDLING
A foreign objectiveId resolves to NO executor (`resolve()` → null) → RECORDED, never fabricated; an
unregistered proof → probe ok:false → mission blocked. No LLM declaration trusted; no Bash parser built.

## REPAIR / ROLLBACK
No real defect in the repo. One self-inflicted test-harness defect found + fixed during verification:
the e2e fixture lacked a `.gitignore`, so `runtime/generated/` artifacts dirtied the worktree and the
engine CORRECTLY BLOCKED — fixed the fixture to mirror the real repo's gitignore policy (engine behaviour
was right). No runtime rollback needed; rollback remains the existing build-recovery engine (unchanged).

## GOVERNANCE / SECURITY / NETWORK
No Master/Constitution/CTO/ROADMAP/policy/authority file touched. The capability GRANTS no authority —
protected/insufficient-authority → HUMAN_APPROVAL_REQUIRED. Zero network (push refused by construction),
zero external side effects. NOT COMMITTED, NOT PUSHED (awaiting human ACCEPT per protocol).

## STATE / NEXT
State = VERIFIED (not ACCEPTED). Write-set: the 5 files above only. ONE next authorized action:
human ACCEPT → commit the write-set (single engineering commit); push remains a separate human gate.
