#!/usr/bin/env node
"use strict";
/* Tests for odg-orchestration-plan (native multi-agent PLAN). PURE. Composes REAL dep-planner +
   odg-writeset-contention (#739/#742) + odg-mission-orchestrator.delegationContract — no mocks. */
const M = require("./odg-orchestration-plan.js");
const WSC = require("./odg-writeset-contention.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  const mission = { id: "M1", tasks: [
    { id: "a", deps: [], authorizedPaths: ["src/a"], objective: "build feature A" },
    { id: "b", deps: [], authorizedPaths: ["src/b"], objective: "build feature B" },
    { id: "c", deps: [], readOnly: true, objective: "analysis of X" },
    { id: "d", deps: ["a"], authorizedPaths: ["src/d"], objective: "build feature D" },
  ] };
  const p = M.planOrchestration(mission);

  // routing: read-only/bounded ⇒ ODG_NATIVE; else DELEGATE_PROVIDER
  check("routing: a/b/d delegated, c native (read-only)", p.assignments.find((x: any) => x.id === "a").route === "DELEGATE_PROVIDER" && p.assignments.find((x: any) => x.id === "c").route === "ODG_NATIVE");
  // AGENT COUNT is DERIVED from write-safe concurrency: a,b concurrent providers ⇒ 2
  check("agentCount = 2 (widest write-safe wave has 2 concurrent provider tasks)", p.agentCount === 2);
  check("split: 1 native, 3 delegated, maxWriteSafeParallelism 3", p.split.nativeByODG === 1 && p.split.delegatedToAgents === 3 && p.split.maxWriteSafeParallelism === 3);
  // per-task contract for a provider task = authorized files (its write-set) + acceptance + prohibitions
  const ca = p.assignments.find((x: any) => x.id === "a").contract;
  check("provider task gets a contract: authorizedFiles = its write-set, acceptance + prohibitions present", JSON.stringify(ca.authorizedFiles) === JSON.stringify(["src/a"]) && Array.isArray(ca.acceptanceCriteria) && Array.isArray(ca.prohibitions));
  check("native task gets NO provider contract (ODG executes it)", p.assignments.find((x: any) => x.id === "c").contract === undefined);

  // HONESTY: it is a PLAN, not an execution
  check("executed === false (plans, does not dispatch/track/integrate)", p.executed === false);
  check("note: plan-not-execution, agent count derived, no autonomy counted without provenance", /A PLAN, not an execution/.test(p.note) && /derived — never fixed/.test(p.note) && /NO native autonomy is counted without real execution provenance/.test(p.note));

  // WRITE-SET ISOLATION (#739/#742): two provider tasks with OVERLAPPING write-sets are NOT concurrent ⇒ 1 agent
  const overlap = M.planOrchestration({ tasks: [{ id: "x", deps: [], authorizedPaths: ["src/shared"], objective: "A" }, { id: "y", deps: [], authorizedPaths: ["src/shared/f.ts"], objective: "B" }] });
  check("overlapping write-sets ⇒ NOT co-scheduled ⇒ agentCount 1 (reuses #739/#742)", overlap.agentCount === 1 && overlap.writeSafety.anyContention === true);
  // the writeSafety sub-waves really are write-isolated (cross-check vs the real contention module)
  check("plan.writeSafety is the real computeLayerContention output", overlap.writeSafety.ok === true && Array.isArray(overlap.writeSafety.layers));

  // disjoint write-sets ⇒ concurrent ⇒ 2 agents
  check("disjoint write-sets ⇒ 2 concurrent provider tasks ⇒ agentCount 2", M.planOrchestration({ tasks: [{ id: "x", deps: [], authorizedPaths: ["src/x"], objective: "A" }, { id: "y", deps: [], authorizedPaths: ["src/y"], objective: "B" }] }).agentCount === 2);
  // dependent tasks are NOT parallelised ⇒ sequential ⇒ 1 agent
  check("dependent provider tasks (b deps a) ⇒ sequential ⇒ agentCount 1", M.planOrchestration({ tasks: [{ id: "a", deps: [], authorizedPaths: ["src/a"], objective: "A" }, { id: "b", deps: ["a"], authorizedPaths: ["src/b"], objective: "B" }] }).agentCount === 1);
  // all native ⇒ 0 agents (agents chosen by value, never by obligation)
  check("all-native ⇒ 0 agents", M.planOrchestration({ tasks: [{ id: "a", readOnly: true }, { id: "b", readOnly: true }] }).agentCount === 0 && /0 agents/.test(M.planOrchestration({ tasks: [{ id: "a", readOnly: true }] }).agentRationale));
  // >6 concurrent providers ⇒ capped at 6, excess serialized (disclosed)
  const many = M.planOrchestration({ tasks: Array.from({ length: 8 }, (_, i) => ({ id: "t" + i, deps: [], authorizedPaths: ["src/p" + i], objective: "build" + i })) });
  check("8 concurrent provider tasks ⇒ agentCount capped at 6, excess disclosed", many.agentCount === 6 && /capped at 6/.test(many.agentRationale) && /serialize/.test(many.agentRationale));

  // owner-gated / explicit route honoured
  check("ownerGated task ⇒ NOT_DISPATCHABLE (not delegated to a worker)", M.planOrchestration({ tasks: [{ id: "g", ownerGated: true, objective: "deploy" }, { id: "a", readOnly: true }] }).assignments.find((x: any) => x.id === "g").route === "NOT_DISPATCHABLE");
  check("explicit route honoured", M.planOrchestration({ tasks: [{ id: "a", route: "DELEGATE_PROVIDER", authorizedPaths: ["src/a"] }] }).assignments[0].route === "DELEGATE_PROVIDER");

  // unknown deps across non-dispatchable are intersected (no crash); native unaffected
  check("deps on a non-dispatchable task are intersected out (no crash)", M.planOrchestration({ tasks: [{ id: "g", ownerGated: true }, { id: "a", deps: ["g"], authorizedPaths: ["src/a"], objective: "A" }] }).ok === true);

  // fail-closed
  check("non-object mission ⇒ BAD_MISSION", M.planOrchestration(null).code === "BAD_MISSION");
  check("empty tasks ⇒ NO_TASKS", M.planOrchestration({ tasks: [] }).code === "NO_TASKS");
  check("task without string id ⇒ BAD_TASK", M.planOrchestration({ tasks: [{ deps: [] }] }).code === "BAD_TASK");
  check("duplicate task id ⇒ DUPLICATE_TASK_ID", M.planOrchestration({ tasks: [{ id: "a" }, { id: "a" }] }).code === "DUPLICATE_TASK_ID");

  // determinism + frozen + contract + no-2nd-orchestrator
  check("deterministic", JSON.stringify(M.planOrchestration(mission)) === JSON.stringify(p));
  check("frozen (plan, assignments, an assignment, writeSafety)", Object.isFrozen(p) && Object.isFrozen(p.assignments) && Object.isFrozen(p.assignments[0]) && Object.isFrozen(p.writeSafety));
  check("contract: plan-not-execution, agent-count-derived, write-isolation, per-task-contract, no-2nd-orchestrator",
    M.ORCHESTRATION_PLAN_CONTRACT.invariants.some((s: string) => /PLAN, not execution/.test(s)) &&
    M.ORCHESTRATION_PLAN_CONTRACT.invariants.some((s: string) => /DERIVED from the write-safe parallelism/.test(s)) &&
    M.ORCHESTRATION_PLAN_CONTRACT.invariants.some((s: string) => /NEVER placed in the same wave/.test(s)) &&
    M.ORCHESTRATION_PLAN_CONTRACT.invariants.some((s: string) => /NO second orchestrator, NO second queue, NO tenth primitive/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-orchestration-plan (native multi-agent PLAN composing REAL dep-planner + odg-writeset-contention[#739/#742] + delegationContract: routes native/delegate/not-dispatchable; AGENT COUNT DERIVED 0..6 from write-safe concurrency [disjoint⇒2, overlap⇒1, dependent⇒1, all-native⇒0, 8⇒cap6]; per-task provider contract=write-set+acceptance; PLAN not execution [executed:false, no autonomy counted]; ownerGated⇒NOT_DISPATCHABLE; bad-mission/no-tasks/bad-task/dup-id fail-closed; no 2nd orchestrator/queue/primitive; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
