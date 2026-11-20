#!/usr/bin/env node
"use strict";
/* Tests for odg-decomposed-execution (V327 §3). Proves decomposition with INTERMEDIATE verification LOCALISES a failure
 * to one sub-problem (targeted escalation), threads verified modules forward, and never issues a blind whole-task retry.
 * Deterministic via an injected mock buildProject. */
const M = require("./odg-decomposed-execution.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
// mock buildProject: "passes" a sub-problem iff its spec.name is in PASS; records whether builtContracts carried prior modules.
function mockBuilder(passSet: Set<string>, seen: string[][]): any {
  return async (spec: any, deps: any) => {
    seen.push(Object.keys((deps && deps.builtContracts) || {}));
    const ok = passSet.has(spec.name);
    return { verified: ok, buildOk: true, repairs: deps.maxRepair, modules: ok ? { [spec.name + ".js"]: () => spec.name } : {} };
  };
}
const sp = (id: string, required = true) => ({ id, required, spec: { name: id, architecture: [{ path: id + ".js", role: id, contract: "x" }], independentTest: () => true } });
const gen = () => ({ ok: true, content: "module.exports=1" });

async function main(): Promise<void> {
  // LOCALISED failure: A,B pass, C fails (required) ⇒ chain stops at C, D never run; escalate = C
  const seen1: string[][] = [];
  const r1 = await M.runDecomposed([sp("A"), sp("B"), sp("C"), sp("D")], { generateFile: gen, buildProject: mockBuilder(new Set(["A", "B", "D"]), seen1), maxRepair: 2 });
  check("A,B verified then C fails ⇒ firstFailure/escalate = C (localised, targeted)", r1.firstFailure === "C" && r1.escalate === "C" && r1.verifiedCount === 2 && r1.allVerified === false);
  check("chain STOPS at the failed required sub-problem ⇒ D never attempted (no blind whole-task retry)", r1.results.length === 3 && !r1.results.some((x: any) => x.id === "D"));
  check("note names the exact unit to escalate", /sub-problem "C" failed/.test(r1.note) && /no blind whole-task retry/.test(r1.note));

  // verified modules thread forward: B saw A's module, C saw A+B's
  check("verified modules thread forward as builtContracts (B sees A, C sees A+B)", seen1[0].length === 0 && seen1[1].join() === "A.js" && seen1[2].sort().join() === "A.js,B.js");

  // all pass ⇒ allVerified, composed on proven parts
  const r2 = await M.runDecomposed([sp("A"), sp("B")], { generateFile: gen, buildProject: mockBuilder(new Set(["A", "B"]), []) });
  check("all sub-problems verified ⇒ allVerified true, escalate null", r2.allVerified === true && r2.firstFailure === null && r2.escalate === null && r2.verifiedCount === 2);

  // a NON-required sub-problem failing does NOT stop the chain
  const r3 = await M.runDecomposed([sp("A"), sp("opt", false), sp("B")], { generateFile: gen, buildProject: mockBuilder(new Set(["A", "B"]), []) });
  check("non-required sub-problem failure does NOT stop the chain (A + B still run/verify)", r3.firstFailure === null && r3.verifiedCount === 2 && r3.results.length === 3);

  // builder throwing ⇒ that sub-problem is a (required) failure, localised
  const r4 = await M.runDecomposed([sp("A")], { generateFile: gen, buildProject: async () => { throw new Error("boom"); } });
  check("builder throw ⇒ localised required failure (not a crash)", r4.ok === true && r4.firstFailure === "A" && r4.results[0].verified === false);

  // fail-closed
  check("fail-closed: empty subproblems ⇒ BAD_SUBPROBLEMS; missing generator ⇒ NO_GENERATOR", (await M.runDecomposed([], { generateFile: gen })).code === "BAD_SUBPROBLEMS" && (await M.runDecomposed([sp("A")], {})).code === "NO_GENERATOR");

  // frozen + contract
  check("frozen result + results", Object.isFrozen(r1) && Object.isFrozen(r1.results));
  check("contract: per-sub-problem verification, localised escalation, no 2nd orchestrator, reuses buildProject",
    M.DECOMPOSED_EXECUTION_CONTRACT.invariants.some((s: string) => /verified by its OWN independentTest BEFORE the next/.test(s)) &&
    M.DECOMPOSED_EXECUTION_CONTRACT.invariants.some((s: string) => /EXACT unit to escalate/.test(s)) &&
    M.DECOMPOSED_EXECUTION_CONTRACT.invariants.some((s: string) => /builds NO second orchestrator/.test(s)) &&
    M.DECOMPOSED_EXECUTION_CONTRACT.reuses.some((s: string) => /buildProject/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-decomposed-execution (V327 §3: ordered sub-problems with INTERMEDIATE independent verification; a failure is LOCALISED to one sub-problem [targeted escalate, chain stops, no blind whole-task retry]; verified modules thread forward [compose on proven parts]; non-required failure doesn't stop; builder-throw localised; reuses buildProject, no 2nd orchestrator; fail-closed/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
