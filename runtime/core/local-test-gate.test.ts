#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.

/* P3 — Local Test Gate: behavioural test. */

"use strict";

// B-6 (V2 Pole B): drive a fast, REAL timeout — set the env ceiling BEFORE the module is required (the constant
// is read at load). 600ms is well above the immediate pass/fail fixtures and well below the hanging fixture.
process.env.ODG_LOCAL_TEST_TIMEOUT_MS = "600";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const gate = require("./local-test-gate");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ltg-test-"));
const pass = path.join(dir, "pass.js");
const fail = path.join(dir, "fail.js");
fs.writeFileSync(pass, "process.exit(0);\n");
fs.writeFileSync(fail, 'throw new Error("boom");\n');

console.log("Case 1 — a passing file is green");
const g1 = gate.gate(pass);
ok("gate ok on passing test", g1.ok === true);

console.log("Case 2 — a failing file is red");
const g2 = gate.gate([pass, fail]);
ok("gate not ok when any file fails", g2.ok === false);
ok("detail reports 1/2 failed", /1\/2/.test(g2.detail));

console.log("Case 3 — per-file results are reported");
const r = gate.runTests([pass, fail]);
ok("2 results returned", r.results.length === 2);
ok("failing file carries a non-zero code", r.results.find((x) => x.file === fail).code !== 0);

console.log("Case 4 — a HANGING test file is KILLED and reported as a timeout (fail-closed), not hung forever");
const hang = path.join(dir, "hang.js");
fs.writeFileSync(hang, "setInterval(() => {}, 1000);\n"); // never exits on its own
const started = Date.now();
const gh = gate.runTests(hang);
const elapsed = Date.now() - started;
ok("hanging file is NOT ok (fail-closed on timeout)", gh.results[0].ok === false);
ok("hanging file reported as TIMED OUT, not a silent hang", /TIMED OUT/.test(gh.results[0].error || ""));
ok("gate returned promptly (killed near the 600ms ceiling, not hung)", elapsed < 10000);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nLOCAL TEST GATE — ${passed} assertions passed.`);
