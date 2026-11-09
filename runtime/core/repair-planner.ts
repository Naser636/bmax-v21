#!/usr/bin/env node
"use strict";

/*
 * V5 PHASE 3 / M-CH3-02 (RCE — Root-Cause Intelligence + Isolated Repair Workspace + Repair Planner, Program B). PURE,
 * deterministic. It does NOT reimplement defect classification, root-cause analysis, or write-set confinement
 * (anti-gas-factory) — it COMPOSES them into a safe repair PLAN:
 *   1. classify the defect kind                 (rce-signal-collector.classifyDefect)
 *   2. establish the ROOT CAUSE                  (rce-root-cause-intelligence.classifyCausalChain — layer + confidence +
 *                                                 reproduced + isolated; a symptom is never returned as root)
 *   3. bound an ISOLATED repair workspace        (repair-workflow.makeWriteSetGuard over the authorized write-set)
 * It refuses to plan a repair that is not root-caused (NEEDS_INVESTIGATION — never patch a symptom), and it REJECTS any
 * proposed change whose path escapes the authorized write-set (no silent scope expansion). Reproduce-before-modify and
 * rollback-ready are encoded in the ordered plan. It plans; it edits nothing and grants no authority. Dual export.
 */

const SIG = require("./rce-signal-collector");
const RC = require("./rce-root-cause-intelligence");
const RW = require("./repair-workflow");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const PLAN_STEPS = Object.freeze(["REPRODUCE", "ISOLATE_WORKSPACE", "CONFIRM_ROOT_CAUSE", "BOUNDED_EDIT", "ACCEPTANCE", "ROLLBACK_READY"]);

/**
 * planRepair({ signal, hypotheses, confidenceThreshold, symptom, allowedWriteSet, proposedChanges }) ->
 *   { plannable, verdict, defectKind, rootCause, workspace, steps, reasons }.
 * plannable only if a root cause is established AND the workspace is bounded AND no proposed change escapes it.
 */
function planRepair(input: any): any {
  const o = isObj(input) ? input : {};
  const defectKind = SIG.classifyDefect(isObj(o.signal) ? o.signal : {});
  const rc = RC.classifyCausalChain({ hypotheses: arr(o.hypotheses), confidenceThreshold: o.confidenceThreshold, symptom: o.symptom });

  const reasons: string[] = [];
  // (2) no root cause ⇒ refuse to plan a repair (never patch a symptom).
  if (rc.verdict !== "ROOT_CAUSE_IDENTIFIED" || !isObj(rc.rootCause)) {
    return Object.freeze({
      plannable: false, verdict: "NEEDS_INVESTIGATION", defectKind, rootCause: null,
      workspace: null, steps: Object.freeze([]),
      reasons: Object.freeze([`no established root cause (${rc.verdict}) — a symptom is never repaired directly; investigate further (fail-closed)`].concat(arr(rc.reasons))),
    });
  }

  // (3) bound the isolated workspace. An empty write-set cannot be isolated ⇒ not plannable.
  const writeSet = arr(o.allowedWriteSet).filter((p) => typeof p === "string" && p.length > 0);
  if (writeSet.length === 0) {
    return Object.freeze({
      plannable: false, verdict: "NO_WORKSPACE", defectKind, rootCause: rc.rootCause,
      workspace: null, steps: Object.freeze([]),
      reasons: Object.freeze(["root cause established but no authorized write-set — a repair workspace cannot be isolated (fail-closed)"]),
    });
  }
  const guard = RW.makeWriteSetGuard(writeSet);
  const proposed = arr(o.proposedChanges).map(String);
  const confined = proposed.filter((p) => guard(p));
  const rejected = proposed.filter((p) => !guard(p));
  if (rejected.length > 0) reasons.push(`${rejected.length} proposed change(s) escape the authorized write-set ⇒ REJECTED (no silent scope expansion): ${rejected.join(", ")}`);

  const plannable = rejected.length === 0;   // any escaping change blocks the plan (fail-closed)
  return Object.freeze({
    plannable,
    verdict: plannable ? "PLAN_READY" : "WRITE_SET_VIOLATION",
    defectKind,
    rootCause: Object.freeze({ id: rc.rootCause.id, layer: rc.rootCause.layer, confidence: rc.rootCause.confidence }),
    workspace: Object.freeze({ writeSet: Object.freeze(writeSet.slice()), confinedChanges: Object.freeze(confined), rejectedChanges: Object.freeze(rejected) }),
    steps: plannable ? PLAN_STEPS : Object.freeze([]),
    reasons: Object.freeze(plannable ? [`root cause '${rc.rootCause.id}' (layer ${rc.rootCause.layer}, confidence ${rc.rootCause.confidence}); ${confined.length} change(s) confined to the workspace; plan: ${PLAN_STEPS.join(" → ")}`] : reasons),
  });
}

const REPAIR_PLANNER_CONTRACT = Object.freeze({
  id: "V5-REPAIR-PLANNER",
  source: "ODG Master program PHASE-3 M-CH3-02 — RCE Root-Cause Intelligence + Isolated Repair Workspace + Repair Planner",
  steps: PLAN_STEPS,
  reuses: Object.freeze(["rce-signal-collector.classifyDefect", "rce-root-cause-intelligence.classifyCausalChain", "repair-workflow.makeWriteSetGuard — composes, reimplements nothing (anti-gas-factory)"]),
  notAuthority: "produces a bounded repair PLAN; it edits nothing, runs no repair, and grants no authority",
  invariants: Object.freeze([
    "a repair is planned ONLY if a ROOT CAUSE is established (layer + confidence + reproduced + isolated) — a symptom is never repaired directly (NEEDS_INVESTIGATION)",
    "the repair workspace is ISOLATED to the authorized write-set; an empty write-set ⇒ not plannable (NO_WORKSPACE)",
    "any proposed change whose path escapes the authorized write-set is REJECTED — no silent scope expansion (WRITE_SET_VIOLATION blocks the plan)",
    "the ordered plan encodes reproduce-before-modify and rollback-ready (REPRODUCE → ISOLATE_WORKSPACE → CONFIRM_ROOT_CAUSE → BOUNDED_EDIT → ACCEPTANCE → ROLLBACK_READY)",
    "pure/deterministic: signal + hypotheses + write-set in → plan out; it edits nothing; no clock/random/network; composes existing RCE pieces (no new engine)",
  ]),
});

module.exports = { PLAN_STEPS, planRepair, REPAIR_PLANNER_CONTRACT };

if (require.main === module) {
  const root = { id: "h1", evidence: { reproduces: true, isolated: true, corroborated: true, designDefect: true }, nodeId: "n1" };
  const good = planRepair({ signal: { kind: "LOGIC" }, hypotheses: [root], symptom: "wrong output", allowedWriteSet: ["runtime/core/"], proposedChanges: ["runtime/core/x.ts"] });
  const escape = planRepair({ signal: { kind: "LOGIC" }, hypotheses: [root], allowedWriteSet: ["runtime/core/"], proposedChanges: ["../etc/passwd"] });
  const noroot = planRepair({ signal: { kind: "LOGIC" }, hypotheses: [{ id: "weak", evidence: { reproduces: false } }], allowedWriteSet: ["runtime/core/"] });
  process.stdout.write(JSON.stringify({ ...REPAIR_PLANNER_CONTRACT, demo: { good: good.verdict, escape: escape.verdict, noroot: noroot.verdict } }, null, 2) + "\n");
}

export {};
