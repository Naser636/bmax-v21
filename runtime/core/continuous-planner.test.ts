#!/usr/bin/env node
"use strict";
const C = require("./continuous-planner");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
const plan = { version: 3, missions: [{ id: "A", deps: [] }, { id: "B", deps: ["A"] }, { id: "C", deps: [] }, { id: "D", deps: ["B"] }] };
const cand = { candidatesFor: (id: string) => [{ id: id + "-alt", metrics: { Psuccess: 0.9, Vobjective: 0.8, Qquality: 0.8, Ttime: 0.3, Cresources: 0.3, Rrisk: 0.1, Uuncertainty: 0.1 } }] };

// (1) a localized event (A blocked) affects A + its transitive dependents (B, D), NOT the independent C.
{
  const aff = C.affectedMissions(plan, { type: "MISSION_BLOCKED", missionId: "A" });
  check(aff.has("A") && aff.has("B") && aff.has("D") && !aff.has("C"), "affected = target + transitive dependents (A,B,D); independent C preserved");
}
// (2) incremental repair: only affected parts replanned, valid parts PRESERVED (no full rebuild).
{
  const r = C.repairPlan(plan, { type: "MISSION_BLOCKED", missionId: "A" }, cand);
  check(r.preservedCount === 1 && r.affected.length === 3, "C preserved verbatim; A,B,D repaired (incremental, not full rebuild)");
  check(r.newPlan.version === 4 && r.previous.version === 3, "new plan version + prior plan retained (history)");
}
// (3) INVARIANT: the repaired plan is a PROPOSAL — replanning never self-authorizes.
{
  const r = C.repairPlan(plan, { type: "DEPENDENCY_LOST", missionId: "A" }, cand);
  check(r.authorized === false && r.decision.status === "PROPOSED", "repaired plan is PROPOSED, authorized:false (never self-authorizes)");
}
// (4) an affected mission with NO feasible alternative ⇒ BLOCKED/escalated, never silently dropped.
{
  const r = C.repairPlan(plan, { type: "MISSION_BLOCKED", missionId: "A" }, { candidatesFor: () => [] });
  check(r.blockedCount >= 1 && r.newPlan.missions.find((m: any) => m.id === "A").status === "BLOCKED", "no alternative ⇒ BLOCKED (escalate), not dropped");
}
// (5) an affected mission whose only candidate is INFEASIBLE (hard-constraint) ⇒ BLOCKED (plan-evaluator rejects it).
{
  const r = C.repairPlan(plan, { type: "MISSION_BLOCKED", missionId: "C" }, { candidatesFor: () => [{ id: "bad", policyAllowed: false, metrics: { Psuccess: 1 } }] });
  check(r.newPlan.missions.find((m: any) => m.id === "C").status === "BLOCKED", "an infeasible-only candidate ⇒ BLOCKED (hard constraint enforced via plan-evaluator)");
}
// (6) §2.2 calibrated estimate from VERIFIED history; no data ⇒ UNKNOWN (never favourable).
{
  const hist = [{ type: "repair", status: "ACCEPTED" }, { type: "repair", status: "ACCEPTED" }, { type: "repair", status: "BLOCKED" }, { type: "build", status: "ACCEPTED" }];
  const e = C.estimateSuccess("repair", hist);
  check(e.basis === "VERIFIED_HISTORY" && e.observations === 3 && Math.abs(e.p - 0.6667) < 0.01, "success estimate calibrated from verified history (2/3)");
  const u = C.estimateSuccess("never-seen", hist);
  check(u.basis === "UNKNOWN" && u.p === null, "no observations ⇒ UNKNOWN, p=null (never a favourable default)");
}
// (7) an unrelated event (no missionId, no priority list) affects nothing ⇒ plan preserved whole.
{
  const r = C.repairPlan(plan, { type: "STATE_CHANGE" }, cand);
  check(r.preservedCount === 4 && r.repairedCount === 0, "an unrelated event preserves the whole plan (no wasteful rebuild)");
}
check(/replanning NEVER self-authorizes/i.test(JSON.stringify(C.CONTINUOUS_PLANNER_CONTRACT.invariants)), "contract: replanning never self-authorizes");
check(/still-valid parts are preserved/i.test(JSON.stringify(C.CONTINUOUS_PLANNER_CONTRACT.invariants)), "contract: valid parts preserved (no full rebuild)");
if (failures === 0) process.stdout.write("ALL PASS — V12.4 CONTINUOUS PLANNER\n");
process.exit(failures === 0 ? 0 : 1);
export {};
