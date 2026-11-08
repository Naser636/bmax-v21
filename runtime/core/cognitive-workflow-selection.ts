#!/usr/bin/env node
"use strict";

/*
 * WI-A2-33 — COGNITIVE WORKFLOW SELECTION (§A2). PURE, deterministic. The cognitive brain (via cognitive-
 * objective-selection, under POLICY) selects WHICH authorised workflow P15 should run — then P15 (workflow-
 * engine) OWNS execution/approval/recovery. Cognition proposes/analyses; ODG decides under POLICY; P15 executes.
 * No second execution or governance engine. A refused/deferred/contaminated decision runs NO workflow. Reuses
 * cognitive-objective-selection + workflow-engine. Dual export.
 */

const SEL = require("./cognitive-objective-selection");
const WF = require("./workflow-engine");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
const SELECTED = Object.freeze(["SELECTED", "SELECTED_PENDING_REVIEW"]);

// default workflow for a selected objective: a governed analyze→plan→build→verify chain.
function defaultWorkflow(objSubject: string, requireApproval: boolean): any {
  return { id: "wf-" + objSubject, steps: [{ id: "analyze" }, { id: "plan", deps: ["analyze"] }, { id: "build", deps: ["plan"] }, { id: "verify", deps: ["build"], approval: requireApproval === true }], retries: 1 };
}

/** runCognitiveWorkflow(input) -> report. input: { situation, policy?, register?, workflows?:{kind:proc}, ctx? }. */
function runCognitiveWorkflow(input: any): any {
  const i = isObj(input) ? input : {};
  const sel = SEL.selectObjective({ situation: i.situation, policy: i.policy, register: i.register });
  if (!SELECTED.includes(sel.status)) {
    return Object.freeze({ selected: false, status: sel.status, cognitiveDecision: sel.cognitiveDecision, executed: false, reason: sel.reason });
  }
  const obj = sel.selected.objective;
  // ODG maps the authorised objective to an authorised workflow (from the registry, else the default)
  const registry = isObj(i.workflows) ? i.workflows : {};
  const proc = isObj(registry[obj.kind]) ? registry[obj.kind] : defaultWorkflow(obj.subject, !!sel.selected.requiresReview);
  // P15 OWNS execution (approvals/retries/recovery). Cognition does NOT execute.
  const run = WF.runProcess(proc, isObj(i.ctx) ? i.ctx : {});
  return Object.freeze({
    selected: true, status: sel.status, cognitiveDecision: sel.cognitiveDecision,
    workflow: proc.id, workflowStatus: run.status, requiresReview: !!sel.selected.requiresReview,
    executed: run.status === "COMPLETED", evidence: run.evidence || Object.freeze([]), pending: run.pending || null,
    notAuthority: "cognition selects; P15 (workflow-engine) executes under its own governance; no second engine",
  });
}

const COGNITIVE_WORKFLOW_SELECTION_CONTRACT = Object.freeze({
  id: "WI-A2-33-COGNITIVE-WORKFLOW-SELECTION",
  source: "§A2 — cognitive-decision selects authorised workflows for P15 (cognition proposes under POLICY, P15 executes)",
  notAuthority: "cognition selects workflows; P15 owns execution/approval/recovery; a refused/deferred decision runs no workflow; no duplication of P15",
  invariants: Object.freeze([
    "pure/deterministic governed outcome: situation+policy in → selected workflow + P15 run",
    "only SELECTED/SELECTED_PENDING_REVIEW run a workflow; REFUSED/DEFERRED/NONE ⇒ executed:false",
    "P15 keeps execution/approval/retry/recovery; cognition adds selection only (no second engine)",
    "review gate carried: a suspect decision ⇒ approval-gated workflow",
  ]),
});

module.exports = { COGNITIVE_WORKFLOW_SELECTION_CONTRACT, defaultWorkflow, runCognitiveWorkflow };

if (require.main === module) { process.stdout.write(JSON.stringify(COGNITIVE_WORKFLOW_SELECTION_CONTRACT, null, 2) + "\n"); }

export {};
