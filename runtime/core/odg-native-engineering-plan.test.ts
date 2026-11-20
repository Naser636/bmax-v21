#!/usr/bin/env node
"use strict";
/* Tests for odg-native-engineering-plan (native select→plan bridge). PURE. Composes REAL
   mission-priority-selector + odg-orchestration-plan (+ dep-planner + writeset-contention transitively) — no mocks. */
const M = require("./odg-native-engineering-plan.js");
const SEL = require("./mission-priority-selector.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  const cands = [
    { id: "m1", deps: [], authorizedPaths: ["src/a"], objective: "build feature A", strategicImportance: 0.9 },
    { id: "m2", deps: [], authorizedPaths: ["src/b"], objective: "build feature B" },
    { id: "m3", deps: ["x-accepted"], authorizedPaths: ["src/c"], objective: "build C" }, // dep unmet ⇒ deferred
    { id: "m4", status: "ACCEPTED" },                                                       // accepted ⇒ not eligible
    { id: "m5", deps: [], readOnly: true, objective: "analysis E" },                        // native
  ];
  const p = M.planNextProgram(cands, []);

  // selection = ODG's native top pick (reuses selectNext)
  check("ODG selects the top-priority eligible mission (m1)", p.selected && p.selected.id === "m1" && /ODG selected 'm1'/.test(p.selectionJustification));
  check("selected == selectNext().selected (reuses the native selector, no reimplementation)", JSON.stringify(p.selected) === JSON.stringify(SEL.selectNext(cands, []).selected));

  // only dependency-ready, not-accepted missions are planned; others deferred
  check("eligibleCount = 3 (m1,m2,m5); deferredCount = 2 (m3 dep-unmet, m4 accepted)", p.eligibleCount === 3 && p.deferredCount === 2);

  // the multi-agent plan: agent count derived across the independent eligible missions (m1,m2 provider; m5 native)
  check("orchestration plan: agentCount 2 (m1,m2 concurrent providers), m5 native", p.orchestrationPlan.agentCount === 2 && p.orchestrationPlan.split.nativeByODG === 1 && p.orchestrationPlan.split.delegatedToAgents === 2);
  check("plan carries per-task contracts + write-safe waves (from the composed planner)", p.orchestrationPlan.assignments.find((a: any) => a.id === "m1").contract.authorizedFiles[0] === "src/a" && p.orchestrationPlan.writeSafety.ok === true);

  // HONESTY: plan not execution at BOTH levels
  check("executed false at both the program and the orchestration level", p.executed === false && p.orchestrationPlan.executed === false);
  check("note: select/rank/plan only, dispatches nothing, no autonomy counted without provenance", /A PLAN, not an execution/.test(p.note) && /dispatches\/tracks\/integrates NOTHING/.test(p.note) && /NO native autonomy is counted without real execution provenance/.test(p.note));

  // dependency-readiness is dynamic: accepting the blocker makes m3 eligible (deps met)
  check("accepting the blocker ⇒ m3 becomes eligible (deps met) ⇒ eligibleCount 4", M.planNextProgram(cands, ["x-accepted"]).eligibleCount === 4);
  // overlapping write-sets across eligible missions ⇒ not concurrent (write-set isolation flows through)
  const overlap = M.planNextProgram([{ id: "a", deps: [], authorizedPaths: ["src/shared"], objective: "A" }, { id: "b", deps: [], authorizedPaths: ["src/shared/f.ts"], objective: "B" }], []);
  check("overlapping eligible write-sets ⇒ agentCount 1 (isolation via #739/#742)", overlap.orchestrationPlan.agentCount === 1);

  // no eligible mission ⇒ null selection + null plan (honest: nothing to do)
  const none = M.planNextProgram([{ id: "a", status: "ACCEPTED" }], []);
  check("all accepted ⇒ selected null, eligibleCount 0, orchestrationPlan null", none.selected === null && none.eligibleCount === 0 && none.orchestrationPlan === null);
  // empty candidate list ⇒ ok, nothing planned
  check("empty candidates ⇒ ok, eligibleCount 0, null plan", M.planNextProgram([], []).ok === true && M.planNextProgram([], []).orchestrationPlan === null);

  // fail-closed
  check("non-array candidates ⇒ BAD_CANDIDATES", M.planNextProgram(null).code === "BAD_CANDIDATES" && M.planNextProgram("x").code === "BAD_CANDIDATES");
  check("malformed candidate entries tolerated (skipped), no throw", M.planNextProgram([null, 42, { id: "a", deps: [], authorizedPaths: ["src/a"], objective: "A" }], []).eligibleCount === 1);

  // determinism + frozen + contract
  check("deterministic", JSON.stringify(M.planNextProgram(cands, [])) === JSON.stringify(p));
  check("frozen (program plan, orchestration plan)", Object.isFrozen(p) && Object.isFrozen(p.orchestrationPlan));
  check("contract: plan-not-execution, deps-ready-only, composed, no-2nd-orchestrator",
    M.NATIVE_ENGINEERING_PLAN_CONTRACT.invariants.some((s: string) => /PLAN, not execution/.test(s)) &&
    M.NATIVE_ENGINEERING_PLAN_CONTRACT.invariants.some((s: string) => /unmet-dependency missions are DEFERRED/.test(s)) &&
    M.NATIVE_ENGINEERING_PLAN_CONTRACT.invariants.some((s: string) => /NO second orchestrator, NO second queue, NO tenth primitive/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-native-engineering-plan (native select→plan bridge composing REAL mission-priority-selector.selectNext + odg-orchestration-plan: ODG selects top mission [m1] + ranks eligible [dep-ready, not-accepted] + plans multi-agent across independents [agentCount 2, m5 native, contracts, write-safe]; dynamic dep-readiness [accept blocker⇒m3 eligible]; overlap⇒1; all-accepted⇒null plan; PLAN not execution [executed:false both levels, no autonomy counted]; non-array fail-closed; no 2nd orchestrator; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
