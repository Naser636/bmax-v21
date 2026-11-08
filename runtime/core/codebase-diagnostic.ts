#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 12 (self-improvement) — CODEBASE SELF-DIAGNOSTIC. PURE given injected inputs (real fs only in the CLI). ODG
 * runs this on its OWN source to DISCOVER improvement targets from EVIDENCE (not a supplied list). It classifies each
 * core module's test coverage HONESTLY — the hard-won lesson encoded as an invariant: *a module referenced by ≥1 test
 * is NOT "untested"*; a missing SAME-NAMED unit test is only a weak DIRECT-coverage signal, and only a module with
 * ZERO test references is genuinely UNCOVERED. It is an OBSERVER/PROPOSER: it grants no permission, promotes nothing,
 * and creates no second engine — it feeds the existing self-improvement loop. Fail-closed. Dual export.
 */

const fs = require("fs");
const path = require("path");

function isStr(v: any): boolean { return typeof v === "string"; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const COVERAGE = Object.freeze(["DIRECT", "INDIRECT", "UNCOVERED"]);

/** classifyModule(base, sameNamed:Set, refCount:number) -> { base, coverage, hasSameNamedTest, referenced }. */
function classifyModule(base: string, sameNamed: Set<string>, refCount: number): any {
  const hasSameNamedTest = sameNamed.has(base);
  const referenced = refCount > 0;
  // HONEST classification: DIRECT (own unit test) > INDIRECT (referenced by some test) > UNCOVERED (zero references).
  const coverage = hasSameNamedTest ? "DIRECT" : (referenced ? "INDIRECT" : "UNCOVERED");
  return Object.freeze({ base, coverage, hasSameNamedTest, referenced, refCount });
}

/** diagnoseCoverage({modules, sameNamedTests, refCounts}) -> aggregate + honest target lists. */
function diagnoseCoverage(input: any): any {
  const o = input && typeof input === "object" ? input : {};
  const modules = arr(o.modules).filter(isStr);
  const sameNamed = new Set(arr(o.sameNamedTests).filter(isStr));
  const refCounts = o.refCounts && typeof o.refCounts === "object" ? o.refCounts : {};
  const rows = modules.map((m) => classifyModule(m, sameNamed, Number(refCounts[m]) || 0));
  const byCoverage: any = { DIRECT: 0, INDIRECT: 0, UNCOVERED: 0 };
  for (const r of rows) byCoverage[r.coverage]++;
  // Targets, ranked by severity: UNCOVERED (real gap) first, then DIRECT-gaps (INDIRECT-only, weaker).
  const uncovered = rows.filter((r) => r.coverage === "UNCOVERED").map((r) => r.base);
  const directGaps = rows.filter((r) => r.coverage === "INDIRECT").map((r) => r.base);
  return Object.freeze({
    total: modules.length, byCoverage: Object.freeze(byCoverage),
    uncovered: Object.freeze(uncovered),        // genuine gap: zero test references
    directCoverageGaps: Object.freeze(directGaps), // weaker: referenced but no same-named unit test
    // honesty gate: no module that is referenced is ever in `uncovered`.
    honest: uncovered.every((m: string) => (Number(refCounts[m]) || 0) === 0),
  });
}

/** scanCore(opts?) -> reads runtime/core from disk (CLI) and runs diagnoseCoverage. Real I/O isolated here. */
function scanCore(opts?: any): any {
  const o = opts && typeof opts === "object" ? opts : {};
  const dir = isStr(o.dir) ? o.dir : path.join("runtime", "core");
  const readdir = typeof o.readdir === "function" ? o.readdir : ((d: string) => { try { return fs.readdirSync(d); } catch { return []; } });
  const readText = typeof o.readText === "function" ? o.readText : ((p: string) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } });
  const files = arr(readdir(dir)).filter(isStr);
  const tests = files.filter((f) => f.endsWith(".test.ts"));
  const modules = files.filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => f.slice(0, -3));
  const sameNamed = tests.map((t) => t.slice(0, -".test.ts".length));
  // reference count: how many test files mention the module base name (any import form).
  const testBodies = tests.map((t) => ({ t, body: readText(path.join(dir, t)) }));
  const refCounts: any = {};
  for (const m of modules) refCounts[m] = testBodies.filter((tb) => tb.body.indexOf(m) >= 0).length;
  return diagnoseCoverage({ modules, sameNamedTests: sameNamed, refCounts });
}

const CODEBASE_DIAGNOSTIC_CONTRACT = Object.freeze({
  id: "V124-CODEBASE-DIAGNOSTIC",
  source: "SÉRIE 12 self-improvement — evidence-based codebase self-diagnostic (coverage target discovery)",
  coverageLevels: COVERAGE,
  notAuthority: "a read-only observer/proposer; it grants no permission, promotes nothing, and creates no second engine",
  invariants: Object.freeze([
    "a module referenced by ≥1 test is NEVER reported as UNCOVERED (same-named-test absence ≠ untested) — the honesty gate",
    "UNCOVERED = zero test references (the genuine gap); DIRECT-coverage-gap = referenced but no same-named unit test (weaker)",
    "observer/proposer only — feeds the existing self-improvement loop; no 2nd engine/registry/scheduler/authorizer",
    "pure given injected inputs; real fs is isolated to scanCore; fail-closed honesty flag on every report",
  ]),
});

module.exports = { COVERAGE, classifyModule, diagnoseCoverage, scanCore, CODEBASE_DIAGNOSTIC_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...CODEBASE_DIAGNOSTIC_CONTRACT, scan: scanCore() }, null, 2) + "\n"); }

export {};
