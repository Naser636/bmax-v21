#!/usr/bin/env node
"use strict";
const assert = require("assert");
const CD = require("./codebase-diagnostic");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 12 — CODEBASE SELF-DIAGNOSTIC");

// classification: DIRECT (same-named test) / INDIRECT (referenced only) / UNCOVERED (zero refs).
{
  check(CD.classifyModule("foo", new Set(["foo"]), 3).coverage === "DIRECT", "same-named test ⇒ DIRECT");
  check(CD.classifyModule("bar", new Set(), 5).coverage === "INDIRECT", "referenced but no same-named test ⇒ INDIRECT (NOT untested)");
  check(CD.classifyModule("baz", new Set(), 0).coverage === "UNCOVERED", "zero references ⇒ UNCOVERED (the genuine gap)");
}

// HONESTY GATE: a referenced module is never reported UNCOVERED (the lesson encoded).
{
  const d = CD.diagnoseCoverage({ modules: ["a", "b", "c"], sameNamedTests: ["a"], refCounts: { a: 2, b: 7, c: 0 } });
  check(d.byCoverage.DIRECT === 1 && d.byCoverage.INDIRECT === 1 && d.byCoverage.UNCOVERED === 1, "aggregate: 1 DIRECT, 1 INDIRECT, 1 UNCOVERED");
  check(d.uncovered.length === 1 && d.uncovered[0] === "c", "only the zero-reference module is UNCOVERED");
  check(!d.uncovered.includes("b"), "a referenced module (b, 7 refs) is NOT in UNCOVERED (honesty gate)");
  check(d.honest === true, "honesty flag true (no referenced module flagged uncovered)");
  check(d.directCoverageGaps.includes("b") && !d.directCoverageGaps.includes("a"), "DIRECT-coverage-gap = referenced-only modules (b), not DIRECT ones (a)");
}

// LIVE scan of the real runtime/core: honest, and reports real numbers.
{
  const s = CD.scanCore();
  check(s.total > 300, `LIVE: scanned ${s.total} core modules`);
  check(s.honest === true, "LIVE: honesty gate holds on the real codebase (no referenced module reported uncovered)");
  check(s.byCoverage.DIRECT + s.byCoverage.INDIRECT + s.byCoverage.UNCOVERED === s.total, "LIVE: every module classified exactly once");
  console.log(`  info - LIVE coverage: DIRECT=${s.byCoverage.DIRECT} INDIRECT=${s.byCoverage.INDIRECT} UNCOVERED=${s.byCoverage.UNCOVERED}`);
}

check(CD.CODEBASE_DIAGNOSTIC_CONTRACT.invariants.some((i: any) => /NEVER reported as UNCOVERED/.test(i)), "contract documents the honesty gate");

console.log(failures === 0 ? "ALL PASS — SÉRIE 12 CODEBASE SELF-DIAGNOSTIC" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
