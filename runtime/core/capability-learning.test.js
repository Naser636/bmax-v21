#!/usr/bin/env node

/* P6 — Capability Learning Engine: behavioural test. Runs in a throwaway cwd. */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

function inTempCwd(fn) {
    const prev = process.cwd();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cl-test-"));
    process.chdir(dir);
    try {
        for (const m of ["./capability-learning", "./patch-memory", "./autonomy-store", "./decision-rules"]) {
            delete require.cache[require.resolve(m)];
        }
        fn(require("./capability-learning"), require("./patch-memory"));
    } finally {
        process.chdir(prev);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

console.log("Case 1 — a validated mission with edits is learned into Patch Memory");
inTempCwd((learning, pm) => {
    const r = learning.learn({
        mission: "M1",
        validated: true,
        objectives: [{ objectiveId: "OBJ_1", goal: "remove unused import", rootCause: "unused-import",
            edits: [{ target: "runtime/bin/odg-run.js", diff: "@@ -1 +1 @@\n-a\n+b" }] }],
    });
    ok("learn reports success", r.success === true);
    ok("one patch learned", r.learnedPatches.length === 1);
    ok("patch is now in Patch Memory", pm.list().length === 1);
    ok("outcome recorded with resolved capability", learning.outcomes()[0].capability === "local-fixers");
});

console.log("Case 2 — a failed mission records the failure, learns no patch");
inTempCwd((learning, pm) => {
    const r = learning.learn({ mission: "M2", validated: false,
        objectives: [{ objectiveId: "OBJ_2", goal: "run the tests", edits: [] }] });
    ok("no patch learned on failure", r.learnedPatches.length === 0);
    ok("failure outcome recorded", learning.outcomes()[0].success === false);
    ok("Patch Memory stays empty", pm.list().length === 0);
});

console.log(`\nCAPABILITY LEARNING — ${passed} assertions passed.`);
