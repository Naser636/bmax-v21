#!/usr/bin/env node
"use strict";

/*
 * VALIDATION_ORCHESTRATOR v1 (§U Phase-1 #3) — a GENERIC, pure gate runner.
 *
 * It generalizes the discipline already proven in runMigrateTs (migrate-ts-cli.ts): a Truth-Lock pre-gate,
 * run DECLARED gates in order, STOP on the first FAIL/BLOCKED (remaining gates stay NOT-EXECUTED), and NEVER
 * record a DONE on a declaration / a skip / a non-PASS. It is an ORCHESTRATOR, not a verdict authority: each
 * gate's verdict is DELEGATED to the existing authority through the injected `seams.gate(name)` seam. It does
 * NOT merge or re-decide the distinct vocabularies of validation-engine (SUCCESS/BLOCKED/PARTIAL),
 * mechanical-acceptance (ACCEPT/REJECT/BLOCKED/UNKNOWN) or odg-verify (exit 0/1) — the caller's seam maps its
 * chosen authority's verdict onto one orchestrator status.
 *
 * REUSE: imports evaluateTruthLock / TruthLock / DEFAULT_TRUTH_LOCK_POLICY from migrate-ts-cli (side-effect-
 * free import — that module self-runs only under its isMain guard). migrate-ts-cli's GateStatus is a subset
 * (PASS|FAIL|BLOCKED|NOT RUN); the generic contract needs a SUPERSET with SKIPPED and the exact name
 * NOT-EXECUTED, so the orchestrator declares its own status union below. migrate-ts is UNCHANGED.
 *
 * HONESTY: the orchestrator reports ONLY what the gate seams return. It observes no side effects a gate's
 * authority does not report, and claims no effect coverage of its own.
 */

import { evaluateTruthLock, DEFAULT_TRUTH_LOCK_POLICY } from "./migrate-ts-cli";
import type { TruthLock, GitState, TruthLockPolicy } from "./migrate-ts-cli";

// The five DISTINCT generic states. SKIPPED = the authority declared the gate not applicable (never a PASS).
// NOT-EXECUTED = the gate was declared but never reached (stopped earlier) or its seam was never invoked.
export type OrchestratorStatus = "PASS" | "FAIL" | "BLOCKED" | "SKIPPED" | "NOT-EXECUTED";

export interface GateSpec {
  name: string;
  required?: boolean; // defaults to true; an optional gate's SKIPPED/non-PASS never blocks `ok`
}

export interface OrchestratorSpec {
  gates: GateSpec[];
}

export interface GateSeamResult {
  status: "PASS" | "FAIL" | "BLOCKED" | "SKIPPED"; // the DELEGATED verdict (mapped from the authority)
  detail: string; // provenance/reason carried verbatim from the authority
}

export interface OrchestratorSeams {
  // Delegates ONE gate's verdict to its existing authority. Never computed here.
  gate(name: string): GateSeamResult;
  // Optional Truth-Lock pre-gate: a refusal blocks the whole run fail-closed (exit 2, zero gates executed).
  truthLock?(): TruthLock;
  log?(msg: string): void;
}

export interface GateReport {
  gate: string;
  status: OrchestratorStatus;
  detail: string;
  required: boolean;
  declared: boolean; // always true here (every reported gate was declared in the spec)
  executed: boolean; // true iff the gate seam actually ran and returned a verdict (false ⇒ NOT-EXECUTED)
}

export interface OrchestratorResult {
  gates: GateReport[];
  truthLock: TruthLock | null;
  ok: boolean; // DONE iff every REQUIRED gate was EXECUTED and PASS — never on a declaration/skip/non-PASS
  exitCode: number; // 0 ok · 2 Truth-Lock refused or any gate BLOCKED · 1 otherwise (FAIL / required-SKIPPED / NOT-EXECUTED)
}

/**
 * runGates(spec, seams) — pure generic orchestrator. STOP on the first FAIL/BLOCKED; a SKIPPED does NOT stop
 * the sequence but NEVER satisfies a required gate. Remaining gates after a stop are NOT-EXECUTED.
 */
export function runGates(spec: OrchestratorSpec, seams: OrchestratorSeams): OrchestratorResult {
  const log = seams.log ?? (() => {});
  const gatesSpec = Array.isArray(spec && spec.gates) ? spec.gates : [];

  // Truth-Lock pre-gate (reuses evaluateTruthLock's contract via the injected seam). Refusal ⇒ fail-closed:
  // no gate is executed, every declared gate is NOT-EXECUTED, exit 2.
  let tl: TruthLock | null = null;
  if (typeof seams.truthLock === "function") {
    tl = seams.truthLock();
    log(`Truth Lock: HEAD=${tl.head} branch=${tl.branch} — ${tl.detail}`);
    if (!tl.ok) {
      log("BLOCKED: Truth Lock refused — fail-closed (no gate executed).");
      return {
        gates: gatesSpec.map((g) => ({ gate: g.name, status: "NOT-EXECUTED" as const, detail: "not executed — Truth Lock refused", required: g.required !== false, declared: true, executed: false })),
        truthLock: tl,
        ok: false,
        exitCode: 2,
      };
    }
  }

  const gates: GateReport[] = [];
  let stopped = false;
  for (const g of gatesSpec) {
    const required = g.required !== false;
    if (stopped) {
      gates.push({ gate: g.name, status: "NOT-EXECUTED", detail: "skipped after an earlier FAIL/BLOCKED (no false DONE)", required, declared: true, executed: false });
      continue;
    }
    const r = seams.gate(g.name);
    gates.push({ gate: g.name, status: r.status, detail: r.detail, required, declared: true, executed: true });
    log(`  ${r.status.padEnd(12)} ${g.name} — ${r.detail}`);
    if (r.status === "FAIL" || r.status === "BLOCKED") stopped = true; // stop-on-first; SKIPPED/PASS continue
  }

  // DONE only if EVERY declared gate was EXECUTED (none NOT-EXECUTED) AND every REQUIRED gate is PASS.
  // A required gate that is SKIPPED/FAIL/BLOCKED/NOT-EXECUTED ⇒ not ok. An optional SKIPPED is acceptable.
  const anyNotExecuted = gates.some((g) => !g.executed);
  const requiredOk = gates.every((g) => !g.required || g.status === "PASS");
  const ok = !anyNotExecuted && requiredOk && gates.length === gatesSpec.length;

  const anyBlocked = gates.some((g) => g.status === "BLOCKED");
  const exitCode = ok ? 0 : anyBlocked ? 2 : 1;
  return { gates, truthLock: tl, ok, exitCode };
}

// Convenience: build a Truth-Lock seam from observable git facts, reusing the shared pure policy.
export function truthLockFromState(s: GitState, policy: TruthLockPolicy = DEFAULT_TRUTH_LOCK_POLICY): TruthLock {
  return evaluateTruthLock(s, policy);
}

module.exports = { runGates, truthLockFromState };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
