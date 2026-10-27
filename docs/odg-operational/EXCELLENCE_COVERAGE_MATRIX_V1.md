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
| resolvers / capability-router | resolution | 3 | run as missions ⇒ scheduler boundary | no | — | NOT_COVERED (covered only when dispatched as a scheduled mission) |
| capability-executors | execution | 4 | governed by third-party-agent + authorizeExecution | no | — | NOT_COVERED (per-executor review = over-injection; candidate: executor-level self-review) |
| learning registries | learning | 3 | — | no | — | NOT_COVERED (candidate lot) |
| recovery (checkpoint/build-recovery) | recovery | 4 | — | no | — | NOT_COVERED (candidate lot) |

## Rule semantics (uniform, via `requireExcellence`)
- **Prohibited claim** (unproven superlative — "world #1"/"best"/"optimal" without a cited benchmark) ⇒ **admit:false**
  (fail-closed; the scheduler BLOCKS, no dispatch).
- **Stale / offline / INSUFFICIENT_EVIDENCE / open gaps** ⇒ **advisory, admit:true** (a safe mission is never blocked
  because reference search is offline) — unless `strict:true`.
- **Absent review / reviewer error** ⇒ advisory, non-blocking (strict blocks). No loop, no false success.

## Covered families (proven) vs uncovered (honest)
- **Covered:** `mission-execution`, `capability-self-review`.
- **NOT covered (listed, not claimed):** resolution, execution (per-executor), learning, recovery — each a candidate
  future lot. Covering them must use the shared boundary, not duplicate the rule, and avoid over-injection.

## Canonical-governance note
Future capabilities/missions SHOULD import the single boundary `excellence-policy.requireExcellence` (or go through the
scheduler, which already does) so they are evaluated automatically without a per-mission CTO reminder.
