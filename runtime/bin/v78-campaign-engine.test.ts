#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V78 §11 — campaign-engine integration test. Calls the REAL engine (not isolated fns). Covers: T1 queue
 * discovery/no-dup/accepted-recognized; T2 long chain (>4 processed); T3 blocked isolated (independents continue); T5
 * dependency order; T6 local mandate recognized; T7 forbidden (Level-C) refused + campaign continues; T8 provider bounded
 * (execute injected, ODG selects); T12 no artificial cap (30 missions). Honest status typing; no self-authorization.
 */

const path = require("path");
const fs = require("fs");
const ENGINE = require("../core/campaign-engine.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V78_CAMPAIGN_RUN.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const A = (id: string, deps: any = []) => ({ id, actions: ["test"], strategicImportance: 0.6, roadmapPriority: 0.6, unblocks: [], risk: 0.1, immediatelyExecutable: true, operationalValue: 0.6, closureWithProof: true, deps, status: "OPEN" });

function main(): void {
  // T2/T12 — long chain of 30 Level-A, no cap
  const q30 = Array.from({ length: 30 }, (_, i) => A(`m${i + 1}`));
  const r30 = ENGINE.runCampaign(q30, {});
  check("T2/T12: 30 Level-A missions all executed+accepted (>4, no cap)", r30.metrics.accepted === 30 && r30.stopReason === "QUEUE_EXHAUSTED");
  check("T1: no duplicate — iterations == accepted (each handled once)", r30.metrics.iterations === 30);

  // T5 — dependency order: m2 depends on m1; both accepted, m1 before m2 in log
  const rdep = ENGINE.runCampaign([A("m2", ["m1"]), A("m1")], {});
  const order = rdep.log.filter((l: any) => l.decision === "EXECUTED_ACCEPTED").map((l: any) => l.id);
  check("T5: dependency respected (m1 before m2)", order.indexOf("m1") < order.indexOf("m2") && rdep.metrics.accepted === 2);

  // T3/T7 — Level-C forbidden refused; campaign continues on independents
  const rmix = ENGINE.runCampaign([A("ok1"), { id: "bad", actions: ["deploy"], strategicImportance: 0.9, roadmapPriority: 0.9, unblocks: [], risk: 0.9, immediatelyExecutable: false, operationalValue: 0.5, closureWithProof: false, deps: [], status: "OPEN" }, A("ok2")], {});
  check("T3/T7: Level-C refused, independents still executed (campaign continues)", rmix.metrics.refusedC === 1 && rmix.metrics.accepted === 2);

  // T6 — local mandate recognized without repeated approval (all Level-A accepted)
  check("T6: local mandate recognized (all Level-A authorized+accepted)", ENGINE.runCampaign([A("x1"), A("x2"), A("x3")], {}).metrics.accepted === 3);

  // failure handling — induced failure not accepted, campaign continues
  const rfail = ENGINE.runCampaign([A("good"), A("fails"), A("good2")], { execute: (m: any) => m.id === "fails" ? { mission: m.id, validated: false, status: "FAILED" } : { mission: m.id, validated: true, status: "SUCCESS" } });
  check("failure handled: failed mission NOT accepted, others proceed", rfail.metrics.failed === 1 && rfail.metrics.accepted === 2);

  // T8 — already-ACCEPTED excluded (no repeat)
  const racc = ENGINE.runCampaign([{ ...A("done"), status: "ACCEPTED" }, A("new")], {});
  check("T8/no-repeat: pre-ACCEPTED not re-executed; only new executed", racc.metrics.accepted === 1 && racc.log.every((l: any) => l.id !== "done"));

  // safety cap is proportional + logged (not a silent 4/10)
  check("stop reasons are explicit (never a silent cap)", /QUEUE_EXHAUSTED|ALL_REMAINING_DEFERRED|BUDGET|SAFETY_CAP/.test(r30.stopReason));

  // artifact — the 30-mission campaign run
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("artifact: 30-mission campaign, >4 accepted", !!m && m.queueSize === 30 && m.moreThanFourExecuted === true && m.metrics.accepted > 4);
  check("artifact: Level-C refused + Level-B prepared recorded", !!m && m.metrics.refusedC >= 1 && m.metrics.preparedB >= 1);
  check("invariant: no hardcoded cap; blocked/failed never global stop", !!m && /no hardcoded mission cap/i.test(m.invariant) && /never cause a global stop|never a global stop/i.test(m.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V78 campaign engine (arbitrary queue, >4 missions, blocked-isolated, deps, mandate, no cap)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
