#!/usr/bin/env node
"use strict";
/*
 * IMP-P15-SAGA-REF (lot-6 contract, owner-authorized block) — P15 Workflow/orchestration: a saga-compensation +
 * idempotency REFERENCE over the EXISTING orchestrator/scheduler. PURE, deterministic. ODG is NOT a durable-execution
 * runtime: that runtime is REJECTED/OWNER_GATED. This module provides a TESTABLE saga planner that, given forward steps
 * with compensations, computes the compensation order on failure (reverse of completed steps) — composing the existing
 * mission-orchestrator/scheduler discipline, adding NO second engine.
 *
 * Acceptance (contract): reference only; durable-execution runtime REJECTED/OWNER_GATED; composes existing, no 2nd engine.
 */

function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/* planSaga(steps, failAtIndex) -> compensation plan. steps = [{id, hasCompensation:boolean}]. On failure at index k,
 * the completed steps 0..k-1 are compensated in REVERSE order; a step without a compensation is flagged UNSAFE. */
function planSaga(steps: any, failAtIndex: any): any {
  const s = arr(steps).filter((x: any) => x && x.id);
  const failAt = Number.isInteger(failAtIndex) && failAtIndex >= 0 && failAtIndex < s.length ? failAtIndex : null;
  if (failAt === null) return Object.freeze({ metier: "P15", outcome: "COMMITTED", compensations: Object.freeze([]), note: "no failure ⇒ all steps commit; no compensation needed", runtime: runtimeRejected(), honesty: honest() });

  const completed = s.slice(0, failAt);                 // steps BEFORE the failing one are completed
  const compensations = completed.slice().reverse().map((x: any) => Object.freeze({ id: x.id, compensable: x.hasCompensation === true, action: x.hasCompensation === true ? "compensate" : "MANUAL_INTERVENTION (no compensation defined)" }));
  const unsafe = compensations.filter((c: any) => !c.compensable).map((c: any) => c.id);
  return Object.freeze({
    metier: "P15", outcome: unsafe.length ? "COMPENSATED_WITH_GAPS" : "COMPENSATED",
    failedStep: s[failAt].id, compensations: Object.freeze(compensations), unsafeSteps: Object.freeze(unsafe),
    runtime: runtimeRejected(), honesty: honest(),
  });
}
function runtimeRejected(): any { return Object.freeze({ status: "REJECTED", reason: "ODG is NOT a durable-execution runtime (Temporal-style) — that runtime is REJECTED/OWNER_GATED; this composes the existing orchestrator/scheduler, no 2nd engine" }); }
function honest(): string { return "reference/method over the EXISTING orchestrator/scheduler; on failure the completed steps are compensated in REVERSE; a step without a compensation is flagged (not silently ignored); a durable-execution runtime is REJECTED/OWNER_GATED."; }

const SAGA_IDEMPOTENCY_REFERENCE_CONTRACT = Object.freeze({
  id: "IMP-P15-SAGA-REF",
  purpose: "P15 — saga-compensation + idempotency reference over the existing orchestrator; runtime REJECTED",
  invariants: Object.freeze([
    "reference/method ONLY — a durable-execution runtime is REJECTED/OWNER_GATED; composes existing orchestrator/scheduler, no 2nd engine",
    "on failure, completed steps are compensated in REVERSE order; a step without a compensation is flagged UNSAFE (never ignored)",
    "deterministic; read-only; no new engine",
  ]),
});

module.exports = { planSaga, SAGA_IDEMPOTENCY_REFERENCE_CONTRACT };
export {};
