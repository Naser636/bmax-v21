#!/usr/bin/env node
"use strict";
const assert = require("assert");
const A = require("./autonomy-persistence");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §38-§42 — A3+ PERSISTENT AUTONOMY (demonstrated)");

// fresh register per test (campaign-controller.advance mutates in place).
function reg(): any {
  return { items: [
    { id: "L1", status: "READY", deps: [], priority: 1 },
    { id: "L2", status: "READY", deps: ["L1"], priority: 1 },
    { id: "L3", status: "READY", deps: [], priority: 2 },
    { id: "LB", status: "BLOCKED", deps: [], priority: 1 },
  ] };
}
const acceptAll = () => ({ accepted: true, evidence: "ev", native: true });

// (1) AUTONOMOUS selection + acceptance in dependency order; BLOCKED never selected.
{
  const run = A.runAutonomyCycle(reg(), { execute: acceptAll });
  check(run.iterations === 3 && run.accepted.includes("L1") && run.accepted.includes("L2") && run.accepted.includes("L3") && !run.accepted.includes("LB"), "autonomous: selects + accepts READY lots in dep order; BLOCKED (LB) never selected");
  check(run.accepted.indexOf("L1") < run.accepted.indexOf("L2"), "dependency order respected (L1 before its dependent L2)");
}

// (2) NO-REPEAT: re-running a completed register does nothing.
{
  const r = reg(); A.runAutonomyCycle(r, { execute: acceptAll });
  const again = A.runAutonomyCycle(r, { execute: acceptAll });
  check(again.iterations === 0 && again.accepted.length === 0, "NO-REPEAT: an already-ACCEPTED register yields 0 further missions");
}

// (3) INTERRUPTION + RESUME: stop after 1, resume continues at the right point, no re-run of ACCEPTED.
{
  const r = reg();
  const first = A.runAutonomyCycle(r, { execute: acceptAll, maxIter: 1 });
  check(first.iterations === 1 && first.accepted.length === 1, "controlled interruption: exactly 1 mission executed, recoverable register left");
  const resumed = A.resumeAutonomy(first.register, { execute: acceptAll });
  const total = first.accepted.concat(resumed.accepted);
  check(resumed.metrics.resumes === 1 && total.sort().join(",") === "L1,L2,L3" && new Set(total).size === 3, "RESUME: continues from the persisted register, finishes all, NO lot re-run");
}

// (4) INCOMPLETE lot is NEVER marked ACCEPTED (fail-closed).
{
  const run = A.runAutonomyCycle(reg(), { execute: (lot: any) => (lot.id === "L1" ? { incomplete: true } : { accepted: true, evidence: "ev", native: true }) });
  check(!run.accepted.includes("L1") && run.failed.includes("L1"), "INCOMPLETE L1 ⇒ failed attempt, NEVER ACCEPTED");
  check(run.accepted.includes("L3") && !run.accepted.includes("L2"), "independent L3 still accepted; L2 (dep on un-accepted L1) NOT selected");
}

// (5) a failing executor throw is caught; the lot is failed, the loop ends cleanly.
{
  const run = A.runAutonomyCycle(reg(), { execute: (lot: any) => { if (lot.id === "L1") throw new Error("boom"); return { accepted: true, evidence: "ev", native: true }; } });
  check(run.failed.includes("L1") && run.accepted.includes("L3"), "executor throw ⇒ lot failed (caught), independent lots still proceed");
}

// (6) AUTONOMY METRICS: native vs delegated measured honestly (native only when executor reports native).
{
  const run = A.runAutonomyCycle(reg(), { execute: (lot: any) => ({ accepted: true, evidence: "ev", native: lot.id !== "L3" }) }); // L3 delegated
  check(run.metrics.missionsExecuted === 3 && run.metrics.nativeCount === 2 && run.metrics.delegatedCount === 1 && run.metrics.nativeRatio === 0.6667 && run.metrics.successRate === 1, "autonomy metrics: native vs delegated ratio + success rate measured honestly");
}

console.log(failures === 0 ? "ALL PASS — V12.4 §38-§42 A3+ PERSISTENT AUTONOMY" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
