#!/usr/bin/env node
"use strict";
/*
 * Tests for the affected-test selector (scripts/affected-tests.ts) — the migration-toolchain optimizer that
 * returns the minimal test set for a change so intermediate waves validate in seconds (full suite reserved
 * for integration points). Covers the static spec scanner (require + import + dynamic), relative resolution,
 * and the live main() behaviour on real changed files (dedicated + computed-path parity tests are caught).
 */
import assert from "assert";
const mod = require("./affected-tests.ts");
const { specifiersOf, resolveRel, main } = mod;
let passed = 0;
function ok(name: string, cond: boolean) { assert.ok(cond, name); console.log("  ok -", name); passed++; }

// ---- specifiersOf: CJS require + ESM import/export-from + dynamic import, with dyn flag ----
{
  // Use this very test file: it has `require("./affected-tests.ts")` + `import ... from "assert"`.
  const r = specifiersOf(process.cwd() + "/scripts/affected-tests.test.ts");
  ok("specifiersOf: captures require() specifier", r.specs.includes("./affected-tests.ts"));
  ok("specifiersOf: captures ESM import-from specifier", r.specs.includes("assert"));
}
// Dynamic require is flagged — the dual-port parity tests use require(path.join(...)) (non-literal arg).
{
  const r = specifiersOf(process.cwd() + "/runtime/core/scripts-dualport-parity.test.js");
  ok("specifiersOf: dyn flag set when a non-literal require(path.join(...)) is present", r.dyn === true);
  const lit = specifiersOf(process.cwd() + "/scripts/affected-tests.ts");
  ok("specifiersOf: dyn flag false when all requires are string literals", lit.dyn === false);
}

// ---- resolveRel: relative specifier → repo-relative no-ext; bare/alias → null ----
ok("resolveRel: relative resolves against the file dir", resolveRel("runtime/core/x.test.js", "./y") === "runtime/core/y");
ok("resolveRel: parent-relative resolves", resolveRel("runtime/core/x.test.js", "../bin/z") === "runtime/bin/z");
ok("resolveRel: bare/package specifier → null", resolveRel("runtime/core/x.test.js", "assert") === null);

// ---- main(): real changed file → its dedicated test AND its computed-path parity test ----
{
  const saved = process.argv;
  process.argv = ["node", "affected-tests.ts", "scripts/odg-autonomy-benchmark.ts"];
  const r = main();
  process.argv = saved;
  ok("main: recommendation TARGETED for an isolated leaf script", r.recommendation === "TARGETED");
  ok("main: includes the dedicated test", r.affected.includes("scripts/odg-autonomy-benchmark.test.ts"));
  ok("main: includes the computed-path dual-port parity test (raw-token match)", r.affected.includes("runtime/core/scripts-dualport-parity.test.js"));
  ok("main: speedup > 1 (targeted set smaller than the universe)", typeof r.speedup === "number" && r.speedup > 1 && r.universeCount > r.affected.length);
}

// ---- main(): no changed files → NONE (no-op) ----
{
  const saved = process.argv;
  process.argv = ["node", "affected-tests.ts"];
  const r = main();
  process.argv = saved;
  ok("main: empty input → NONE", r.recommendation === "NONE" && r.affected.length === 0);
}

console.log(`\naffected-tests selector — ${passed} assertions passed.`);
