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

const COVERAGE = Object.freeze(["DIRECT", "INDIRECT", "UNCOVERED", "CLI_SCRIPT"]);

/** classifyModule(base, sameNamed:Set, refCount:number, isLibrary:boolean) -> classification.
 * A CLI script (no library surface: no module.exports / export) is NOT a coverage gap — it is run via `tsx file.ts`,
 * not imported; flagging it UNCOVERED would be a false target (and forcing a test onto it would be metric-gaming).
 * Only a LIBRARY module (exports a surface) with zero test references is genuinely UNCOVERED. */
function classifyModule(base: string, sameNamed: Set<string>, refCount: number, isLibrary: boolean = true): any {
  const hasSameNamedTest = sameNamed.has(base);
  const referenced = refCount > 0;
  let coverage: string;
  if (hasSameNamedTest) coverage = "DIRECT";
  else if (referenced) coverage = "INDIRECT";
  else if (isLibrary === false) coverage = "CLI_SCRIPT";   // no exports ⇒ not a library unit ⇒ not a coverage gap
  else coverage = "UNCOVERED";
  return Object.freeze({ base, coverage, hasSameNamedTest, referenced, refCount, isLibrary: isLibrary !== false });
}

/** diagnoseCoverage({modules, sameNamedTests, refCounts}) -> aggregate + honest target lists. */
function diagnoseCoverage(input: any): any {
  const o = input && typeof input === "object" ? input : {};
  const modules = arr(o.modules).filter(isStr);
  const sameNamed = new Set(arr(o.sameNamedTests).filter(isStr));
  const refCounts = o.refCounts && typeof o.refCounts === "object" ? o.refCounts : {};
  const libraries = o.libraries && typeof o.libraries === "object" ? o.libraries : {}; // base -> boolean (has export surface)
  const rows = modules.map((m) => classifyModule(m, sameNamed, Number(refCounts[m]) || 0, libraries[m] !== false));
  const byCoverage: any = { DIRECT: 0, INDIRECT: 0, UNCOVERED: 0, CLI_SCRIPT: 0 };
  for (const r of rows) byCoverage[r.coverage]++;
  // Targets, ranked by severity: UNCOVERED (real gap: LIBRARY with zero refs) first, then DIRECT-gaps (INDIRECT-only).
  const uncovered = rows.filter((r) => r.coverage === "UNCOVERED").map((r) => r.base);
  const directGaps = rows.filter((r) => r.coverage === "INDIRECT").map((r) => r.base);
  const cliScripts = rows.filter((r) => r.coverage === "CLI_SCRIPT").map((r) => r.base);
  return Object.freeze({
    total: modules.length, byCoverage: Object.freeze(byCoverage),
    uncovered: Object.freeze(uncovered),        // genuine gap: a LIBRARY module with zero test references
    directCoverageGaps: Object.freeze(directGaps), // weaker: referenced but no same-named unit test
    cliScripts: Object.freeze(cliScripts),      // not a gap: no library surface (run via `tsx`, not imported)
    // honesty gate: no referenced module and no CLI script is ever in `uncovered`.
    honest: uncovered.every((m: string) => (Number(refCounts[m]) || 0) === 0 && libraries[m] !== false),
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
  const libraries: any = {};
  for (const m of modules) {
    refCounts[m] = testBodies.filter((tb) => tb.body.indexOf(m) >= 0).length;
    // a LIBRARY module exposes an import surface (module.exports or a named `export`); a CLI script does not.
    const body = readText(path.join(dir, m + ".ts"));
    libraries[m] = /module\.exports\s*=|^\s*export\s+(function|const|class|\{)/m.test(body);
  }
  return diagnoseCoverage({ modules, sameNamedTests: sameNamed, refCounts, libraries });
}

const CODEBASE_DIAGNOSTIC_CONTRACT = Object.freeze({
  id: "V124-CODEBASE-DIAGNOSTIC",
  source: "SÉRIE 12 self-improvement — evidence-based codebase self-diagnostic (coverage target discovery)",
  coverageLevels: COVERAGE,
  notAuthority: "a read-only observer/proposer; it grants no permission, promotes nothing, and creates no second engine",
  invariants: Object.freeze([
    "a module referenced by ≥1 test is NEVER reported as UNCOVERED (same-named-test absence ≠ untested) — the honesty gate",
    "UNCOVERED = a LIBRARY module (has an export surface) with zero test references — the genuine gap",
    "a CLI script (no export surface; run via `tsx file.ts`, not imported) is CLI_SCRIPT, NOT a coverage gap — flagging it would be a false target and forcing a test onto it would be metric-gaming",
    "observer/proposer only — feeds the existing self-improvement loop; no 2nd engine; fail-closed honesty flag on every report",
  ]),
});

module.exports = { COVERAGE, classifyModule, diagnoseCoverage, scanCore, CODEBASE_DIAGNOSTIC_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...CODEBASE_DIAGNOSTIC_CONTRACT, scan: scanCore() }, null, 2) + "\n"); }

export {};
