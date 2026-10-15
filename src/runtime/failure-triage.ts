#!/usr/bin/env node
"use strict";

/*
 * FAILURE_TRIAGE_AND_BOUNDED_RECOVERY (§U Phase-1 #4) — a thin COMPOSITION, not an engine.
 *
 * `triage(input, seams)` drives the ORDERED flow — reproduce → evidence-backed root cause → repair plan →
 * CONDITIONAL apply → non-regression → checkpoint — through the reused generic orchestrator `runGates`
 * (V42). It computes NO business verdict and APPLIES nothing itself: every gate's verdict is DELEGATED to
 * its existing authority via an INJECTED seam (self-diagnostic for diagnosis/plan, root-cause-engine for the
 * typed cause, build-recovery-engine for the ONLY authorized apply+restore, checkpoint-engine for resume).
 * It creates no third canonical representation, grants no permission, and never touches the authority
 * boundary. Default is PREPARE_NOT_APPLY (the apply gate is SKIPPED). NOT wired into any live recovery loop.
 *
 * Invariants (enforced here, delegated where noted):
 *  - order fixed below; PREPARE_NOT_APPLY default (apply SKIPPED unless input.apply === true);
 *  - apply ONLY when explicitly requested AND the injected authorizeApply() allows (action-gate + scope)
 *    AND the plan is not FROZEN/over-scope; otherwise BLOCKED, zero apply;
 *  - an apply failure delegates rollback ONLY to the authorized restore() the apply seam returns, then
 *    BLOCKED with the risk surfaced (state preserved) — never git reset --hard / clean / any destructive op;
 *  - ambiguous/absent cause, FROZEN, insufficient evidence, or any non-PASS gate ⇒ NEVER repaired/DONE
 *    (runGates' no-false-DONE discipline);
 *  - HONESTY: triage reports only what the seams return; it claims no coverage of unobservable effects.
 */

import { runGates } from "./validation-orchestrator";
import type { GateSeamResult } from "./validation-orchestrator";

export type GateVerdict = "PASS" | "FAIL" | "BLOCKED" | "SKIPPED";
export interface SeamResult { status: GateVerdict; detail: string }

export interface TriageInput {
  apply?: boolean; // default false ⇒ PREPARE_NOT_APPLY
  cwd?: string; // injected explicitly for the scoped applier (build-recovery-engine resolves scope from cwd)
  authorizedPaths?: string[]; // the authorized write scope passed to authorizeApply (never widened here)
}

export interface PlanResult extends SeamResult { plan?: any; frozen?: boolean; applyAllowed?: boolean }
export interface CauseResult extends SeamResult { cause?: any; authority?: string }
export interface ApplyResult extends SeamResult { restore?: () => void }

export interface TriageSeams {
  reproduce(ctx: any): SeamResult; // delegate: run the failing repro; captures evidence in detail
  rootCause(ctx: any): CauseResult; // delegate to self-diagnostic / root-cause-engine; ambiguous/absent ⇒ BLOCKED
  planRepair(ctx: any): PlanResult; // delegate to self-diagnostic.planRepair; FROZEN/over-scope reflected
  authorizeApply(ctx: any): { allowed: boolean; reason: string }; // delegate to action-gate + scope check
  apply(ctx: any): ApplyResult; // delegate to build-recovery-engine.recover; returns the authorized restore()
  nonRegression(ctx: any): SeamResult; // delegate (e.g. runGates over suite/tsc/parity)
  checkpoint(ctx: any): SeamResult; // delegate to checkpoint-engine
  log?(msg: string): void;
}

export interface TriageResult {
  mode: "PREPARE_NOT_APPLY" | "APPLIED" | "BLOCKED";
  repaired: boolean; // true ONLY when apply was requested, authorized, executed AND non-regression PASSed
  ok: boolean; // runGates ok (every required gate EXECUTED + PASS)
  exitCode: number;
  gates: any[];
  cause: { authority: string | null; detail: string } | null;
  rollback: { performed: boolean; detail: string } | null; // set only if an apply failure triggered restore()
  risk: string | null;
}

const ORDER = ["reproduce", "root-cause", "plan-repair", "apply", "non-regression", "checkpoint"];

