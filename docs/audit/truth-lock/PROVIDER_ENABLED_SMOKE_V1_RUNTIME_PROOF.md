# Truth Lock — PROVIDER_ENABLED_SMOKE_V1 Runtime Execution Proof

**Truth Lock EVIDENCE RECORD of a live runtime observation, not a reconstruction.**
PROVIDER_ENABLED_SMOKE_V1 was executed once. No mission was re-executed to produce this record. The
ephemeral mission-ledger was NOT rewritten or recopied here. No evidence was invented. Every field is
a verbatim observation from the run. Applies PHASE_0_CARNET.md P0-CURRENT-045 (procedure) /
P0-CURRENT-046 (artifact location = `docs/audit/truth-lock/`; reviewer = human/CTO).

## 1. HEAD at execution
`e03a19768c30715a6efca523a97e33281826e93b` (e03a197) — unchanged before/after; no commit produced.

## 2. Canonical execution
`env -u ANTHROPIC_API_KEY runtime/bin/odg mission PROVIDER_ENABLED_SMOKE_V1`. Contract
`runtime/missions/PROVIDER_ENABLED_SMOKE_V1.json` (mode IMPLEMENT, requires_engineering=true,
authorized_paths ["src/app/provider-smoke/**"]). The old `ANTHROPIC_API_KEY` was removed for THIS
process only so Claude Code would use the claude.ai/Max subscription instead of the empty-credit API
path (no key/config/repo change; unset is ephemeral to the invocation).

## 3. Fresh full run
13/13 pipeline stages OK (Mission Interpreter → … → Patch Executor → Validation → Lifecycle → Ledger
→ Final Report). **exit 0.**

## 4. Objective
`PROVIDER_SMOKE_MARKER` → status **EXECUTED**, capability "Provider Activation", evidence
`runtime/generated/provider-activation.json` (non-empty).

## 5. Validation
`status=SUCCESS, validated=true, noRecordedNoOp=true, recordedNoOp=[], scopedChanges=[], unmet=[]`.
(engineeringOk satisfied by the pre-committed, tracked deliverable `src/app/provider-smoke/MARKER.md`
in authorized scope; no new change this run.)

## 6. A1 — verify labeling
`runtime-verify.json`: mission=PROVIDER_ENABLED_SMOKE_V1, generatedAt=2026-10-02T22:36:26.862Z
(fresh), consistent with mission-report. No stale relabel.

## 7. A2 — ledger idempotence
Ledger `896 → 897` (+1). Exactly one PROVIDER_ENABLED_SMOKE_V1 entry for
runId=2026-10-02T22:36:22.078Z (validated=true, state=ARCHIVED). Duplicate finalizer idempotently
skipped ("Recorded: SKIPPED").

## 8. RELEASE
`Status: PLAN_COMPLETE`, `Released: PROVIDER_ENABLED_SMOKE_V1`.

## 9. Provider — SELECTED, NOT executed (critical scope statement)
provider-activation.json: `decision=PROVIDER_SELECTED`, `selectedProvider=claude`, but
`execution.attempted=true`, **`execution.executed=false`, `execution.providerExecuted=false`**,
`classification=BLOCKED`. The objective was discharged by the "Provider Activation" capability
executor, which SELECTS/activates the provider WITHOUT a paid generation call; the LOCAL pipeline
then succeeded before any autonomy-route live generation. **No live Claude/Max generation call was
consumed in this run.**

## 10. Git / deliverable
HEAD unchanged, no commit, working tree clean. `src/app/provider-smoke/MARKER.md` pre-existing and
git-tracked. `scopedChanges=[]`; NO file written or deleted this run.

## 11. Connection-repair context
`claude auth status` (with ANTHROPIC_API_KEY unset) independently reported loggedIn=true,
authMethod=claude.ai, apiProvider=firstParty, subscriptionType=max. The Max connection is available;
removing the stale API key avoids the "Credit balance too low" path. This run did not need a paid
call, so it did not exercise it.

## 12. LIMITATION (no over-claim)
This record does NOT certify end-to-end LIVE Claude/Max provider generation (providerExecuted=false).
It certifies only the observed scope below.

## 13. VERDICT
**VERIFIED — PROVIDER_ENABLED_SMOKE_V1 canonical runtime execution + Provider Activation objective
evidence + RELEASE gate.** Explicitly NOT a certification of live provider generation.
