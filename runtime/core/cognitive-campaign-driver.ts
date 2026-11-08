#!/usr/bin/env node
"use strict";

/*
 * WI-A1-31 — COGNITIVE CAMPAIGN DRIVER (§A1). PURE, deterministic. The real consumer: ODG's cognitive objective
 * SELECTION (cognitive-objective-selection, which itself composes world-model/discovery/causal/meta under POLICY)
 * DRIVES the real campaign-loop. Flow: cognitive-decision proposes → ODG selects under POLICY → an authorised
 * objective becomes a canonical mission in a synthetic register → ODG's real campaign-loop executes+accepts+
 * checkpoints. A REFUSED/DEFERRED/NONE selection creates NO mission and executes NOTHING. Cognitive reasoning
 * demonstrably influences ODG's piloting; ODG remains the sole decider under POLICY. Reuses existing engines
 * (no duplication). Dual export.
 */

const SEL = require("./cognitive-objective-selection");
const LOOP = require("./campaign-loop");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const SELECTED_STATES = Object.freeze(["SELECTED", "SELECTED_PENDING_REVIEW"]);

/**
 * runCognitiveCampaign(input) -> report. input: { situation, policy?, register?, execute? }.
 * execute(lot) is the provider delegate (default: a SIMULATED deterministic accept). Returns the selection
 * outcome and, when authorised, the campaign-loop result (ODG executes the derived mission).
 */
function runCognitiveCampaign(input: any): any {
  const i = isObj(input) ? input : {};
  // 1) cognitive proposal + ODG decision UNDER POLICY (no execution here)
  const sel = SEL.selectObjective({ situation: i.situation, policy: i.policy, register: i.register });
  if (!SELECTED_STATES.includes(sel.status)) {
    return Object.freeze({ selected: false, status: sel.status, cognitiveDecision: sel.cognitiveDecision, executed: false, accepted: Object.freeze([]), reason: sel.reason });
  }
  // 2) the authorised objective becomes a canonical READY mission (ODG's mechanism), then ODG's loop runs it
  const mission = sel.selected;
  const register: any = { version: "cog-campaign/1", items: [{ id: mission.id, title: mission.objective.subject, status: "READY", deps: [], program: "COG", priority: mission.objective.priority, evidence: "" }] };
  const execute = typeof i.execute === "function" ? i.execute : ((lot: any) => ({ status: "ACCEPTED", evidence: "ev:" + lot.id, provider: "SIMULATED" }));
  const loop = LOOP.runCampaignLoop({ register, execute, maxIterations: 10, onPersist: () => {} });
  const accepted = (register.items || []).filter((it: any) => it.status === "ACCEPTED").map((it: any) => it.id);
  return Object.freeze({
    selected: true, status: sel.status, cognitiveDecision: sel.cognitiveDecision,
    mission: mission.id, requiresReview: !!mission.requiresReview,
    executed: accepted.length > 0, loopStopped: loop.stopped, accepted: Object.freeze(accepted),
    providerKind: "SIMULATED",
    notAuthority: "cognition proposes; ODG selects under POLICY; the campaign-loop (ODG) executes — cognition never self-authorises",
  });
}

const COGNITIVE_CAMPAIGN_DRIVER_CONTRACT = Object.freeze({
  id: "WI-A1-31-COGNITIVE-CAMPAIGN-DRIVER",
  source: "§A1 — cognitive objective selection drives ODG's real campaign-loop (cognition influences piloting, ODG decides under POLICY)",
  notAuthority: "the driver consumes the cognitive selection; a refused/deferred/none selection creates no mission and executes nothing; cognition grants no authority",
  invariants: Object.freeze([
    "pure/deterministic governed outcome: situation+policy in → selection + (if authorised) campaign-loop result",
    "only SELECTED/SELECTED_PENDING_REVIEW create a canonical mission run by ODG's real campaign-loop",
    "REFUSED_INTEGRITY/REFUSED_POLICY/DEFERRED_DEPENDENCY/NONE ⇒ no mission, executed:false (cognition's refusal halts piloting)",
    "cognitive reasoning demonstrably influences piloting (changing inputs changes the selected/executed objective)",
    "reuses cognitive-objective-selection + campaign-loop; no second engine; provider SIMULATED",
  ]),
});

module.exports = { COGNITIVE_CAMPAIGN_DRIVER_CONTRACT, runCognitiveCampaign };

if (require.main === module) { process.stdout.write(JSON.stringify(COGNITIVE_CAMPAIGN_DRIVER_CONTRACT, null, 2) + "\n"); }

export {};
