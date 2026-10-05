# ODG STABILIZATION — 5 RC CAMPAIGN CLOSURE (ARCHIVE)

> **Nature of this document.** Campaign ARCHIVE record, **not** a new operational source of truth.
> It references the existing sources of truth (git commits, in-repo test files, generated artefacts)
> and introduces no new architecture, engine, capability or policy. The authoritative records remain
> the git history and the committed code/tests themselves.

## CAMPAIGN

- Campaign: `STABILIZE_ODG_ORCHESTRATION`
- Mode: controlled intervention (one work item at a time; PROPOSED -> AUTHORIZED -> EXECUTING ->
  VERIFIED -> ACCEPTED -> COMMITTED, each gate human-authorized)
- Branch: `worktree-stabilization+controlled-odg`
- Base: `7ccfcc2`
- Final HEAD: `7b38aba`
- Commit order (oldest -> newest): `f17c292` (RC-2) -> `39619d5` (RC-4) -> `fefb5cc` (RC-5) ->
  `099bb7b` (RC-1) -> `7b38aba` (RC-3)

All five root causes were taken from the read-only stabilization audit (causes #1..#8 of that audit map
onto these five fixes). Each RC changed only its authorized write-set; no file outside a write-set was
modified by that RC.

---

## RC-2 — prevent failed checkpoint resume (`f17c292`)

- **Root cause.** `runtime/core/checkpoint-engine.js` `begin()` treated a `FAILED` checkpoint as
  resumable (`resumable` excluded only `COMPLETE`), so a re-run skipped the `DONE` prefix of a failed
  run without re-proving it (`runtime/bin/odg-run.js:111/149`).
- **Correction.** Added `existing.status !== "FAILED"` to the `resumable` predicate; a FAILED checkpoint
  falls through to a clean fresh start (`resumeIndex 0`, all stages `PENDING`, new rollback anchor).
- **Write-set.** `runtime/core/checkpoint-engine.js`, `runtime/core/checkpoint-engine.test.js`.
- **Invariants/gates.** INTERRUPTED/COMPLETE/changed-stage-list behaviour unchanged; public surface and
  on-disk checkpoint format unchanged; `exit != 0 => FAILED` unchanged.
- **Tests.** `checkpoint-engine.test.js` — 18 assertions pass (13 pre-existing + 5 new FAILED case).
- **Proof.** `node --check` OK; diff confined to the two files.
- **NOT_PROVEN / limits.** No live pipeline reproduction (proven by deterministic unit test). Prevents
  RE-USING an unproven DONE prefix, not its creation (that is RC-1).

## RC-4 — align self-diagnostic with validation verdict (`39619d5`)

- **Root cause.** `runtime/core/self-diagnostic.js` classified only `EXECUTED`/`FAILED` (ignored
  `RECORDED`) and never read `mission-report.json`, so `odg diagnose` could report `NO_DIVERGENCE`
  while validation was `BLOCKED` (observed live in `runtime/reports/ODG_DIAGNOSE_LIVE_RUN_20261005.md`).
- **Correction.** Read-only consumption of the validation verdict (`observe()`), plus two additive
  divergence categories: `recorded-noop` (engineering only) and `validation-blocked`; HYPOTHESES +
  REPAIR_ROUTES added conservatively (always `HUMAN_APPROVAL_REQUIRED`, never AUTO).
- **Write-set.** `runtime/core/self-diagnostic.js`, `runtime/core/self-diagnostic.test.js`.
- **Invariants/gates.** `validation-engine.js` untouched; `PREPARE_NOT_APPLY` preserved; read-only AUDIT
  missions unaffected (no false positive); absent verdict adds nothing; `odg-diagnose.js` untouched.
- **Tests.** `self-diagnostic.test.js` — 29 assertions pass (16 pre-existing + 13 new).
- **Proof.** `node --check` OK; diff confined to the two files.
- **NOT_PROVEN / limits.** No live run; proven via injected/disk verdict fixtures.

