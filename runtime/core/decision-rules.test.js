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

console.log("Case 4 — local system capabilities resolve LOCAL (incl. FR 'dépôt' vocabulary)");
ok("diagnostic ⇒ self-diagnostic", rules.match("run a governed diagnostic").capability === "self-diagnostic");
ok("repository state ⇒ runtime-context-loader", rules.match("inspect the repository state").capability === "runtime-context-loader");
ok("FR état actuel du dépôt ⇒ runtime-context-loader", rules.match("état actuel du dépôt").capability === "runtime-context-loader");
ok("known Git request ⇒ Governed Git Branch Integration", rules.match("integrate the feature branch into main").capability === "Governed Git Branch Integration");
ok("known Bash command ⇒ Governed Bash/Linux Command", rules.match("run the ls command").capability === "Governed Bash/Linux Command");

console.log("Case 5 — runtime-internal audit/convergence vocabulary resolves LOCAL (not external-ai)");
ok("audit ⇒ self-diagnostic", rules.match("audit the carnet for false success").capability === "self-diagnostic");
ok("false+success ⇒ self-diagnostic", rules.match("find false-success in mission records").capability === "self-diagnostic");
ok("honest ⇒ self-diagnostic", rules.match("verify the runtime state is honest").capability === "self-diagnostic");
ok("converged ⇒ runtime-context-loader", rules.match("check whether the system converged").capability === "runtime-context-loader");
ok("connectivity audit still ⇒ Connectivity Audit (first-match preserved)", rules.match("run a connectivity audit").capability === "Connectivity Audit");

console.log("Case 6 — a genuine provider need is NOT captured (stays null ⇒ external-ai last resort)");
ok("novel prose ⇒ null", rules.match("ask an LLM to write novel prose") === null);
ok("brand new payment provider ⇒ null", rules.match("invent a brand new payment provider") === null);

console.log(`\nDECISION RULES — ${passed} assertions passed.`);
