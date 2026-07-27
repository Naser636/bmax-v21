#!/usr/bin/env node

/* P5 — Local Mission Synthesizer: behavioural test. */

"use strict";

const assert = require("assert");
const syn = require("./mission-synthesizer");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

console.log("Case 1 — explicit spec ⇒ valid engineering contract");
const c = syn.toContract({
    id: "SYN_A",
    goal: "Wire the loader",
    authorizedPaths: ["runtime/bin/"],
    patch: { target: "runtime/bin/odg-run.js", diff: "@@ -1 +1 @@\n-a\n+b" },
});
ok("contract is structurally valid", syn.isValidContract(c) === true);
ok("engineering mode enabled by authorized_paths", c.requires_engineering === true);
ok("objective carries the patch payload", c.objectives[0].patch.target === "runtime/bin/odg-run.js");
ok("default done_when supplied", c.objectives[0].done_when.length >= 2);

console.log("Case 2 — read-only spec has engineering off");
ok("no authorized_paths ⇒ requires_engineering false", syn.toContract({ goal: "just look" }).requires_engineering === false);

console.log("Case 3 — fromRequest resolves the local capability via P4 rules");
const r = syn.fromRequest("remove the unused import");
ok("request becomes a valid contract", syn.isValidContract(r) === true);
ok("resolved to local-fixers (no AI)", r.resolvedCapability === "local-fixers");
ok("unknown request resolves to null capability", syn.fromRequest("invent a new payment provider").resolvedCapability === null);

console.log(`\nMISSION SYNTHESIZER — ${passed} assertions passed.`);
