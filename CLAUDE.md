@AGENTS.md

# Autonomous Work Protocol (execution interface)

This section is an **execution interface**, not a new source of governance. Authority
lives in the Master (FROZEN), the Runtime Constitution, the CTO Directives and
`runtime/governance/ROADMAP.json`. When this file and those disagree, those win.

Before doing any work in this repository, Claude Code MUST:

1. **Read `ODG_AUTONOMOUS_WORK_PROTOCOL.json`** (repository root) and follow it.
2. **Truth Lock** — verify HEAD, branch, worktree and origin against the protocol's
   `truth_lock` block. If reality diverges, STOP and ask the human.
3. **Select exactly one work item.** One active campaign, one active work item.
4. **Build its `WORK_ITEM_CONTRACT`** (objective, scope, write_set, authorized_symbols,
   invariants, acceptance_criteria, stop_conditions, rollback, evidence_required) and
   get it authorized (PROPOSED → AUTHORIZED) before executing.
5. **Reproduce before modifying**, and find the root cause before repairing.
6. **Never expand the write-set.** Touch only files in the authorized `write_set`;
   no silent scope expansion.
7. **Stop at critical gates.** No commit, no push, no irreversible action, and no change
   to any protected path (Master / Runtime Constitution / CTO Directives / ROADMAP.json /
   production / secrets / credentials / database / deployment / billing / external side
   effects / protected branches) without explicit human approval.
8. **Produce a structured report** (Truth Lock, contract, diff, verification, evidence,
   what is proven, what is not, next action).
9. **A green build is never sufficient proof.** Require build + test + regression +
   runtime verification plus the contract's `evidence_required`.
10. **Never certify beyond the proven scope.**

State ladder (see protocol for rules):
`PROPOSED → AUTHORIZED → EXECUTING → VERIFIED → ACCEPTED` (and `REJECTED`, `BLOCKED`,
`ROLLED_BACK`, `DEFERRED`). `PROPOSED ≠ AUTHORIZED`, `AUTHORIZED ≠ VERIFIED`,
`VERIFIED ≠ ACCEPTED`, `ACCEPTED ≠ RELEASED`.
