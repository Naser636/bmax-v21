#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P = require("./p15-saga-compensation");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 14 P15 — SAGA COMPENSATION");

// all forward succeed ⇒ COMMITTED, nothing compensated.
{
  const r = P.runSaga([
    { id: "reserve", forward: () => true, compensate: () => true },
    { id: "charge", forward: () => true, compensate: () => true },
    { id: "ship", forward: () => true, compensate: () => true },
  ]);
  check(r.status === "COMMITTED" && r.committed.length === 3 && r.compensated.length === 0, "all forward ok ⇒ COMMITTED");
}

// failure at step 3 ⇒ compensate steps 2,1 in REVERSE ⇒ COMPENSATED.
{
  const order: string[] = [];
  const r = P.runSaga([
    { id: "reserve", forward: () => true, compensate: () => { order.push("reserve"); return true; } },
    { id: "charge", forward: () => true, compensate: () => { order.push("charge"); return true; } },
    { id: "ship", forward: () => false, compensate: () => true },
  ]);
  check(r.status === "COMPENSATED" && r.failedStep === "ship", "forward fails at ship ⇒ COMPENSATED");
  check(r.committed.join(",") === "reserve,charge" && r.compensated.join(",") === "charge,reserve", "committed [reserve,charge] compensated in REVERSE [charge,reserve]");
  check(order.join(",") === "charge,reserve", "compensations ran in reverse order");
}

// a failed compensation ⇒ COMPENSATION_FAILED (fail-closed alert, surfaced).
{
  const r = P.runSaga([
    { id: "reserve", forward: () => true, compensate: () => false },  // compensation fails
    { id: "charge", forward: () => false, compensate: () => true },
  ]);
  check(r.status === "COMPENSATION_FAILED" && r.compensationFailed.includes("reserve"), "a failed compensation ⇒ COMPENSATION_FAILED (surfaced, not swallowed)");
}

// a throwing forward is treated as failure (fail-closed).
{
  const r = P.runSaga([
    { id: "a", forward: () => true, compensate: () => true },
    { id: "b", forward: () => { throw new Error("boom"); }, compensate: () => true },
  ]);
  check(r.failedStep === "b" && r.status === "COMPENSATED", "a throwing forward ⇒ failure + compensation (fail-closed)");
}

check(P.P15_SAGA_CONTRACT.invariants.some((i: any) => /REVERSE order/.test(i)), "contract documents reverse compensation");

console.log(failures === 0 ? "ALL PASS — SÉRIE 14 P15 SAGA COMPENSATION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
