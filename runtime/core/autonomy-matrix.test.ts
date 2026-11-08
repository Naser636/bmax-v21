#!/usr/bin/env node
"use strict";

/*
 * WI-AUTO-13 — autonomy-matrix. Locks: evidence discipline (DECLARED/no-evidence counts nothing), GRANTED
 * requires REAL evidence for all caps, SIMULATED evidence ⇒ SIMULATED_ONLY (not granted for A3+), monotonic
 * grantedLevel, missing-capability reporting, determinism. Pure. Run: node_modules/.bin/tsx runtime/core/autonomy-matrix.test.ts
 */
const assert = require("assert");
const A = require("./autonomy-matrix");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

const E = ["ev"]; // a present evidence ref
function real(cap: string) { return { capability: cap, evidence: E, kind: "REAL" }; }
function sim(cap: string) { return { capability: cap, evidence: E, kind: "SIMULATED" }; }

console.log("WI-AUTO-13 — AUTONOMY A1–A5 MATRIX");

check(A.LEVELS.length === 5, "five levels A1..A5");

// Nothing demonstrated ⇒ NONE.
check(A.assess([]).grantedLevel === "NONE", "no evidence ⇒ grantedLevel NONE");

// Declared-without-evidence counts for nothing (§57).
check(A.assess([{ capability: "bounded-execution", kind: "REAL" }]).grantedLevel === "NONE", "capability with NO evidence ⇒ not counted ⇒ NONE");
check(A.assess([{ capability: "bounded-execution", evidence: E, kind: "DECLARED" }]).grantedLevel === "NONE", "DECLARED kind ⇒ not counted");

// A2 granted on real evidence for its 4 caps.
{
  const r = A.assess([real("bounded-execution"), real("mission-planning"), real("independent-verification"), real("evidence-recording")]);
  check(r.grantedLevel === "A2", "A1+A2 caps with REAL evidence ⇒ grantedLevel A2");
  check(r.perLevel.find((p: any) => p.level === "A3").verdict === "INSUFFICIENT_EVIDENCE" && r.perLevel.find((p: any) => p.level === "A3").missing.includes("persistence-resume"), "A3 INSUFFICIENT, missing persistence-resume/dependency-management reported");
}

// SIMULATED evidence does NOT grant A3 (§4): persistence shown only via simulation.
{
  const caps = ["bounded-execution", "mission-planning", "independent-verification", "evidence-recording"].map(real)
    .concat([sim("persistence-resume"), sim("dependency-management")]);
  const r = A.assess(caps);
  check(r.grantedLevel === "A2", "A3 caps shown only SIMULATED ⇒ grantedLevel stays A2 (not granted on simulation)");
  check(r.demonstratedLevel === "A3" && r.perLevel.find((p: any) => p.level === "A3").verdict === "SIMULATED_ONLY", "A3 reachable but SIMULATED_ONLY (transparent, not granted)");
}

// Full REAL stack ⇒ A5; monotonicity.
{
  const all = A.LEVELS[4].requires.map(real);
  const r = A.assess(all);
  check(r.grantedLevel === "A5", "all caps REAL ⇒ grantedLevel A5");
  check(r.perLevel.every((p: any) => p.verdict === "GRANTED"), "every level GRANTED");
}

// Monotonic: a gap at A2 prevents A3 even if A3-specific caps are REAL.
{
  const r = A.assess([real("bounded-execution"), real("persistence-resume"), real("dependency-management"), real("mission-planning"), real("evidence-recording")]);
  // independent-verification missing ⇒ A2 insufficient ⇒ grantedLevel A1
  check(r.grantedLevel === "A1", "missing A2 cap (independent-verification) ⇒ grantedLevel capped at A1 (monotonic)");
}

// Determinism
check(JSON.stringify(A.assess([real("bounded-execution")])) === JSON.stringify(A.assess([real("bounded-execution")])), "deterministic assess");

console.log(failures === 0 ? "ALL PASS — WI-AUTO-13 AUTONOMY MATRIX" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
