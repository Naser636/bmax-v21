#!/usr/bin/env node

/* P9 — Local Model Manager: behavioural test. */

"use strict";

const assert = require("assert");
const mm = require("./local-model-manager");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const saved = process.env.ODG_LOCAL_MODEL_CMD;

console.log("Case 1 — unconfigured ⇒ unavailable, complete() explains why");
delete process.env.ODG_LOCAL_MODEL_CMD;
ok("isAvailable false with no config", mm.isAvailable() === false);
const miss = mm.complete("hello");
ok("complete not ok", miss.ok === false);
ok("reason mentions configuration", /configured/.test(miss.reason));

console.log("Case 2 — configured local model runs as an executor");
process.env.ODG_LOCAL_MODEL_CMD = "tr '[:lower:]' '[:upper:]'"; // stand-in local model: uppercases the prompt
ok("isAvailable true when configured", mm.isAvailable() === true);
const hit = mm.complete("hello world");
ok("complete ok", hit.ok === true);
ok("local model transformed the prompt", hit.text === "HELLO WORLD");
ok("describe reflects availability", mm.describe().available === true);

if (saved === undefined) delete process.env.ODG_LOCAL_MODEL_CMD;
else process.env.ODG_LOCAL_MODEL_CMD = saved;

console.log(`\nLOCAL MODEL MANAGER — ${passed} assertions passed.`);
