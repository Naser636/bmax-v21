#!/usr/bin/env node
/*
 * Full-suite test runner (audit tool).
 *
 * The project's tests are standalone tsx scripts that use console.assert (which
 * does NOT throw or change the exit code) plus occasional throws. A test is
 * considered FAILED if, when run under tsx, it either:
 *   - exits with a non-zero status (an uncaught throw), or
 *   - prints "Assertion failed" on stdout/stderr (a console.assert violation).
 * Everything else is a PASS. Prints a summary and exits non-zero on any failure.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const TESTS_DIR = path.join(ROOT, "src", "tests");
const tsx = path.join(ROOT, "node_modules", ".bin", "tsx");

const files = fs
  .readdirSync(TESTS_DIR)
  .filter((f) => f.endsWith(".test.ts"))
  .sort();

const failures = [];
let passed = 0;

for (const f of files) {
  const full = path.join(TESTS_DIR, f);
  const r = spawnSync(tsx, [full], { cwd: ROOT, encoding: "utf8", timeout: 180000 });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const assertionFailed = /Assertion failed/.test(out);
  const badExit = r.status !== 0;
  if (assertionFailed || badExit) {
    failures.push({ f, status: r.status, assertionFailed, tail: out.trim().split(/\r?\n/).slice(-6).join("\n") });
    process.stdout.write("F");
  } else {
    passed++;
    process.stdout.write(".");
  }
}

process.stdout.write("\n\n");
console.log(`TOTAL: ${files.length}  PASSED: ${passed}  FAILED: ${failures.length}`);
if (failures.length > 0) {
  console.log("\n=== FAILURES ===");
  for (const x of failures) {
    console.log(`\n--- ${x.f} (exit=${x.status}, assertionFailed=${x.assertionFailed}) ---`);
    console.log(x.tail);
  }
  process.exit(1);
}
console.log("ALL TESTS PASSED");
