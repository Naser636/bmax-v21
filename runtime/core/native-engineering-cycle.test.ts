#!/usr/bin/env node
"use strict";
const C = require("./native-engineering-cycle");
const NBO = require("./native-build-outcome");
const B = require("./native-project-builder");
let failures = 0;
function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }

// a real, buildable 2-file spec; the independent test requires calc(2,3)===5.
const spec: any = { name: "calc", architecture: [{ path: "src/ops.js", role: "math", contract: "add", dependsOn: [] }, { path: "src/calc.js", role: "uses ops", contract: "ops.add", dependsOn: ["src/ops.js"] }], independentTest: (m: any) => typeof m["src/calc.js"] === "function" && m["src/calc.js"](2, 3) === 5 };
// a build seam backed by the REAL native-project-builder (the independent verifier arbitrates). correct/wrong generators:
const goodGen = async (f: any) => ({ ok: true, content: f.path === "src/ops.js" ? "module.exports={add:(a,b)=>a+b};" : "const ops=require('./ops.js');module.exports=(a,b)=>ops.add(a,b);" });
const wrongGen = async (f: any) => ({ ok: true, content: f.path === "src/ops.js" ? "module.exports={add:(a,b)=>a-b};" : "const ops=require('./ops.js');module.exports=(a,b)=>ops.add(a,b);" });
const buildWith = (gen: any) => (s: any) => B.buildProject({ ...s, independentTest: spec.independentTest }, { generateFile: gen });

(async () => {
  // (1) GOVERNED cold start (no evidence) ⇒ route to PROVIDER, NO native build attempted (fail-closed).
  const cold = await C.runNativeCycle(spec, [], { build: async () => { throw new Error("must not build"); } }, {});
  check(cold.attempted === false && cold.routedTo === "PROVIDER", "GOVERNED cold start ⇒ route to PROVIDER, no native build");
  check(cold.verdict === "INSUFFICIENT_DATA", "cold-start verdict is INSUFFICIENT_DATA");

  // (2) EXPLORE mode WITHOUT external authorization ⇒ refused (no self-authorization).
  const unauth = await C.runNativeCycle(spec, [], { build: buildWith(goodGen) }, { mode: "explore" });
  check(unauth.attempted === false && /not externally authorized/i.test(unauth.reason), "EXPLORE without authorization ⇒ refused (discovery ≠ authorization)");

  // (3) EXPLORE mode WITH external authorization ⇒ attempts natively, build succeeds (independent verifier accepts),
  //     outcome recorded, flagged as evidence-gathering (NOT a trusted autonomous success).
  const explore = await C.runNativeCycle(spec, [], { build: buildWith(goodGen) }, { mode: "explore", exploreAuthorized: true, attempt: 1 });
  check(explore.attempted === true && explore.routedTo === "NATIVE" && explore.buildAccepted === true, "authorized EXPLORE ⇒ native build attempted + ACCEPTED by the independent verifier");
  check(explore.outcome === "SUCCESS" && explore.evidenceGathering === true, "a successful explore build is recorded SUCCESS but flagged evidenceGathering (capability not yet earned)");
  check(explore.outcomes.length === 1, "the explore outcome is recorded into the ledger");

  // (4) a WRONG build under explore ⇒ the independent verifier REJECTS ⇒ recorded as a real FAILURE (failure-inclusive).
  const exploreFail = await C.runNativeCycle(spec, [], { build: buildWith(wrongGen) }, { mode: "explore", exploreAuthorized: true, attempt: 1 });
  check(exploreFail.buildAccepted === false && exploreFail.outcome === "FAILURE", "a compiling-but-wrong build ⇒ REJECTED ⇒ recorded FAILURE (no survivorship bias)");

  // (5) BOOTSTRAP: accumulate a CALIBRATED, ≥threshold track record for the class, then GOVERNED mode ⇒ ATTEMPT_NATIVE.
  //     (the spec is SIMPLE 2-file, no meta ⇒ chooseStrategy = MONOLITHIC, class MONOLITHIC:SIMPLE. seed 18 success + 2 fail = 20 verified, 0.9.)
  let outs: any = [];
  let at = 1;
  for (let k = 0; k < 18; k++) outs = NBO.recordNativeBuild(outs, { accepted: true, buildOk: true, verified: true }, spec, "MONOLITHIC", at++).outcomes;
  for (let k = 0; k < 2; k++) outs = NBO.recordNativeBuild(outs, { accepted: false, buildOk: false, verified: false }, spec, "MONOLITHIC", at++).outcomes;
  const earned = await C.runNativeCycle(spec, outs, { build: buildWith(goodGen) }, { attempt: at });
  check(earned.verdict === "ATTEMPT_NATIVE" && earned.attempted === true && earned.routedTo === "NATIVE", "with a CALIBRATED ≥0.8 track record, GOVERNED mode ⇒ ATTEMPT_NATIVE");
  check(earned.evidenceGathering === false && earned.buildAccepted === true, "an EARNED native attempt is a trusted autonomous success (not evidence-gathering) and is independently verified");
  check(earned.reliabilityAfter.byClass["MONOLITHIC:SIMPLE"].attempts === 21, "the new outcome is recorded and reliability re-measured (21 attempts)");

  // (6) FAIL-CLOSED: an absent build result under an earned attempt ⇒ UNKNOWN (never a fabricated SUCCESS).
  const noResult = await C.runNativeCycle(spec, outs, { build: () => null }, { attempt: at });
  check(noResult.outcome === "UNKNOWN", "an absent build result ⇒ UNKNOWN (never fabricated SUCCESS)");

  // (7) contract honesty.
  check(/EARNED only/i.test(JSON.stringify(C.NATIVE_ENGINEERING_CYCLE_CONTRACT.invariants)) && /authorizes nothing/i.test(C.NATIVE_ENGINEERING_CYCLE_CONTRACT.notAuthority), "contract: autonomy earned, authorizes nothing, exploration externally authorized");

  if (failures === 0) process.stdout.write("ALL PASS — V12.4 NATIVE ENGINEERING CYCLE\n");
  process.exit(failures === 0 ? 0 : 1);
})();

export {};
