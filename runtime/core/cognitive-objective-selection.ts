#!/usr/bin/env node
"use strict";

/*
 * WI-COG-30 — COGNITIVE OBJECTIVE SELECTION (§2). PURE, deterministic. The real integration point: the cognitive
 * brain (cognitive-decision) PROPOSES and ANALYSES an objective; ODG then DECIDES under POLICY (priorities,
 * authorisation, dependency satisfaction). GOVERNANCE RULE: Discovery proposes, Cognitive Decision analyses,
 * ODG decides under POLICY — a cognitive component NEVER grants itself execution authority and never bypasses
 * POLICY/contracts. A refused/deferred decision triggers NO execution. Fully traceable. Reuses cognitive-decision
 * (no second decision engine). Dual export.
 */

const COG = require("./cognitive-decision");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

// depsSatisfied against a register: a required id must exist AND be ACCEPTED (mirrors campaign-controller).
function depAccepted(register: any, id: string): boolean {
  const items = isObj(register) ? arr(register.items) : [];
  const it = items.find((x: any) => isObj(x) && x.id === id);
  return !!(it && it.status === "ACCEPTED");
}

/**
 * selectObjective(input) -> governed selection. input: { situation:{model,inventory,change,evaluation},
 *   policy?:{ allowedKinds?, denyList?, requireDep? }, register? }.
 * status: SELECTED | SELECTED_PENDING_REVIEW | NONE | REFUSED_INTEGRITY | REFUSED_POLICY | DEFERRED_DEPENDENCY.
 */
function selectObjective(input: any): any {
  const i = isObj(input) ? input : {};
  const cog = COG.decide(isObj(i.situation) ? i.situation : {}); // cognitive PROPOSAL + analysis
  const policy = isObj(i.policy) ? i.policy : {};
  const trace: string[] = [...cog.rationale];

  // 1) no proposal
  if (cog.decision === "NO_OBJECTIVE" || !cog.selectedObjective) {
    return decision("NONE", null, cog, trace, "no cognitive objective proposed");
  }
  const obj = cog.selectedObjective;

  // 2) integrity gate (ODG refuses a contaminated signal — never executes on it)
  if (cog.decision === "BLOCKED_INTEGRITY") {
    trace.push("POLICY: integrity BLOCK ⇒ refuse (no execution on a contaminated signal)");
    return decision("REFUSED_INTEGRITY", null, cog, trace, "integrity gate blocked the proposal");
  }

  // 3) POLICY authorisation (ODG decides): allowedKinds / denyList
  if (Array.isArray(policy.allowedKinds) && !policy.allowedKinds.includes(obj.kind)) {
    trace.push(`POLICY: objective kind '${obj.kind}' not in allowedKinds ⇒ refuse`);
    return decision("REFUSED_POLICY", null, cog, trace, "objective kind not authorised by POLICY");
  }
  if (Array.isArray(policy.denyList) && policy.denyList.includes(obj.subject)) {
    trace.push(`POLICY: '${obj.subject}' is deny-listed ⇒ refuse`);
    return decision("REFUSED_POLICY", null, cog, trace, "objective subject is deny-listed");
  }

  // 4) dependency satisfaction (unknown/unsatisfied dependency degrades/defers the proposal)
  if (obj.kind === "unmet-dependency" && obj.verdict === "CONFIRMED") {
    trace.push(`POLICY: objective targets a CONFIRMED unmet dependency ⇒ defer until satisfied`);
    return decision("DEFERRED_DEPENDENCY", null, cog, trace, "an unmet dependency must be satisfied first");
  }
  if (typeof policy.requireDep === "string" && !depAccepted(i.register, policy.requireDep)) {
    trace.push(`POLICY: required dependency '${policy.requireDep}' is not ACCEPTED ⇒ defer`);
    return decision("DEFERRED_DEPENDENCY", null, cog, trace, `dependency '${policy.requireDep}' not ACCEPTED`);
  }

  // 5) ACCEPT under POLICY (review gate from cognition carried through) ⇒ traceable mission (no execution here)
  const review = cog.decision === "PROCEED_UNDER_REVIEW" || cog.causal.cycleRisk;
  const mission = Object.freeze({
    id: "obj-" + obj.subject, objective: obj, testPlan: cog.testPlan, authority: "ODG",
    requiresReview: review, rationale: Object.freeze(trace.slice()),
  });
  trace.push(review ? "POLICY: authorised but under REVIEW" : "POLICY: authorised ⇒ mission created (not executed)");
  return decision(review ? "SELECTED_PENDING_REVIEW" : "SELECTED", mission, cog, trace, "objective authorised by ODG under POLICY");
}

function decision(status: any, mission: any, cog: any, trace: any, reason: any): any {
  return Object.freeze({
    status, selected: mission, executed: false,
    cognitiveDecision: cog.decision, integrity: cog.integrity, reason,
    rationale: Object.freeze(trace),
    notAuthority: "cognitive proposes + analyses; ODG decides under POLICY; cognitive grants no authority and triggers no execution",
  });
}

const COGNITIVE_OBJECTIVE_SELECTION_CONTRACT = Object.freeze({
  id: "WI-COG-30-COGNITIVE-OBJECTIVE-SELECTION",
  source: "§2 — cognitive-decision proposals feed ODG objective selection UNDER POLICY (Discovery proposes, Cognitive analyses, ODG decides)",
  notAuthority: "the cognitive brain proposes/analyses only; ODG authorises under POLICY; no self-authorisation; a refused/deferred decision executes nothing",
  invariants: Object.freeze([
    "pure/deterministic: situation + policy + register in → governed selection out; executed is ALWAYS false (selection, not execution)",
    "changing the inventory changes the proposal; changing POLICY changes the authorised selection",
    "a CONFIRMED unmet dependency (or an unsatisfied requireDep) ⇒ DEFERRED_DEPENDENCY (no execution)",
    "a contaminated signal ⇒ REFUSED_INTEGRITY; a suspect signal ⇒ SELECTED_PENDING_REVIEW (never a certain accusation)",
    "an unauthorised proposal ⇒ REFUSED_POLICY; an accepted one ⇒ a traceable mission (not executed here); no cognitive self-authorisation",
  ]),
});

module.exports = { COGNITIVE_OBJECTIVE_SELECTION_CONTRACT, selectObjective };

if (require.main === module) { process.stdout.write(JSON.stringify(COGNITIVE_OBJECTIVE_SELECTION_CONTRACT, null, 2) + "\n"); }

export {};
