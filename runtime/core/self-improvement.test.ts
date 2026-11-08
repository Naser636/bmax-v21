#!/usr/bin/env node
"use strict";
const assert = require("assert");
const SI = require("./self-improvement");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §34-§37 — SELF-IMPROVEMENT (E2E completeness + scenarios)");

const allModules = ["frontier-radar", "evolution-loop", "frontier-lab", "frontier-sandbox", "meta-intelligence", "improvement-baseline", "canary-decision-pack", "compounding-loop"];
// COMPLETENESS GATE.
{
  const c = SI.assessCompleteness(allModules);
  check(c.complete === true && c.missing.length === 0 && c.requiredStages === SI.REQUIRED_STAGES.length, "completeness gate: all stage modules present ⇒ complete");
  const partial = SI.assessCompleteness(allModules.filter((m: any) => m !== "frontier-sandbox"));
  check(partial.complete === false && partial.missing.some((m: any) => /SANDBOX/.test(m)), "missing a stage module ⇒ NOT complete (a module existing ≠ system complete)");
}

const builder = async () => ({ id: "cand" });
const collectors = { throughput: () => 1.0, latencyMs: () => 100 };
const runner = (after: any) => async () => ({ afterSignals: after, raw: { ok: true }, cost: { ms: 10, calls: 1, costEur: 0 }, productionTouched: false });
function spec(id: string): any {
  return { id, proposalRef: "cand:x", budget: { maxMs: 1000, maxCalls: 10, maxCostEur: 0 }, config: { sense: { throughput: "higher", latencyMs: "lower" }, domainKey: "parsing" },
    hypothesis: { hypothesis: "candidate improves throughput", problem: "bottleneck", expectedOutcome: "up", refutationConditions: [{ metric: "latencyMs", field: "after", op: ">", value: 200 }], successCriteria: [{ metric: "throughput", field: "after", op: ">=", value: 1.5 }] } };
}
const transferTarget = { domainKey: "networking", evidenceRefs: ["t1"], baseline: { signals: { throughput: 1.0 } }, after: { signals: { throughput: 2.0 } }, senseMap: { throughput: "higher" }, inDomainDelta: 1.0, heldOutDelta: 0.8 };

void (async () => {
  // POSITIVE scenario — valid improvement ⇒ PROMOTION_REVIEW + held-out transfer VALIDATED; NOT promoted (external only).
  const pos = await SI.runSelfImprovement(spec("si-pos"), { builder, runner: runner({ throughput: 2.0, latencyMs: 60 }), collectors, transferTarget, now: 1 });
  check(pos.ok === true && pos.outcome === "PROMOTION_REVIEW" && pos.reachedReview === true, "POSITIVE: valid improvement ⇒ reaches PROMOTION_REVIEW");
  check(pos.compounded === true && pos.compounding.capability === "VALIDATED_CAPABILITY", "POSITIVE: held-out transfer ⇒ VALIDATED_CAPABILITY (compounded)");
  check(pos.promoted === false && pos.promotionIsExternal === true, "POSITIVE: self-improvement NEVER self-promotes (promotion external)");
  check(pos.stagesReached.includes("SHADOW") && pos.stagesReached.includes("CANARY"), "POSITIVE: the full chain runs through SHADOW→CANARY→PROMOTION_REVIEW");

  // NEGATIVE scenario — a regression (refutation met) ⇒ ROLLED_BACK; not compounded.
  const neg = await SI.runSelfImprovement(spec("si-neg"), { builder, runner: runner({ throughput: 2.0, latencyMs: 250 }), collectors, transferTarget, now: 1 });
  check(neg.outcome === "ROLLED_BACK" && neg.compounded === false, "NEGATIVE: regression ⇒ ROLLED_BACK, not compounded (bad improvement refused)");

  // ADVERSARIAL scenario — integrity manipulation ⇒ DETECTED ⇒ ROLLED_BACK; not compounded.
  const adv = await SI.runSelfImprovement(spec("si-adv"), { builder, runner: runner({ throughput: 2.0, latencyMs: 60 }), collectors, integritySignals: { gaming: { metric: { before: 1, after: 2 }, manipulationMarker: true } }, transferTarget, now: 1 });
  check(adv.outcome === "ROLLED_BACK" && adv.compounded === false, "ADVERSARIAL: integrity DETECTED ⇒ ROLLED_BACK (manipulation blocked)");

  // ADVERSARIAL self-promotion — the orchestrator never promotes; evolution-loop refuses a self-authored promotion.
  const EVO = require("./evolution-loop");
  const selfAuth = EVO.applyExternalPromotion({ state: "PROMOTION_REVIEW" }, { authorizedBy: "evolution-loop", approved: true }, {});
  check(pos.promoted === false && selfAuth.ok === false, "ADVERSARIAL: self-authorized promotion refused (no self-promotion anywhere in the chain)");

  console.log(failures === 0 ? "ALL PASS — V12.4 §34-§37 SELF-IMPROVEMENT" : `FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})();
export {};
