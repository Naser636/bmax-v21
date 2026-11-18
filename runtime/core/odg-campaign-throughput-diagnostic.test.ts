#!/usr/bin/env node
"use strict";
/* V276 §2/§3 — campaign throughput diagnostic. Proves the EXISTING scheduler consumes the FULL eligible queue (6 missions,
 * NOT 2) in dependency-ordered parallelisable waves, skipping owner-gated/dep-blocked (classified, not dropped); and that the
 * §2 finding is grounded (no mission-count cap in code; binding constraint = session/context window). Reuses odg-mission-scheduler. */
const D = require("./odg-campaign-throughput-diagnostic.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  // §2 grounded finding.
  const diag = D.diagnoseLimits();
  check("§2: NO mission-count cap found in code (capsFoundInCode empty); binding constraint = SESSION_CONTEXT_WINDOW",
    diag.capsFoundInCode.length === 0 && diag.bindingConstraint === "SESSION_CONTEXT_WINDOW");
  check("§2: evidence cites scheduleEligible returns all (not a cap) + session window IS the real cap + disproof = 6 PRs",
    diag.evidence.some((e: any) => /scheduleEligible/.test(e.component) && e.isCap === false) && diag.evidence.some((e: any) => /session/.test(e.component) && e.isCap === true) && /6 PRs/.test(diag.disproof));
  check("§2: correction is NOT a numeric bump and NOT a new orchestrator (checkpoint-resume on the existing scheduler)",
    /NOT a numeric bump/.test(diag.correction) && /NOT a new orchestrator|forbidden/.test(diag.correction) && /checkpoint-resume/.test(diag.correction));

  // §3 controlled campaign: 6-mission DAG + 1 owner-gated + 1 dep-blocked.
  const missions = [
    { id: "A" }, { id: "B" },
    { id: "C", dependsOn: ["A"] }, { id: "D", dependsOn: ["B"] },
    { id: "E", dependsOn: ["C", "D"] }, { id: "F", dependsOn: ["E"] },
    { id: "G", ownerGated: true }, { id: "H", dependsOn: ["GHOST"] },
  ];
  const r = D.runControlledCampaign(missions);
  check("consumes the FULL eligible queue: consumedCount 6 (A–F) — demonstrably NOT capped at 2", r.ok && r.consumedCount === 6 && r.consumedCount > 2);
  check("dependency-ordered waves: 4 rounds; wave1 = [A,B], wave2 = [C,D], wave3 = [E], wave4 = [F]",
    r.rounds === 4 && JSON.stringify(r.waves[0].wave) === JSON.stringify(["A", "B"]) && JSON.stringify(r.waves[1].wave) === JSON.stringify(["C", "D"]) && JSON.stringify(r.waves[2].wave) === JSON.stringify(["E"]) && JSON.stringify(r.waves[3].wave) === JSON.stringify(["F"]));
  check("parallelism demonstrated: maxParallelWave 2 (independent missions processed in one wave)", r.maxParallelWave === 2 && r.parallelismDemonstrated === true && r.waves[0].parallelisable === true);
  check("exhausted the eligible queue (stopped because nothing eligible remained, not the safety bound)", r.exhaustedEligibleQueue === true);
  check("blocked missions CLASSIFIED not dropped: G OWNER_GATED + H DEPENDENCY_BLOCKED in notConsumed",
    r.notConsumed.some((x: any) => x.id === "G" && x.status === "OWNER_GATED") && r.notConsumed.some((x: any) => x.id === "H" && x.status === "DEPENDENCY_BLOCKED"));
  check("checkpoint: completed [A..F], remaining [G,H] (resumable state, nothing silently lost)",
    JSON.stringify(r.checkpoint.completed) === JSON.stringify(["A", "B", "C", "D", "E", "F"]) && JSON.stringify(r.checkpoint.remaining.slice().sort()) === JSON.stringify(["G", "H"]));

  // single mission still consumed (no floor), and a fully-parallel register (no deps) consumed in ONE wave.
  check("one eligible mission ⇒ consumed (no lower floor)", D.runControlledCampaign([{ id: "solo" }]).consumedCount === 1);
  check("5 independent missions ⇒ consumed in ONE parallel wave of 5 (full parallelism, >2)",
    (() => { const x = D.runControlledCampaign([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }]); return x.consumedCount === 5 && x.rounds === 1 && x.maxParallelWave === 5; })());

  // determinism + contract.
  check("deterministic + frozen", JSON.stringify(D.runControlledCampaign(missions)) === JSON.stringify(r) && Object.isFrozen(r.waves) && Object.isFrozen(diag));
  check("contract: reuses odg-mission-scheduler; no cap; no parallel orchestrator; checkpoint-resume; pure simulation",
    D.CAMPAIGN_THROUGHPUT_DIAGNOSTIC_CONTRACT.reuses.some((x: string) => /odg-mission-scheduler/.test(x)) && D.CAMPAIGN_THROUGHPUT_DIAGNOSTIC_CONTRACT.invariants.some((i: string) => /NO mission-count cap/.test(i)) && D.CAMPAIGN_THROUGHPUT_DIAGNOSTIC_CONTRACT.invariants.some((i: string) => /no parallel orchestrator/.test(i)) && D.CAMPAIGN_THROUGHPUT_DIAGNOSTIC_CONTRACT.invariants.some((i: string) => /no real mission execution claimed/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-campaign-throughput-diagnostic (V276 §2/§3: grounded finding = NO 2-task code cap [binding constraint = session/context window, fix = checkpoint-resume not a numeric bump/new orchestrator]; controlled campaign drives the EXISTING scheduler to exhaustion — 6 missions consumed in 4 dependency-ordered parallelisable waves [max wave 2], owner-gated/dep-blocked classified not dropped, resumable checkpoint; reuses odg-mission-scheduler, no parallel orchestrator)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
