# ODG Diagnose — Live Run on the Real Repository (2026-10-05)

Mission: exercise the NEWLY built autonomous system (`./runtime/bin/odg diagnose`) on the real repo,
apply any SAFE real repair via existing mechanisms, else demonstrate the cycle in isolation. One bounded
pass. No new autonomy/repair/rollback/checkpoint/evidence/scheduler system. No commit/push.

## STATUS: GREEN — NO_DIVERGENCE on the real repo; full repair cycle demonstrated in isolation (real run).

## CHECKPOINT
Read SELF_DIAGNOSTIC_UPGRADE_20261005.md, AUTONOMOUS_CYCLE_INTEGRATION_20261005.md, MEMORY.md,
RUNTIME_COMPLETION_CHECKPOINT.md. Settled facts (self-diagnostic seam + cycle + reused engines) taken as
acquired; only the live behaviour was re-verified.

## INITIAL DIAGNOSIS (real ODG)
`./runtime/bin/odg diagnose` → exit 0. Mission ADD_GOVERNED_EXTERNAL_RESEARCH_EXECUTOR; 1 objective,
2 required proofs; observed EXTERNAL_RESEARCH_1 EXECUTED; Divergences: 0; Incident: none;
"NO_DIVERGENCE — system matches expected state."

## PROBLEMS FOUND
- None requiring repair. Bounded unlisted-problem search (§4) over CLI wiring / executable bits / static
  checks: every bin invoked as `./runtime/bin/odg-*.js` by the dispatcher IS executable. `odg-bootstrap.js`
  lacks +x but is NEVER invoked via `./` by the dispatcher ⇒ NOT a divergence vs expected ⇒ no repair
  invented (rule 6: do not fabricate a fault in the real repo).

## PROBLEMS REPAIRED: none (no real safe fault present).
## PROBLEMS BLOCKED / HUMAN_APPROVAL_REQUIRED: none reached.
## ROOT CAUSES: n/a (no incident).
## REPAIRS APPLIED (real repo): none.

## ISOLATED CYCLE DEMONSTRATION (real execution, runtime/core/self-diagnostic-cycle.test.js, 16/16)
- FAULT→DETECT→REPRODUCE→DIAGNOSE→REPAIR (local-fixers)→TEST→VERIFY; repair idempotent (no oscillation).
- ROLLBACK on an unsafe candidate via build-recovery-engine.recover(): file reverted BYTE-IDENTICAL,
  improved=false, typescript=false (red stays red), providerAuthorized=true (escalated, not promoted).
- PROTECTED divergences (unexpected/missing-permission, failed-invariant) → HUMAN_APPROVAL_REQUIRED.
- audit() bounded + PREPARE_NOT_APPLY; loop protection → incident FROZEN at maxAttempts ⇒ applyAllowed=false.

## TESTS AFTER REPAIR / VERIFICATION
- Full runtime/core/*.test.js: 55/55 exit 0.  tsc --noEmit: exit 0.  bash -n runtime/bin/odg: ok.
  node --check: ok.  git diff --check: clean.

## ROLLBACKS: 1, in the isolated demonstration (expected); none on the real repo.
## FINAL DIAGNOSIS: `./runtime/bin/odg diagnose` re-run → NO_DIVERGENCE, exit 0 (final state == expected).
## UNKNOWN-PROBLEM DISCOVERY: bounded; CLI-wiring/executable/static categories checked; nothing real+safe.
## LOOP PROTECTION: single bounded pass; freeze mechanism exercised in isolation.
## MEMORY/CHECKPOINT: this dated report + updated auto-memory (self-diagnostic-seam). Incident ledger
   path runtime/generated/autonomy/ (empty — no real incident).
## MASTER/CONSTITUTION: untouched. Reused engines (build-recovery, local-fixers, state-transition,
   autonomy-store) UNCHANGED.
## NETWORK/SIDE EFFECTS: none. ## UNAUTHORIZED CHANGES: none.

## NOT VERIFIED
- A live auto-repair applied to the real tree (none existed; live entry is PREPARE_NOT_APPLY). Repair +
  rollback proven on isolated fixtures via the real engines.

## REMAINING
- Optional governed "apply-live" flag for AUTO steps; optional CI/post-commit wiring of `odg diagnose`.
- Accumulated prior green-but-UNCOMMITTED work (research executor + self-diagnostic front + CLI).
- `odg-bootstrap.js` +x is cosmetic (not dispatcher-invoked via ./); left untouched (not a divergence).

## FILES CHANGED BY THIS RUN
- Tracked source/code: NONE. This pass only executed `odg diagnose` + tests (writing gitignored
  runtime/generated artifacts) and added this dated report. The modified/untracked files in `git status`
  are prior-mission work, not produced by this run.

## FINAL VERDICT: GREEN — the real ODG autonomous system was exercised on the real repo (odg diagnose,
NO_DIVERGENCE), the full detect→repair→test→verify→rollback cycle was really executed in isolation using
existing mechanisms only, governance intact, no parallel system created, honest about what ran.
