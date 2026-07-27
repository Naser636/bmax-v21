#!/usr/bin/env node

/* P3 — Local Test Gate: behavioural test. */

"use strict";

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

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nLOCAL TEST GATE — ${passed} assertions passed.`);
