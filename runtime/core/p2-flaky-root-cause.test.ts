#!/usr/bin/env node
"use strict";
const assert = require("assert");
const F = require("./p2-flaky-root-cause");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23/W8 — FLAKY ROOT-CAUSE");
// order-dependent: stable within each order, differs across orders.
check(F.classifyFlakiness({ testId: "t1", sameOrder: [true, true], altOrders: { B: [false, false] } }).cause === "ORDER_DEPENDENT", "stable-per-order, differs across orders ⇒ ORDER_DEPENDENT");
// order-dependent via isolation: isolated passes, suite fails (pollution/victim).
check(F.classifyFlakiness({ testId: "t2", sameOrder: [false, false], isolated: [true, true] }).cause === "ORDER_DEPENDENT", "isolated disagrees with suite ⇒ ORDER_DEPENDENT (pollution)");
// non-deterministic: varies within a single fixed order.
check(F.classifyFlakiness({ testId: "t3", sameOrder: [true, false, true] }).cause === "NON_DETERMINISTIC", "varies within fixed order ⇒ NON_DETERMINISTIC");
// non-deterministic via mixed isolation.
check(F.classifyFlakiness({ testId: "t4", sameOrder: [true, true], isolated: [true, false] }).cause === "NON_DETERMINISTIC", "mixed isolated ⇒ NON_DETERMINISTIC");
// deterministic: consistent across configs.
{
  const r = F.classifyFlakiness({ testId: "t5", sameOrder: [true, true], altOrders: { B: [true, true] }, isolated: [true, true] });
  check(r.cause === "DETERMINISTIC" && r.clean === true, "consistent everywhere ⇒ DETERMINISTIC (clean)");
}
// fail-closed: no data ⇒ UNCLASSIFIED.
check(F.classifyFlakiness({ testId: "t6" }).cause === "UNCLASSIFIED", "no data ⇒ UNCLASSIFIED (fail-closed)");
check(F.classifyFlakiness({ testId: "t7", sameOrder: [] }).clean === false, "empty ⇒ not clean");
check(F.P2_FLAKY_ROOT_CAUSE_CONTRACT.invariants.some((i: any) => /never silently clean/.test(i)), "contract: never silently clean");
console.log(failures === 0 ? "ALL PASS — SÉRIE 23/W8 FLAKY ROOT-CAUSE" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