## RC-5 — reconcile runtime health with validation verdict (`fefb5cc`)

- **Root cause.** `runtime/core/runtime-model.js` derived `queue/nextMission/lastMission` only from
  `mission-ledger.json` (governance) and never read `mission-report.json`, so Health and Diagnose
  presented disjoint truths.
- **Correction.** `runtime-model` exposes a read-only `lastRun` from `mission-report.json`; `odg-state`
  materialises it into the existing `runtime-state.json`; `odg-health` extracts a pure `render(artifacts)`
  behind `require.main` and ADDS a `Last Run` line + annotates Next Action with the verdict — without
  mutating `queue/provenSet/nextMission`.
- **Write-set.** `runtime/core/runtime-model.js`, `runtime/bin/odg-state.js`, `runtime/bin/odg-health.js`,
  `runtime/core/runtime-model.test.js`, `runtime/core/health-render.test.js` (new).
- **Invariants/gates.** No conflation (governance queue/ledger unchanged; decision: a SUCCESS lastRun
  never removes a mission from nextMission — only the ledger does; Health only annotates); `BLOCKED`
  shown verbatim; no new source of truth; `validation-engine.js` / `mission-ledger.js` untouched.
- **Tests.** `runtime-model.test.js` — 24 assertions pass (incl. SUCCESS/BLOCKED/absent + no-conflation);
  `health-render.test.js` — 12 assertions pass.
- **Proof.** Behaviour-preserving proven: HEAD vs patched `odg-health` produce byte-identical output on
  identical inputs when no verdict is present (mirror-tree comparison). Diff confined to the five files.
- **NOT_PROVEN / limits.** No live run; the `validation-blocked` signal only fires when
  `mission-report.json` exists.

## RC-1 — require stage output before checkpoint done (`099bb7b`)

- **Root cause.** `runtime/bin/odg-run.js` marked a stage `DONE` on subprocess `exit 0` alone (`:149`) —
  DONE meant "exited 0", not "effect exists".
- **Correction.** New pure helper `runtime/core/stage-effect.js` with a `STAGE_OUTPUTS` map (each entry
  verified against the stage that writes it); `odg-run.js` HALTs (`stageFailed` + exit) if a declared
  stage exits 0 without its artefact, before the OK log and `stageDone`.
- **Write-set.** `runtime/bin/odg-run.js`, `runtime/core/stage-effect.js` (new),
  `runtime/core/stage-effect.test.js` (new).
- **Invariants/gates.** Undeclared stages (ProjectContext Engine, Fleet Bridge, Final Report) keep
  `exit 0 => DONE` (no false FAILED); `exit != 0 => FAILED` unchanged; `checkpoint-engine.js` untouched
  (reuses existing `stageDone`/`stageFailed`).
- **Tests.** `stage-effect.test.js` — 10 assertions pass.
- **Proof.** Wiring proven by diff (gate placed after the failure block, before DONE); `node --check` OK.
- **NOT_PROVEN / limits.** This gate is ARTIFACT-EXISTENCE (catches "exit 0 but no output file"),
  complementary to validation's semantic gate; it does NOT catch a RECORDED no-op (the Patch Executor
  still writes its artefact for a no-op — that is validation's / RC-3's domain). `odg-run.js` not run
  live (pipeline execution out of scope); not made require-safe.

## RC-3 — make capability resolution misses explicit (`7b38aba`)

- **Root cause.** `runtime/core/capability-executors.js` `resolve()` returns null when no executor
  matches; `runtime/core/patch-executor.js` default branch then pushed `{status:"RECORDED"}` with NO
  reason — an opaque no-op.
- **Correction (fallback by design).** The status STAYS `"RECORDED"` on purpose — `validation-engine`
  `noRecordedNoOp` (line 77) and `self-diagnostic` `recorded-noop` (line 149) both key on that exact
  status and must keep firing; a rename to e.g. `"UNRESOLVED"` would silence both. For a write-scope
  (engineering) objective an explicit `reason` is attached; a read-only objective stays byte-identical.
