# Truth Lock — M0000 Runtime Execution Proof

**This is a Truth Lock EVIDENCE RECORD of a live runtime observation, not a narrative
reconstruction.** M0000 was executed exactly once. No mission was re-executed to produce this
record. The ephemeral mission-ledger was NOT rewritten, reconstructed, or recopied here. No evidence
was invented. Every field below is a verbatim observation already produced by the runtime verify
pass. This record applies the procedure validated in PHASE_0_CARNET.md P0-CURRENT-045 (procedure)
and P0-CURRENT-046 (artifact location = `docs/audit/truth-lock/`; reviewer = human/CTO).

## 1. HEAD at execution
`a51c48cb98fee213099806fb62b23d75aa10d857` (a51c48c — "ODG: fix stale mission ledger labeling").

## 2. Mission
`M0000` (contract `runtime/missions/M0000.json`, mode = AUDIT, read-only, no authorized paths).

## 3. Canonical route used
`runtime/bin/odg mission M0000` → `src/runtime/mission-cli.ts`.
Runtime decision: *migrated local mission → LOCAL RUNTIME*
(`MissionOrchestrator → RuntimeExecutor`, src/runtime). No provider call, no `odg autonomy`,
no direct `odg-run`.

## 4. Execution timestamp
`2026-10-02T20:34:35.829Z` (UTC) — the `recordedAt` stamp of the single ledger entry this run
appended.

## 5. Exit code
`0`.

## 6. Runtime result (observed)
- Status: `LOCAL_COMPLETE`
- Logical steps: 9 — Technical steps: 14 — Capabilities: 14
- Validated: `true`
- Ledger line: "recordMission invoked via LOCAL route (proven-only gate applies)".

## 7. mission-report.json observed
`{ "mission": "M0000", "validated": true, "status": "SUCCESS" }`.

## 8. Ledger delta observed
Count `890 → 891` (delta = **+1**). Only the delta is recorded here; the ledger itself is NOT
reproduced (it is ephemeral — see §13).

## 9. New ledger entry observed (the single entry appended by this run)
```
recordedAt : 2026-10-02T20:34:35.829Z
mission    : M0000
proven     : true
validated  : true
state      : ARCHIVED   (lifecyclePath CREATED→QUALIFIED→ANALYZED→PLANNED→PREPARED→
                         VALIDATED→EXECUTED→VERIFIED→RELEASED→ARCHIVED, archived=true)
authorized : true
objectives : 0
strategy   : DETERMINISM_FIRST   constitutionVersion: 1   policyVersion: 1
```

## 10. No other mission newly registered
Entries appended by this run: exactly **1**, mission list `["M0000"]`. No non-M0000 entry was
appended (`any non-M0000 appended = false`).

## 11. Stale mission-plan.json — identity preserved
At execution time, `runtime/generated/mission-plan.json` on disk still belonged to a PRIOR mission
(`REFACTOR_MISSION_CONTRACT_FACTORY_TO_SEMANTIC_PLANNER`, 1 objective) because the LOCAL route does
not regenerate it. Despite that stale plan, the new ledger entry was labelled **mission = M0000**
and **objectives = 0** — i.e. the plan was correctly ignored for both identity and objective count.
This is the live confirmation of fix a51c48c: under the pre-patch code the entry would have been
mislabelled `REFACTOR_MISSION_CONTRACT_FACTORY_TO_SEMANTIC_PLANNER` with `objectives = 1`.

## 12. Fixes in force at execution
- `9b283c7` — migrated AUDIT ledger route fix.
- `a51c48c` — stale mission ledger labeling fix (identity from the authoritative `mission`
  argument; plan-derived fields gated on `plan.mission === mission`; proven-only gate unchanged).

## 13. Limitation — ephemeral ledger not used as durable proof
The Mission Ledger (`runtime/generated/mission-ledger.json`) is git-ignored and ephemeral; per
P0-CURRENT-045 it is INSUFFICIENT ALONE as durable proof. It is therefore NOT the durable evidence
here. THIS Git-tracked, verdict-bearing record is the durable artifact; it cites only the runtime's
observed delta and the single new entry, never the ledger as a standing proof.

## 14. Admissible prior references
- Documentary baseline `1c5d5ff` ("record M0000 architecture baseline").
- The fixes' own tests/proofs: `src/runtime/mission-ledger-label.test.ts` (4/4 PASS; stale plan ⇒
  entry = M0000 / objectives = 0; coherent plan ⇒ objectives = 3) committed in `a51c48c`; full
  `npm test` exit 0 and `next build` success at that HEAD.
- Prior Truth Lock record `docs/audit/truth-lock/TRUTH_LOCK_5_MISSIONS.md` (M0000 = UNKNOWN there,
  for lack of a tracked verdict-bearing source — the gap this record now closes for its stated scope).

## 15. VERDICT
**VERIFIED** — for the scope **"M0000 canonical runtime execution + ledger completion gate"**:
M0000 executed once by its canonical LOCAL route, exit 0, LOCAL_COMPLETE, validated=true, producing
exactly one proven/validated ledger entry correctly labelled M0000 (state ARCHIVED), with no other
mission registered and the stale plan correctly ignored for identity and objectives.

## 16. LIMITATION of this certification
This VERIFIED verdict does **NOT** mean the five documentary deliverables of M0000 were
semantically re-verified by the runtime. It certifies **only** the scope actually observed above
(canonical execution + ledger completion gate, identity correctness under a stale plan). It makes
**no** claim of a broader certification than that observed scope.
