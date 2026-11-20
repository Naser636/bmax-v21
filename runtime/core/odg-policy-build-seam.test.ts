#!/usr/bin/env node
"use strict";
/* Tests for odg-policy-build-seam (V327 §2/§3). Proves the build seam ADAPTS {model, maxRepair} from REAL calibrated-P
 * per task class and is CONSUMED by the EXISTING native-engineering-cycle (no cycle change). Deterministic (mocks). */
const M = require("./odg-policy-build-seam.js");
const CYCLE = require("./native-engineering-cycle.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const h = (t: string, s: number, f: number): any[] => [...Array(s).fill(0).map(() => ({ missionType: t, verified: true })), ...Array(f).fill(0).map(() => ({ missionType: t, verified: false }))];

async function main(): Promise<void> {
  // capture what model the generator factory and buildProject actually receive
  function harness(history: any[]) {
    const seen: any = { model: null, maxRepair: null };
    const seam = M.makePolicyBuildSeam({
      history,
      generatorFor: (model: string) => { seen.model = model; return () => ({ ok: true, content: "x" }); },
      buildProject: async (_spec: any, deps: any) => { seen.maxRepair = deps.maxRepair; return { accepted: true, verified: true, buildOk: true, repairs: deps.maxRepair }; },
    });
    return { seam, seen };
  }

  // CALIBRATED high ⇒ cheap: 3b, maxRepair 1
  const hi = harness(h("t", 18, 2));
  const boHi = await hi.seam.build({ type: "t", name: "t", architecture: [] });
  check("CALIBRATED high ⇒ seam builds with 3b + maxRepair 1; outcome tags the policy", hi.seen.model === "qwen2.5-coder:3b" && hi.seen.maxRepair === 1 && boHi.executionPolicy.model === "qwen2.5-coder:3b" && boHi.executionPolicy.maxRepair === 1 && boHi.accepted === true);

  // CALIBRATED low ⇒ larger model + more repair: 7b, maxRepair 3
  const lo = harness(h("t", 4, 16));
  await lo.seam.build({ type: "t", name: "t", architecture: [] });
  check("CALIBRATED low ⇒ seam builds with 7b + maxRepair 3 (adapts resource up)", lo.seen.model === "qwen2.5-coder:7b" && lo.seen.maxRepair === 3);

  // not calibrated ⇒ cheap probe
  const probe = harness(h("t", 2, 1));
  await probe.seam.build({ type: "t", name: "t", architecture: [] });
  check("thin (not calibrated) ⇒ cheap PROBE (3b, maxRepair 1) — never over-commit", probe.seen.model === "qwen2.5-coder:3b" && probe.seen.maxRepair === 1);

  // the independent verifier still arbitrates: a build the verifier rejects is NOT accepted despite the policy
  const rej = M.makePolicyBuildSeam({ history: h("t", 18, 2), generatorFor: () => () => ({ ok: true, content: "x" }), buildProject: async () => ({ accepted: false, verified: false, buildOk: true }) });
  check("policy sizes resources only — a verifier-rejected build stays un-accepted (authorizes nothing)", (await rej.build({ type: "t", name: "t", architecture: [] })).accepted === false);

  // CONSUMED by the EXISTING native-engineering-cycle (EXPLORE authorized): the cycle calls our seam.build
  let cycleSawBuild: boolean = false;
  const seam2 = M.makePolicyBuildSeam({ history: h("calc", 18, 2), generatorFor: () => () => ({ ok: true, content: "x" }), buildProject: async (_s: any, deps: any) => { cycleSawBuild = true; return { accepted: true, verified: true, repairs: deps.maxRepair }; } });
  const cyc = await CYCLE.runNativeCycle({ name: "calc", architecture: [{ path: "a.js", role: "r", contract: "c" }], independentTest: () => true }, [], { build: seam2.build }, { mode: "explore", exploreAuthorized: true });
  check("native-engineering-cycle CONSUMES the policy seam as deps.build (attempted NATIVE, build invoked)", cyc.attempted === true && cyc.routedTo === "NATIVE" && cycleSawBuild === true);

  // fail-closed
  const noGen = M.makePolicyBuildSeam({ history: h("t", 18, 2), buildProject: async () => ({ accepted: true, verified: true }) });
  check("no generatorFor ⇒ un-accepted (NO_GENERATOR_FACTORY), never a fabricated success", (await noGen.build({ type: "t", name: "t", architecture: [] })).accepted === false);
  const thrower = M.makePolicyBuildSeam({ history: h("t", 18, 2), generatorFor: () => () => ({ ok: true }), buildProject: async () => { throw new Error("boom"); } });
  check("buildProject throw ⇒ un-accepted (localised, not a crash)", (await thrower.build({ type: "t", name: "t", architecture: [] })).accepted === false);

  // frozen + contract
  check("outcome frozen; contract: adapts from calibrated evidence, verifier arbitrates, no cycle change, no duplication",
    Object.isFrozen(boHi) &&
    M.POLICY_BUILD_SEAM_CONTRACT.invariants.some((s: string) => /resources ADAPT per task class from calibrated evidence/.test(s)) &&
    M.POLICY_BUILD_SEAM_CONTRACT.invariants.some((s: string) => /INDEPENDENT verifier still arbitrates/.test(s)) &&
    M.POLICY_BUILD_SEAM_CONTRACT.reuses.some((s: string) => /native-engineering-cycle consumes this as deps.build/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-policy-build-seam (V327 §2/§3: calibrated policy configures the EXISTING native-engineering-cycle's build seam — reliable⇒3b/1 cheap, hard⇒7b/3; CONSUMED by runNativeCycle as deps.build [no cycle change, no duplication]; independent verifier still arbitrates [policy sizes resources only, authorizes nothing]; fail-closed on no-generator/throw; deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