- **Write-set.** `runtime/core/patch-executor.js`, `runtime/core/patch-executor.test.js` (new).
- **Invariants/gates.** Both no-op gates preserved (status unchanged); no success fabricated (never
  EXECUTED/APPLIED/DONE); fail-closed preserved; `validation-engine.js` / `self-diagnostic.js` /
  `capability-executors.js` untouched; the 3 intentional NUL bytes of `patch-executor.js` preserved
  (verified 3 before and 3 after the edit).
- **Tests.** `patch-executor.test.js` — 11 assertions pass (black-box: runs the real patch-executor and
  the real validation-engine), including end-to-end proof that validation STILL BLOCKS the engineering
  RECORDED via `noRecordedNoOp`.
- **NOT_PROVEN / limits.** No live AUTONOMY_E2E_LOOP reproduction; TS test
  `src/runtime/validation-engine-recorded-noop.test.ts` not runnable here (no `node_modules`/tsx).

---

## WHAT THIS CAMPAIGN PROVES

Established strictly by the committed deterministic tests and confined diffs above:

- A `FAILED` checkpoint no longer resumes by trusting an unproven `DONE` prefix (RC-2).
- `odg diagnose` can no longer report `NO_DIVERGENCE` while validation is `BLOCKED`, and a `RECORDED`
  engineering no-op is surfaced as a divergence (RC-4).
- The Health dashboard reflects the real last-run verdict without contradicting or conflating the
  governance queue/ledger (RC-5).
- A pipeline stage with a declared output is only `DONE` when that artefact exists and is non-empty
  (RC-1).
- A capability-resolution miss is explicit (reason) for write-scope objectives, while all existing no-op
  gates keep firing (RC-3).
- Preserved throughout: `validation-engine` `noRecordedNoOp` still blocks; no `FAILED`/`BLOCKED` was
  turned into `SUCCESS`; no new source of truth was introduced; the intentional NUL bytes were kept.
- Regression posture: all six RC proof suites green (18 + 29 + 24 + 12 + 10 + 11 assertions); the
  `runtime/core/*.test.js` node sweep is 59 pass / 1 fail, the single failure being the pre-existing
  environmental one below.

## WHAT THIS CAMPAIGN DOES NOT PROVE

- Live end-to-end behaviour of the full pipeline is NOT proven (no complete live run was executed).
- `AUTONOMY_E2E_LOOP` was NOT executed.
- Tests and build that depend on `tsc`/`tsx` are NOT executable in this worktree (`node_modules` absent;
  installation was out of scope).
- `runtime/core/build-recovery-engine.test.js` is a KNOWN pre-existing / environmental failure: it shells
  `npx tsc` / `npm run build`, impossible without `node_modules`; it fails identically on the base and is
  causally isolated from all five write-sets (it is NOT a regression of this campaign).
- No new capability or executor was created (RC-3 kept the honest, explicit BLOCK rather than
  implementing a new executor).
- `origin/main` remains `7ccfcc2` (unchanged). The stabilization branch was pushed to origin. No pull
  request was created. No merge was performed.

## CONVERGENCE CONCLUSION

**CONVERGED — for the proven scope of the five RC.**

Reservation (explicit): this does NOT constitute proof of full live convergence of the entire ODG
autonomy. It certifies only the five audited root causes, each VERIFIED by green deterministic tests
with confined write-sets and preserved gates, then ACCEPTED and COMMITTED on a clean working tree.

## NEXT PHASE — ECONOMIC DISCOVERY (documentary transition only — NOT STARTED)

The next phase is scoped here for continuity only and is **not launched by this document**. It will have
ODG perform a verifiable economic Internet research: real sources, concrete results, identified
opportunities, costs, potential revenue/margins, and genuine execution evidence — all under the existing
governed external-research seam and policy. Nothing of this phase is executed, authorized, or begun here.
