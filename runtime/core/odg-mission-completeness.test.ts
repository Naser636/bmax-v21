#!/usr/bin/env node
"use strict";
/* Tests for odg-mission-completeness (V327 §6/§9). Pre-flight: EXECUTABLE requires a buildable architecture AND an
 * acceptance criterion (independentTest); anything missing ⇒ UNDERSPECIFIED with the precise missing list. Deterministic. */
const C = require("./odg-mission-completeness.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const full = { name: "f", architecture: [{ path: "f.js", role: "r", contract: "module.exports=(a,b)=>a+b" }], independentTest: () => true };

function main(): void {
  // complete ⇒ EXECUTABLE
  const ok = C.assessCompleteness(full);
  check("full spec (architecture+contract+independentTest) ⇒ EXECUTABLE, complete, no missing", ok.verdict === "EXECUTABLE" && ok.complete === true && ok.missing.length === 0);

  // no acceptance criterion ⇒ UNDERSPECIFIED (the key case: it could never be accepted)
  const noTest = C.assessCompleteness({ name: "f", architecture: [{ path: "f.js", role: "r", contract: "c" }] });
  check("no independentTest ⇒ UNDERSPECIFIED (unverifiable ⇒ never acceptable)", noTest.verdict === "UNDERSPECIFIED" && noTest.complete === false && noTest.missing.some((m: string) => /acceptance criterion/.test(m)));

  // no architecture ⇒ UNDERSPECIFIED
  const noArch = C.assessCompleteness({ name: "f", independentTest: () => true });
  check("no architecture ⇒ UNDERSPECIFIED (nothing to build)", noArch.verdict === "UNDERSPECIFIED" && noArch.missing.some((m: string) => /architecture/.test(m)));

  // architecture entry missing contract ⇒ UNDERSPECIFIED
  const noContract = C.assessCompleteness({ name: "f", architecture: [{ path: "f.js", role: "r" }], independentTest: () => true });
  check("architecture file missing contract ⇒ UNDERSPECIFIED (what to build unknown)", noContract.verdict === "UNDERSPECIFIED" && noContract.missing.some((m: string) => /contract/.test(m)));

  // non-object ⇒ UNDERSPECIFIED (fail-closed)
  check("non-object spec ⇒ UNDERSPECIFIED (fail-closed)", C.assessCompleteness(null).verdict === "UNDERSPECIFIED" && C.assessCompleteness("x").complete === false);

  // NOT over-broad: missing write-set / repairExamples does NOT make it underspecified
  check("missing write-set + repairExamples ⇒ still EXECUTABLE (those are optional)", C.assessCompleteness(full).complete === true);

  // frozen + contract
  check("frozen result + missing list", Object.isFrozen(ok) && Object.isFrozen(ok.missing));
  check("contract: structural-completeness orthogonal to reliability; fail-closed; not a 2nd readiness engine",
    /ORTHOGONAL structural-completeness/.test(JSON.stringify(C.MISSION_COMPLETENESS_CONTRACT.reuses)) &&
    /not a second readiness engine/.test(JSON.stringify(C.MISSION_COMPLETENESS_CONTRACT.invariants)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-mission-completeness (V327 §6/§9: pre-flight missing-information detection — EXECUTABLE needs architecture+contract AND an acceptance criterion; missing⇒UNDERSPECIFIED w/ precise list; write-set/repairExamples optional; fail-closed; pure)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
