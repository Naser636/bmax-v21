# ODG Self-Diagnostic / Self-Repair Upgrade — Mission Report (2026-10-05)

Checkpoint-first. Primary context: auto-memory (MEMORY.md, ~60 entries) + RUNTIME_COMPLETION_CHECKPOINT.md.
One autonomous mission. Reuse-first, additive, read-only front seam. No governance change.

## FOUND (existing-capability map)
- EXISTS_AND_WORKS: health (`odg health`), state-transition C03 invariants (`state-transition.js`),
  evidence integrity (`validation-engine.js`), checkpoint/resume (`checkpoint-engine.js`),
  root-cause (`src/runtime/root-cause-engine.ts`), snapshots+rollback (`snapshot-engine.ts`),
  build-recovery loop (`build-recovery-engine.js`), acceptance gate (`mechanical-acceptance.js`),
  local-first autonomy (`local-autonomy.js`), fallback/persistent controllers, convergence (`odg converge`),
  capability execution+evidence (`capability-executors.js`), loop state store (`autonomy-store.js`).
- GENUINELY_MISSING: the FRONT of the cycle — expected-vs-observed divergence detection → first-class
  INCIDENT (discovering problems NOT listed beforehand). Only `scope-observer` existed; no divergence/
  incident/self-diagnostic module in `runtime/core`.

## FIXED (implemented this mission — additive, in-scope)
- NEW `runtime/core/self-diagnostic.js` — READ-ONLY observer. buildExpected(plan)/observe(generatedDir)/
  detectDivergences/hypothesize/raiseIncident/diagnose. Reuses `state-transition` (invariants + stable
  incident id via canonicalize) and `autonomy-store` (incident ledger + loop-protection → FROZEN at
  maxAttempts). Detects missing-output, contradictory-result, wrong-execution-order, missing/unexpected-
  permission, failed-invariant (C03), required-proof-unsatisfied (only when completion expected — a
  dry-run is NOT a divergence), regression vs baseline. Self-runs over live `runtime/generated`.
- NEW `runtime/core/self-diagnostic.test.js` — 16 assertions: every detection, clean=no-incident,
  deterministic reproduction (same divergence ⇒ same id), loop-protection freeze, hypotheses+checks.

## VERIFIED (actual evidence)
- self-diagnostic suite 16/16; full `runtime/core/*.test.js` 54/54 exit 0; `tsc --noEmit` exit 0;
  `git diff --check` clean.
- Real pipeline: `node runtime/core/self-diagnostic.js` over the live research dry-run artifacts →
  NO_DIVERGENCE (correct/honest: dry-run is not a fault).
- Autonomous-cycle abilities DEMONSTRATED by test/real-run: checkpoint→current-state (observe),
  divergence detection, incident creation, reproduction (stable id), distinguish causes (hypotheses +
  discriminating checks), loop protection (freeze), verified memory (incident ledger + this report +
  auto-memory), complete report.

## NOT VERIFIED (honest — designed/reused but not live-exercised this mission)
- A full LIVE autonomous code-repair → isolate(snapshot) → regression → rollback cycle was NOT executed
  end-to-end this mission (would require injecting a real fault into live state). The downstream engines
  are the EXISTING, already-tested mechanisms the seam routes to; their individual suites remain green.

## BLOCKED
- None. No protected authority/governance boundary was reached. (If a future repair needed one, the seam
  reports it as an incident, never self-grants it.)

## REMAINING
- Optional: wire `self-diagnostic.diagnose()` into a governed launcher (`odg diagnose`) — deferred to
  avoid touching the bash/launcher surface this mission.
- Optional: an end-to-end live fault-injection→repair→rollback demonstration under `snapshot-engine`.
- Prior mission's external-research executor + this seam are GREEN but UNCOMMITTED on main.

## GOVERNANCE / SECURITY
Read-only seam; grants no authority, bypasses no policy, weakens no gate; `state-transition.js` and
`autonomy-store.js` reused UNCHANGED. No Master/Constitution/CTO/ROADMAP/provider/pipeline/validation
file modified. Zero network, zero external side effects. Nothing committed.