export function triage(input: TriageInput, seams: TriageSeams): TriageResult {
  const wantApply = input && input.apply === true;
  // Shared context threaded across the ordered gates (plan from plan-repair → apply; restore from apply).
  const ctx: any = { input: input || {}, cwd: (input && input.cwd) || process.cwd(), authorizedPaths: (input && input.authorizedPaths) || [] };
  const state: { cause: CauseResult | null; rollback: TriageResult["rollback"]; risk: string | null } = { cause: null, rollback: null, risk: null };

  const gate = (name: string): GateSeamResult => {
    switch (name) {
      case "reproduce":
        return seams.reproduce(ctx);
      case "root-cause": {
        const r = seams.rootCause(ctx);
        state.cause = r;
        ctx.cause = r.cause;
        // Ambiguous/absent cause is the authority's call; we only pass its verdict through (provenance kept).
        return { status: r.status, detail: `${r.detail}${r.authority ? ` [authority: ${r.authority}]` : ""}` };
      }
      case "plan-repair": {
        const r = seams.planRepair(ctx);
        ctx.plan = r.plan;
        ctx.frozen = r.frozen === true;
        ctx.applyAllowed = r.applyAllowed === true;
        return { status: r.status, detail: r.detail };
      }
      case "apply": {
        // DEFAULT PREPARE_NOT_APPLY: not requested ⇒ SKIPPED (never an apply, never a DONE).
        if (!wantApply) return { status: "SKIPPED", detail: "PREPARE_NOT_APPLY: apply not requested (default)" };
        // Requested ⇒ require plan authorization: not FROZEN/over-scope AND action-gate+scope allow.
        if (ctx.frozen) return { status: "BLOCKED", detail: "apply refused: incident FROZEN (loop protection) — escalate" };
        if (ctx.applyAllowed !== true) return { status: "BLOCKED", detail: "apply refused: plan not auto-applicable (over-scope / no auto step)" };
        const auth = seams.authorizeApply(ctx);
        if (!auth || auth.allowed !== true) return { status: "BLOCKED", detail: `apply refused: not authorized (${auth && auth.reason})` };
        // Authorized ⇒ delegate the apply to the ONLY authorized applier. On failure, delegate rollback to the
        // restore() it returns (never a destructive git op), preserve state, surface the risk, and BLOCK.
        const a = seams.apply(ctx);
        if (a.status !== "PASS") {
          let rolledBack = false, rbDetail = "no restore() provided by the applier — state NOT auto-reverted";
          if (typeof a.restore === "function") {
            try { a.restore(); rolledBack = true; rbDetail = "delegated rollback via the applier's authorized restore()"; }
            catch (e) { rbDetail = `restore() threw: ${(e as Error).message}`; }
          }
          state.rollback = { performed: rolledBack, detail: rbDetail };
          state.risk = `apply failed (${a.detail}); ${rbDetail}`;
          return { status: "BLOCKED", detail: `apply failed, rollback ${rolledBack ? "performed" : "NOT performed"} — ${a.detail}` };
        }
        return { status: "PASS", detail: a.detail };
      }
      case "non-regression":
        return seams.nonRegression(ctx);
      case "checkpoint":
        return seams.checkpoint(ctx);
      default:
        return { status: "BLOCKED", detail: `unknown gate ${name}` };
    }
  };

  const result = runGates(
    { gates: ORDER.map((name) => ({ name, required: true })) },
    { gate, log: seams.log },
  );

  const applyGate = result.gates.find((g: any) => g.gate === "apply");
  const mode: TriageResult["mode"] = !wantApply
    ? "PREPARE_NOT_APPLY"
    : result.ok && applyGate && applyGate.status === "PASS"
      ? "APPLIED"
      : "BLOCKED";
  const repaired = wantApply === true && result.ok === true && !!applyGate && applyGate.status === "PASS";

  return {
    mode,
    repaired,
    ok: result.ok,
    exitCode: result.exitCode,
    gates: result.gates,
    cause: state.cause ? { authority: state.cause.authority ?? null, detail: state.cause.detail } : null,
    rollback: state.rollback,
    risk: state.risk,
  };
}

module.exports = { triage };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
