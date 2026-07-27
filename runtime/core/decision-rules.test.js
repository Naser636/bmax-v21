#!/usr/bin/env node

/* P4 — Rule-based Decision Templates: behavioural test. */

"use strict";

const assert = require("assert");
const rules = require("./decision-rules");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

console.log("Case 1 — known goals map to local capabilities");
ok("unused import ⇒ local-fixers", rules.match("Remove the unused import from odg-run").capability === "local-fixers");
ok("... with the right fixer", rules.match("remove unused import").fixers.includes("removeUnusedNamedImports"));
ok("test goal ⇒ local-test-gate", rules.match("Run the local test suite").capability === "local-test-gate");
ok("checkpoint goal ⇒ checkpoint-engine", rules.match("Add a checkpoint").capability === "checkpoint-engine");
ok("runtime context goal ⇒ loader", rules.match("Guarantee the Runtime Context").capability === "runtime-context-loader");

console.log("Case 2 — matching is case-insensitive");
ok("UPPERCASE still matches", rules.match("FIX TRAILING WHITESPACE").capability === "local-fixers");

console.log("Case 3 — a miss returns null (falls through to next tier)");
ok("unknown goal ⇒ null", rules.match("invent a brand new payment provider") === null);

console.log(`\nDECISION RULES — ${passed} assertions passed.`);
