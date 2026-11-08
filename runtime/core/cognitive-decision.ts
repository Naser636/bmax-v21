#!/usr/bin/env node
"use strict";

/*
 * WI-COG-28 — COGNITIVE DECISION LAYER (§2-§7). PURE, deterministic, READ-ONLY. This is where the cognitive
 * brain actually PARTICIPATES in a governed decision: it COMPOSES the shipped cognitive modules and each one
 * demonstrably INFLUENCES the output (not a no-op invocation):
 *   - World Model (situation) → snapshot of the situation;
 *   - Discovery Engine → prioritised OBJECTIVE (gaps/opportunities drive selection);
 *   - Causal Graph → IMPACT of a candidate change → the TEST PLAN (affected nodes become required tests);
 *   - Meta-Intelligence → integrity GATE over the evaluation (contamination/capture ⇒ REVIEW/BLOCK).
 * It PROPOSES and justifies; it grants itself NO authority and never bypasses POLICY/contracts. A simulation is
 * never promoted to an observation here. Fully traceable. Dual export.
 */

const WM = require("./world-model");
const DISC = require("./discovery-engine");
const CG = require("./causal-graph");
const META = require("./meta-intelligence");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** decide(situation) -> governed decision with full traceability. situation: { model, inventory, change?, evaluation? }. */
function decide(situation: any): any {
  const s = isObj(situation) ? situation : {};
  const model = isObj(s.model) ? s.model : WM.emptyModel();
  const rationale: string[] = [];

  // 1) WORLD MODEL — the situation (OBSERVED/PROVEN/SIMULATION typing preserved; no epistemic promotion here)
  const snap = WM.snapshot(model);

  // 2) DISCOVERY — gaps/opportunities drive the OBJECTIVE (influence: inventory changes ⇒ objective changes)
  const disc = DISC.discover({ inventory: Array.isArray(s.inventory) ? s.inventory : [] });
  const top = disc.findings.length ? disc.findings[0] : null;
  const objective = top ? Object.freeze({ kind: top.kind, subject: top.subject, verdict: top.verdict, priority: top.priority }) : null;
  rationale.push(objective ? `discovery → objective ${objective.kind}:${objective.subject} (priority ${objective.priority})` : "discovery → no objective (no gap/opportunity)");

  // 3) CAUSAL GRAPH — impact of the candidate change drives the TEST PLAN (influence: change/graph ⇒ plan changes)
  const changeNode = isObj(s.change) && typeof s.change.nodeId === "string" ? s.change.nodeId : null;
  const impact = changeNode ? CG.impactOf(model, changeNode) : [];
  const causes = changeNode ? CG.causesOf(model, changeNode) : [];
  const testPlan = Object.freeze([changeNode, ...impact].filter((x: any) => typeof x === "string").sort());
  const causalRisk = CG.hasCycle(model);
  rationale.push(changeNode ? `causal → change '${changeNode}' impacts [${impact.join(",")}] ⇒ test plan size ${testPlan.length}${causalRisk ? " (cycle risk)" : ""}` : "causal → no change proposed");

  // 4) META-INTELLIGENCE — integrity gate over the evaluation (influence: contamination/capture ⇒ gate)
  const integrity = META.assessIntegrity(isObj(s.evaluation) ? s.evaluation : {});
  const gate = integrity.overall === "DETECTED" ? "BLOCK" : integrity.overall === "SUSPECTED" ? "REVIEW" : (integrity.overall === "NONE" ? "ALLOW" : "ALLOW");
  rationale.push(`meta-intelligence → integrity ${integrity.overall} ⇒ gate ${gate}`);

  // DECISION — governed, read-only proposal (grants no authority)
  let decision;
  if (!objective) decision = "NO_OBJECTIVE";
  else if (gate === "BLOCK") decision = "BLOCKED_INTEGRITY";
  else if (causalRisk) decision = "PROCEED_WITH_CAUTION";
  else decision = gate === "REVIEW" ? "PROCEED_UNDER_REVIEW" : "PROCEED";

  return Object.freeze({
    decision,
    selectedObjective: objective,
    testPlan,
    causal: Object.freeze({ impact: Object.freeze(impact), causes: Object.freeze(causes), cycleRisk: causalRisk }),
    integrity: Object.freeze({ overall: integrity.overall, gate }),
    situation: snap,
    rationale: Object.freeze(rationale),
    notAuthority: "cognitive proposal only — grants no authority, bypasses no POLICY/contract",
  });
}

const COGNITIVE_DECISION_CONTRACT = Object.freeze({
  id: "WI-COG-28-COGNITIVE-DECISION",
  source: "FICHE §16/§19/§32 — cognitive brain participating in a governed decision (world-model + discovery + causal + meta-intelligence)",
  consumes: Object.freeze(["world-model", "discovery-engine", "causal-graph", "meta-intelligence"]),
  notAuthority: "read-only proposal; each cognitive input demonstrably influences the output; grants no authority; a simulation is never promoted to an observation",
  invariants: Object.freeze([
    "pure/deterministic: situation in → traceable decision out; no clock/random",
    "discovery drives the objective (inventory changes ⇒ objective changes)",
    "causal impact drives the test plan (change/graph changes ⇒ plan changes); analysis is read-only and recommends, never authorises",
    "meta-intelligence gates integrity: DETECTED ⇒ BLOCKED_INTEGRITY, SUSPECTED ⇒ PROCEED_UNDER_REVIEW (a suspicion is never a certain accusation)",
    "the decision is a PROPOSAL — no authority, no POLICY bypass; fully traceable via rationale",
  ]),
});

module.exports = { COGNITIVE_DECISION_CONTRACT, decide };

if (require.main === module) { process.stdout.write(JSON.stringify(COGNITIVE_DECISION_CONTRACT, null, 2) + "\n"); }

export {};
