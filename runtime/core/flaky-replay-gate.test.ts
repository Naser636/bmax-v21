#!/usr/bin/env node
"use strict";
const assert = require("assert");
const F = require("./flaky-replay-gate");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5-E / FLAKY GATE + DETERMINISTIC REPLAY");
// all pass ⇒ STABLE_PASS.
check(F.flakyGate({ suiteId: "a", runs: [true, true, true] }).verdict === "STABLE_PASS", "all pass ⇒ STABLE_PASS");
// all fail ⇒ STABLE_FAIL.
check(F.flakyGate({ suiteId: "a", runs: [false, false, false] }).verdict === "STABLE_FAIL", "all fail ⇒ STABLE_FAIL");
// MIXED ⇒ FLAKY_QUARANTINE and NOT pass (the core rule).
{
  const r = F.flakyGate({ suiteId: "a", runs: [true, false, true, true] });
  check(r.verdict === "FLAKY_QUARANTINE" && r.isPass === false, "flaky ⇒ FLAKY_QUARANTINE, NEVER PASS");
}
// repetition does not turn flaky into PASS (more passes but one fail).
check(F.flakyGate({ suiteId: "a", runs: [true, true, true, true, true, false] }).isPass === false, "one failure among many ⇒ still not PASS (no masking)");
// too few runs ⇒ INSUFFICIENT.
check(F.flakyGate({ suiteId: "a", runs: [true] }).verdict === "INSUFFICIENT", "too few runs ⇒ INSUFFICIENT (fail-closed)");
// deterministic replay: same seed same output ⇒ deterministic.
check(F.deterministicReplay({ replays: [{ seed: 1, output: "x" }, { seed: 1, output: "x" }] }).deterministic === true, "same seed same output ⇒ deterministic");
// same seed different output ⇒ NON_DETERMINISTIC.
{
  const r = F.deterministicReplay({ replays: [{ seed: 1, output: "x" }, { seed: 1, output: "y" }] });
  check(r.deterministic === false && r.divergences.includes("1"), "same seed different output ⇒ NON_DETERMINISTIC");
}
// no replays ⇒ not deterministic (fail-closed).
check(F.deterministicReplay({ replays: [] }).deterministic === false, "no replays ⇒ cannot assert determinism (fail-closed)");
check(F.FLAKY_REPLAY_GATE_CONTRACT.invariants.some((i: any) => /NEVER becomes PASS by repetition or masking/i.test(i)), "contract: flaky never PASS by repetition/masking");
console.log(failures === 0 ? "ALL PASS — V5-E FLAKY GATE + REPLAY" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
