#!/usr/bin/env node
"use strict";
/* Tests for odg-capability-maturity (V324 §9 integration-maturity ladder). PURE. Monotonic + planning-only + fail-closed. */
const M = require("./odg-capability-maturity.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const full = { built: true, tested: true, connected: true, fed: true, invoked: true, executed: true, consumed: true, evidenced: true, integrated: true, demonstrated: true };

function main(): void {
  // full evidence ⇒ DEMONSTRATED
  check("full evidence ⇒ DEMONSTRATED, no gap", M.classifyMaturity(full).level === "DEMONSTRATED" && M.classifyMaturity(full).firstGap === null);

  // MONOTONIC: a gap caps the level at the last consecutively-satisfied rung
  const g = M.classifyMaturity({ built: true, tested: true, connected: false, fed: true, invoked: true, executed: true });
  check("gap at CONNECTED ⇒ level TESTED, firstGap CONNECTED (higher rungs ignored)", g.level === "TESTED" && g.firstGap === "CONNECTED");
  // a higher rung true but a lower false must NOT be counted (no leapfrogging)
  const leap = M.classifyMaturity({ built: true, tested: true, connected: true, fed: true, invoked: false, integrated: true, demonstrated: true });
  check("integrated/demonstrated true but invoked false ⇒ capped at FED (no leapfrog)", leap.level === "FED" && leap.firstGap === "INVOKED");

  // PLANNING-ONLY skips EXECUTED (preserves the boundary, §4D)
  const plan = M.classifyMaturity({ built: true, tested: true, connected: true, fed: true, invoked: true, executionApplicable: false, consumed: true, evidenced: false });
  check("planning-only (executionApplicable false) skips EXECUTED ⇒ CONSUMED, gap EVIDENCED", plan.level === "CONSUMED" && plan.firstGap === "EVIDENCED");
  check("planning-only can reach DEMONSTRATED without executed", M.classifyMaturity({ ...full, executed: false, executionApplicable: false }).level === "DEMONSTRATED");
  // execution-applicable but NOT executed ⇒ capped at INVOKED (the honest 'built but not run' truth)
  const notRun = M.classifyMaturity({ built: true, tested: true, connected: true, fed: true, invoked: true, executed: false, consumed: true });
  check("execution-applicable but not executed ⇒ INVOKED, gap EXECUTED", notRun.level === "INVOKED" && notRun.firstGap === "EXECUTED");

  // "code exists / unit test passes" is NOT operational
  check("built+tested only ⇒ TESTED (NOT operational), gap CONNECTED", M.classifyMaturity({ built: true, tested: true }).level === "TESTED" && M.classifyMaturity({ built: true, tested: true }).firstGap === "CONNECTED");
  check("built only ⇒ BUILT, gap TESTED", M.classifyMaturity({ built: true }).level === "BUILT" && M.classifyMaturity({ built: true }).firstGap === "TESTED");
  check("nothing ⇒ NONE, gap BUILT", M.classifyMaturity({}).level === "NONE" && M.classifyMaturity({}).firstGap === "BUILT");
  // non-boolean truthy does NOT satisfy a rung (strict === true)
  check("truthy-non-boolean (built:1) does NOT satisfy ⇒ NONE", M.classifyMaturity({ built: 1 }).level === "NONE");

  // satisfied map is exposed per rung
  check("satisfied map reflects per-rung truth", M.classifyMaturity({ built: true, tested: true }).satisfied.BUILT === true && M.classifyMaturity({ built: true, tested: true }).satisfied.CONNECTED === false);

  // aggregate: per-level counts + notYetIntegrated (honest not-operational-end-to-end)
  const agg = M.aggregateMaturity([
    { name: "a", ...full, integrated: false, demonstrated: false, executed: false, executionApplicable: false }, // CONSUMED→EVIDENCED... caps where? integrated false ⇒ EVIDENCED
    { name: "b", built: true, tested: true },
    { name: "c", ...full },
  ]);
  check("aggregate: total 3", agg.total === 3);
  check("aggregate: 'c' DEMONSTRATED counted; notYetIntegrated counts a+b (below INTEGRATED)", agg.demonstrated === 1 && agg.notYetIntegrated === 2);
  check("aggregate byLevel tallies (EVIDENCED a, TESTED b, DEMONSTRATED c)", agg.byLevel.EVIDENCED === 1 && agg.byLevel.TESTED === 1 && agg.byLevel.DEMONSTRATED === 1);
  check("aggregate items carry name + level + firstGap", agg.items.find((i: any) => i.name === "b").level === "TESTED" && agg.items.find((i: any) => i.name === "b").firstGap === "CONNECTED");

  // fail-closed
  check("non-object evidence ⇒ BAD_EVIDENCE", M.classifyMaturity(null).code === "BAD_EVIDENCE" && M.classifyMaturity(42).code === "BAD_EVIDENCE");
  check("non-array capabilities ⇒ BAD_INPUT", M.aggregateMaturity("x").code === "BAD_INPUT");
  check("garbage capability entries tolerated (⇒ NONE), no throw", M.aggregateMaturity([null, 42, { name: "x", built: true }]).total === 3);

  // honesty + determinism + frozen + contract
  check("note: never promoted past first missing rung; built/unit-test ≠ operational", /NEVER promoted past its first missing rung/.test(M.classifyMaturity(full).note) && /NOT 'operational'/.test(M.classifyMaturity(full).note));
  check("deterministic", JSON.stringify(M.classifyMaturity(full)) === JSON.stringify(M.classifyMaturity(full)));
  check("frozen (result, satisfied, aggregate, items)", Object.isFrozen(M.classifyMaturity(full)) && Object.isFrozen(M.classifyMaturity(full).satisfied) && Object.isFrozen(agg) && Object.isFrozen(agg.items));
  check("LADDER exported with the 10 §9 rungs in order", JSON.stringify(M.LADDER) === JSON.stringify(["BUILT", "TESTED", "CONNECTED", "FED", "INVOKED", "EXECUTED", "CONSUMED", "EVIDENCED", "INTEGRATED", "DEMONSTRATED"]));
  check("contract: monotonic, built≠operational, planning-skips-executed, truthful-evidence, fail-closed",
    M.CAPABILITY_MATURITY_CONTRACT.invariants.some((s: string) => /NEVER promoted past its first missing rung/.test(s)) &&
    M.CAPABILITY_MATURITY_CONTRACT.invariants.some((s: string) => /passing-unit-test is NOT operational/.test(s)) &&
    M.CAPABILITY_MATURITY_CONTRACT.invariants.some((s: string) => /skips EXECUTED/.test(s)) &&
    M.CAPABILITY_MATURITY_CONTRACT.invariants.some((s: string) => /evidence booleans must be truthful/.test(s)));

  // V15.5 coarse projection (same ladder; no second engine)
  check("coarse: nothing built ⇒ ABSENT", M.coarseLevel({}).level === "ABSENT");
  check("coarse: built only ⇒ BUILT_NOT_WIRED", M.coarseLevel({ built: true }).level === "BUILT_NOT_WIRED");
  check("coarse: built+tested, not wired ⇒ BUILT_NOT_WIRED (gap CONNECTED)", M.coarseLevel({ built: true, tested: true }).level === "BUILT_NOT_WIRED" && M.coarseLevel({ built: true, tested: true }).firstGap === "CONNECTED");
  check("coarse: wired but untested ⇒ BUILT_NOT_WIRED (monotonic: TESTED precedes CONNECTED)", M.coarseLevel({ built: true, wired: true, exercisedLive: true }).level === "BUILT_NOT_WIRED");
  check("coarse: built+tested+wired ⇒ WIRED_TESTED", M.coarseLevel({ built: true, tested: true, wired: true }).level === "WIRED_TESTED");
  check("coarse: + live run ⇒ EXERCISED_LIVE (ladder EVIDENCED, never INTEGRATED/DEMONSTRATED)", M.coarseLevel({ built: true, tested: true, wired: true, exercisedLive: true }).level === "EXERCISED_LIVE" && M.coarseLevel({ built: true, tested: true, wired: true, exercisedLive: true }).ladderLevel === "EVIDENCED");
  check("coarse: strict booleans (truthy string ≠ true) + non-object ⇒ BAD_FACTS", M.coarseLevel({ built: "yes" }).level === "ABSENT" && M.coarseLevel(null).code === "BAD_FACTS");
  check("coarse: COARSE_LEVELS exported in order", JSON.stringify(M.COARSE_LEVELS) === JSON.stringify(["ABSENT", "BUILT_NOT_WIRED", "WIRED_TESTED", "EXERCISED_LIVE"]));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-capability-maturity (V324 §9 ladder BUILT→DEMONSTRATED: full⇒DEMONSTRATED; monotonic [gap caps, no leapfrog]; planning-only skips EXECUTED [reaches DEMONSTRATED w/o executed]; exec-applicable-not-run⇒INVOKED; built+test-only⇒TESTED NOT operational; strict-boolean rungs; aggregate byLevel+notYetIntegrated honest; non-object/non-array/garbage fail-closed; never-promoted-past-first-gap honest; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
