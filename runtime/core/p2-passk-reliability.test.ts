#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P = require("./p2-passk-reliability");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 13 P2 — pass^k RELIABILITY");

// pass^k: a task is reliable only if ALL k rollouts pass; a flaky task is caught.
{
  const r = P.passAtK({ t1: [true, true, true], t2: [true, false, true], t3: [true, true, true] });
  check(r.k === 3 && r.tasks === 3, "k=3 rollouts over 3 tasks");
  check(r.passAt1 === 1 && r.passAtK === round2(2 / 3), "pass^1=1.0 but pass^k=0.6667 (t2 flaky)");
  check(r.reliabilityDrop > 0 && r.flaky.includes("t2"), "reliabilityDrop>0 and the flaky task (t2) is named");
}
function round2(n: number) { return Number(n.toFixed(4)); }

// all reliable ⇒ pass^k == pass^1, no flaky, drop 0.
{
  const r = P.passAtK({ a: [true, true], b: [true, true] });
  check(r.passAtK === 1 && r.reliabilityDrop === 0 && r.flaky.length === 0, "all rollouts pass ⇒ pass^k=1, no drop, no flaky");
}

// fail-closed k = min rollout count (never credit a task for rollouts it didn't run).
{
  const r = P.passAtK({ a: [true, true, true, true], b: [true, true] });
  check(r.k === 2, "k = min rollout count across tasks (fail-closed)");
}

// reliability is judged on pass^k, not pass^1.
{
  const r = P.passAtK({ t1: [true, false], t2: [true, true] }); // pass^1=1, pass^k=0.5
  check(P.reliable(r, 0.9) === false, "pass^1=1 but pass^k=0.5 ⇒ NOT reliable at 0.9 (judged on pass^k)");
  check(P.reliable(P.passAtK({ a: [true, true], b: [true, true] }), 0.9) === true, "all-pass ⇒ reliable at 0.9");
}

// empty ⇒ fail-closed zero.
check(P.passAtK({}).tasks === 0 && P.passAtK({}).passAtK === 0, "no rollouts ⇒ zero (fail-closed)");

check(P.P2_PASSK_CONTRACT.invariants.some((i: any) => /ALL k rollouts pass/.test(i)), "contract documents pass^k fail-closed");

console.log(failures === 0 ? "ALL PASS — SÉRIE 13 P2 pass^k RELIABILITY" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
