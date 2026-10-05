# ODG Autonomous Engineering Cycle — Integration Mission Report (2026-10-05)

Checkpoint-first (SELF_DIAGNOSTIC_UPGRADE_20261005.md + MEMORY.md as primary context). One mission.
Reuse-first: no second autonomy/repair/checkpoint/rollback/evidence/scheduler system created.

## FOUND
- Self-diagnostic FRONT existed (runtime/core/self-diagnostic.js) but had no CLI entry and no bounded
  orchestration linking it to the existing repair/rollback engines.
- Reusable repair = local-fixers.applyFixers (pure, idempotent). Reusable rollback = build-recovery-
  engine.recover() (snapshot + restore, rollback-guarded). No scheduler exists in runtime/bin.

## FIXED (additive, in-scope)
- `odg diagnose` entry point: NEW runtime/bin/odg-diagnose.js + a `diagnose)` case in runtime/bin/odg
  (same one-bin-per-case pattern; refresh state → audit; exit 0=no divergence, 1=incident → usable as a
  gate/post-event trigger; NO daemon, NO new scheduler).
- self-diagnostic.js extended: classifyRepairability (PROTECTED categories → HUMAN_APPROVAL_REQUIRED,
  never auto-applied), planRepair (bounds: maxRepairFiles/maxAttempts/singlePass; applyAllowed=false when
  FROZEN or over-scope), audit() = OBSERVE→DIAGNOSE→INCIDENT→PREPARE repair plan→RECORD (PREPARE_NOT_APPLY).
- NEW self-diagnostic-cycle.test.js (16 assertions) — demonstrates the whole cycle on ISOLATED synthetic
  faults, reusing the existing engines.

## VERIFIED (actual evidence)
- Cycle demo: FAULT→DETECT→REPRODUCE→DIAGNOSE→REPAIR(local-fixers)→TEST→VERIFY, idempotent (no oscillation).
- Rollback demo: build-recovery-engine.recover() on an unsafe candidate (constant injected typecheck) →
  engine's own restore reverts the file BYTE-IDENTICAL, improved=false, typescript=false (red stays red),
  providerAuthorized=true (escalated, not falsely promoted).
- Protected: unexpected-permission + failed-invariant → HUMAN_APPROVAL_REQUIRED (prepared, not applied).
- Loop protection: audit re-run trips FROZEN at maxAttempts ⇒ applyAllowed=false.
- Real pipeline: `./runtime/bin/odg diagnose` over live state → NO_DIVERGENCE, exit 0 (honest).
- Regression: full runtime/core/*.test.js 55/55 exit 0. Static: tsc --noEmit exit 0. git diff --check clean.

## NOT_VERIFIED
- A LIVE auto-repair applied to the real tree was deliberately NOT performed (no real fault present; the
  live audit entry point is PREPARE_NOT_APPLY by design). Repair/rollback proven on isolated fixtures via
  the real engines.

## BLOCKED / HUMAN_APPROVAL_REQUIRED
- None reached this mission. Protected divergences (permission/authority/invariant) are, by rule, routed
  to HUMAN_APPROVAL_REQUIRED and never auto-applied.

## REMAINING
- Optional: a governed flag to let `odg diagnose` APPLY an AUTO step live (snapshot→repair→regression→
  promote-or-rollback) — kept prepare-only here pending explicit authorization.
- Optional: wire `odg diagnose` to a post-commit/CI trigger (seam exists via exit code; not activated).
- Prior green-but-UNCOMMITTED work (external-research executor, self-diagnostic front) still uncommitted.

## GOVERNANCE / SECURITY
No new authority/scheduler/engine. Live audit is read-only + prepare-not-apply. Reused build-recovery,
local-fixers, state-transition, autonomy-store UNCHANGED. No Master/Constitution/CTO/ROADMAP/provider/
pipeline/validation file modified. Zero network, zero external side effects, no commit/push.
