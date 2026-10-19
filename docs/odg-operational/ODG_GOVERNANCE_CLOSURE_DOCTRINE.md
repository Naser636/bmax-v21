# ODG — Permanent Governance & Closure Doctrine

**Status:** standing CTO doctrine, applies to ALL ODG/BMAX missions, components, environments and future sessions.
**Authority rank:** SUBORDINATE operational restatement — it never overrides the Master (FROZEN), the Runtime
Constitution (`runtime/governance/constitution`), the CTO Directives (`runtime/governance/directives`), the canonical
`runtime/governance/ROADMAP.json`, or `ODG_AUTONOMOUS_WORK_PROTOCOL.json`. Where it and those disagree, THOSE win.
Recorded here (an unprotected operational doc) so it is discoverable and applied; the protected governance files are
NOT edited to hold it.

## Authority
The human CTO grants reserved authorizations. ODG orchestrates end-to-end, from analysis to a VERIFIED closure. An
authorization scoped to a perimeter permits action only in that perimeter and removes NO obligation of security,
backup, test, independent verification, or rollback.

## No shortcuts
No mandatory step may be omitted, merged so its proof is lost, bypassed, or implicitly declared successful.
Every failure triggers, in order: (1) preserve the failure evidence; (2) root-cause analysis; (3) bounded fix of that
cause; (4) re-run the affected check; (5) run the dependent checks; (6) independent verification; (7) documented
closure ONLY after the criteria are satisfied. A temporary workaround may protect the system but NEVER closes the
root-cause fix.

## Mandatory mission contract (seven controls)
Every mission defines and follows: 1 authority & authorized perimeter · 2 contract & acceptance criteria · 3 risks &
protections · 4 execution & its evidence · 5 independent verification · 6 recovery, rollback & learning · 7 closure &
compass update. A step that cannot run keeps an explicit `BLOCKED` or `NOT RUN` status with its cause and next action;
no later step may depend on an unsatisfied condition.

## Campaign continuity
ODG continues independent, authorized missions during a block, while keeping every unfinished dependency/step on the
roadmap. A block is neither erased nor allowed to needlessly halt other work.
No mission is `PROVEN` from a mere launch, a zero exit code, an available HTTP endpoint, or a provider's claim — the
contract's real criteria and required evidence MUST be met.

## Mandatory compass (`ODG_PROJECT_STATE.md`)
Obligatory entry/exit point of every mission.
- Entry: verified checkpoint, commit, repo state, objective, contract, authorization, risks, criteria, existing
  evidence, exact next action.
- Exit: real changes, tests & exit codes, independent evidence, criteria met/open, residual risks, available
  recovery, learnings, exact next action.
Automate the update where safe; verify the automation actually works and that a failure/interruption never leaves a
misleading state.

## Verifiable learning
Distinguish `CAPTURED → PERSISTED → DISCOVERABLE → REUSED → EFFECTIVE`. Do not claim REUSED/EFFECTIVE without proof of
real reuse.

## Truth rule
The only allowed states are demonstrated ones: `PASS`, `FAIL`, `BLOCKED`, `NOT RUN`, plus ODG's defined evidence
statuses. Never fabricate data, tests, missions, results, or percentages. Never erase a failure to obtain a
validation. Preserve failure evidence and use it to improve the system. A mission closes ONLY when its contract is
satisfied, required checks pass, data is protected, recovery is verified where needed, the compass is coherent, and
the next campaign action is explicit.
