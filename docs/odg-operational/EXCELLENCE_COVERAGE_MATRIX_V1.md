# Excellence coverage matrix (AXE 1, V1 — 2026-10-27)

Where the permanent excellence rule is actually applied across ODG. The canonical, **executable** source of truth is
`runtime/core/excellence-coverage.ts` (gated: `excellence-coverage.test.ts`). The **shared enforcement boundary** is
`excellence-policy.requireExcellence` — reused by the scheduler and by capabilities (no duplicated logic). This doc is
honest: a family is COVERED only with a gated executable proof; everything else is listed as a gap. **No total-coverage
claim.**

| Component | Family | Crit. | Integration point | Consults engine | Executable evidence | Status |
|---|---|---|---|---|---|---|
| mission-scheduler | mission-execution | 5 | `schedulerStep → requireExcellence` (shared boundary) | yes | `mission-scheduler.test.ts` (Axis A, 9 assertions) | **COVERED** |
| odg-schedule-tick | mission-execution | 5 | injects `reviewExcellence` into the canary ctx (read-only) | yes | wired; covered by the scheduler contract | COVERED_VIA_BOUNDARY |
| regulatory-assurance | capability-self-review | 4 | `buildDossier → reviewForExcellence` (auto) | yes | `regulatory-assurance.test.ts` | **COVERED** |
| agent-governance (demo) | capability-self-review | 4 | `reviewForExcellence` on `autonomous-governance` | yes | `excellence-policy.test.ts` | **COVERED** |
| learning reuse (`excellence-gate.gateLearningReuse`) | learning | 3 | `gateLearningReuse → requireExcellence` + provenance + audit-log (effective-reuse proof) | yes | `excellence-gate.test.ts` (15) | **COVERED** |
| recovery (`excellence-gate.gateRecovery`) | recovery | 4 | `gateRecovery → requireExcellence` + evidence provenance + audit-log | yes | `excellence-gate.test.ts` (15) | **COVERED** |
| resolvers / capability-router | resolution | 3 | run as missions ⇒ scheduler boundary | no | — | NOT_COVERED (covered only when dispatched as a scheduled mission) |
| capability-executors | execution | 4 | governed by third-party-agent + authorizeExecution | no | — | NOT_COVERED (per-executor review = over-injection; candidate: executor-level self-review) |
| capability-learning (`reuseLearning`) | learning-legacy-integrated | 3 | `capability-learning.reuseLearning → excellence-gate` (real module API) | yes | `capability-learning.test.ts` (INTEGRATION, 6) | **COVERED** |
| checkpoint-engine (`begin` resume) | recovery-legacy-integrated | 4 | `checkpoint-engine.begin(opts.recovery) → gateRecovery` (real module API, opt-in) | yes | `checkpoint-engine.test.ts` (INTEGRATION recovery, 7) | **COVERED** |
| build-recovery / post-release-learning / router recall | learning-recovery-legacy | 3 | not yet routed through the gate | no | — | NOT_COVERED (capability-learning reuse + checkpoint-engine resume now integrated; these remain follow-ups) |

## Rule semantics (uniform, via `requireExcellence`)
- **Prohibited claim** (unproven superlative — "world #1"/"best"/"optimal" without a cited benchmark) ⇒ **admit:false**
  (fail-closed; the scheduler BLOCKS, no dispatch).
- **Stale / offline / INSUFFICIENT_EVIDENCE / open gaps** ⇒ **advisory, admit:true** (a safe mission is never blocked
  because reference search is offline) — unless `strict:true`.
- **Absent review / reviewer error** ⇒ advisory, non-blocking (strict blocks). No loop, no false success.

## Covered families (proven) vs uncovered (honest)
- **Covered:** `mission-execution`, `capability-self-review`, `learning`, `recovery`.
- **NOT covered (listed, not claimed):** resolution, execution (per-executor), and the learning/recovery LEGACY
  modules (not yet routed through `excellence-gate`). Each a candidate follow-up; covering them must use the shared
  boundary, not duplicate the rule, and avoid over-injection.

## Canonical-governance note
Future capabilities/missions SHOULD import the single boundary `excellence-policy.requireExcellence` (or go through the
scheduler, which already does) so they are evaluated automatically without a per-mission CTO reminder.
