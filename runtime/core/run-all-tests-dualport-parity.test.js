#!/usr/bin/env node
"use strict";
/*
 * run-all-tests DUAL-PORT PARITY (CTO Wave 3) — JS rollback (runtime/scripts/run-all-tests.js) vs compiled-
 * TS default (runtime/dist/scripts/run-all-tests.js). An audit tool that spawns every src/tests/*.test.ts
 * under tsx — HEAVY, so the real whole-suite run is NEVER invoked here. The migration added two seams to
 * BOTH ports: execution guarded under require.main (so requiring it runs nothing), the pure FAIL classifier
 * exported as `isFailure`, and a RUNALL_TESTS_DIR override. Parity is proven by:
 *   - isFailure() compared directly on fixtures (the FAIL decision: non-zero exit OR "Assertion failed");
 *   - a BOUNDED live run of each port against a 2-file temp tests dir (one pass, one throw) via
 *     RUNALL_TESTS_DIR — identical exit + identical stdout, proving dist-path (ROOT=cwd) resolution and the
 *     pass/fail tallying without running the real suite.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }
const JS = path.join(REPO, "runtime", "scripts", "run-all-tests.js");
const TS = path.join(REPO, "runtime", "dist", "scripts", "run-all-tests.js");
const js = require(JS), ts = require(TS);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- API + guarded load (requiring the module did NOT run the suite — we got here) ----
ok("run-all-tests: identical export API (isFailure, main)", eq(Object.keys(js).sort(), Object.keys(ts).sort()) && typeof js.isFailure === "function" && typeof js.main === "function");

// ---- isFailure: the pure FAIL classifier ----
{
  const cases = [
    ["all good", 0],                 // pass
    ["Assertion failed: x", 0],      // console.assert violation ⇒ fail despite exit 0
    ["boom", 1],                     // uncaught throw ⇒ fail
    ["", null],                      // null status (spawn error) ⇒ fail
    ["clean output\nAll OK", 0],     // pass
  ];
  for (const [out, status] of cases) ok(`isFailure parity — out=${JSON.stringify(out.slice(0, 16))} status=${status}`, js.isFailure(out, status) === ts.isFailure(out, status));
  ok("isFailure non-vacuous (pass=false, assertion=true, badexit=true, null=true)",
    js.isFailure("ok", 0) === false && js.isFailure("Assertion failed", 0) === true && js.isFailure("x", 2) === true && js.isFailure("", null) === true);
}

// ---- BOUNDED live run via RUNALL_TESTS_DIR (2 tiny tests: one pass, one throw) ----
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runall-par-"));
  fs.writeFileSync(path.join(dir, "a-pass.test.ts"), 'console.log("A ok");\n');            // exit 0, no "Assertion failed"
  fs.writeFileSync(path.join(dir, "b-fail.test.ts"), 'throw new Error("B boom");\n');       // uncaught throw ⇒ exit 1
  const run = (script) => cp.spawnSync(process.execPath, [script], { cwd: REPO, encoding: "utf8", timeout: 120000, env: { ...process.env, RUNALL_TESTS_DIR: dir } });
  const rj = run(JS), rt = run(TS);
  fs.rmSync(dir, { recursive: true, force: true });
  const norm = (s) => String(s || "").replace(/exit=\d+/g, "exit=<N>").replace(/Error:.*$/gm, "Error:<msg>").replace(/\s+at .*$/gm, "");
  ok("run-all-tests live: same exit (1 — one test fails)", rj.status === 1 && rt.status === 1);
  ok("run-all-tests live: identical stdout tally (TOTAL 2 / PASSED 1 / FAILED 1)", norm(rj.stdout) === norm(rt.stdout) && /TOTAL: 2 {2}PASSED: 1 {2}FAILED: 1/.test(rj.stdout));
}

console.log(`\nrun-all-tests dual-port parity — ${passed} assertions passed.`);
