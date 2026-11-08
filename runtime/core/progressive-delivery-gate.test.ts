#!/usr/bin/env node
"use strict";
const assert = require("assert");
const G = require("./progressive-delivery-gate");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 21 — PROGRESSIVE-DELIVERY ANALYSIS GATE");

const stream = (c: number, f: number) => ({ transitions: [...Array(c)].map(() => ({ event: "COMPLETED" })).concat([...Array(f)].map(() => ({ event: "FAILED" }))) });

// canary within tolerance of baseline ⇒ PROMOTE.
{
  const r = G.analyze({ baseline: stream(95, 5), canary: stream(93, 7) }); // 5% vs 7% CFR, delta 0.02 < 0.05
  check(r.verdict === "PROMOTE" && r.deltaCfr <= 0.05, "canary within tolerance ⇒ PROMOTE");
}

// canary materially worse than baseline ⇒ ROLLBACK.
{
  const r = G.analyze({ baseline: stream(95, 5), canary: stream(70, 30) }); // 5% vs 30% CFR
  check(r.verdict === "ROLLBACK" && /deploy\/odg-rollback/.test(r.rollbackAction), "canary much worse ⇒ ROLLBACK + names rollback script (triggers nothing)");
}

// canary above absolute ceiling ⇒ ROLLBACK even if close to a bad baseline.
{
  const r = G.analyze({ baseline: stream(80, 20), canary: stream(78, 22), tolerance: { maxAbsoluteCfr: 0.15, maxCfrDelta: 0.1 } });
  check(r.verdict === "ROLLBACK", "canary CFR above absolute ceiling ⇒ ROLLBACK (even within delta tolerance)");
}

// insufficient evidence (empty canary) ⇒ HOLD (fail-closed, never auto-PROMOTE).
{
  const r = G.analyze({ baseline: stream(95, 5), canary: { transitions: [] } });
  check(r.verdict === "HOLD" && /insufficient evidence/.test(r.reasons.join(" ")), "no observed canary CFR ⇒ HOLD (fail-closed)");
}

// admission: NOT_READY deployment readiness ⇒ HOLD (no analysis run).
{
  const r = G.analyze({ baseline: stream(95, 5), canary: stream(95, 5), readinessEvidence: {} });
  check(r.verdict === "HOLD" && /admission blocked/.test(r.reasons.join(" ")), "NOT_READY admission ⇒ HOLD");
}

check(G.PROGRESSIVE_DELIVERY_CONTRACT.invariants.some((i: any) => /triggers no deploy/.test(i)), "contract: triggers nothing itself");

console.log(failures === 0 ? "ALL PASS — SÉRIE 21 PROGRESSIVE-DELIVERY GATE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
