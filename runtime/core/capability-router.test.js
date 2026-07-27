#!/usr/bin/env node

/* P8 — Local Capability Router: behavioural test (DON'T ASK AI FIRST). Runs in a throwaway cwd. */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

function inTempCwd(fn) {
    const prev = process.cwd();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-test-"));
    process.chdir(dir);
    try {
        for (const m of ["./capability-router", "./patch-memory", "./decision-rules", "./capability-metrics", "./autonomy-store"]) {
            delete require.cache[require.resolve(m)];
        }
        fn(require("./capability-router"), require("./patch-memory"));
    } finally {
        process.chdir(prev);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const TASK = { goal: "remove unused import", rootCause: "unused-import", objectiveId: "O1", target: "runtime/x.js" };

console.log("Case 1 — Memory wins when it has a known solution");
inTempCwd((router, pm) => {
    pm.record({ ...TASK, mission: "M0", edits: [{ target: "runtime/x.js", content: "y" }] });
    const r = router.route(TASK);
    ok("chosen tier is PATCH_MEMORY", r.chosen.tier === "PATCH_MEMORY");
    ok("external AI NOT used", r.usesExternalAI === false);
});

console.log("Case 2 — Rules resolve locally when Memory misses");
inTempCwd((router) => {
    const r = router.route(TASK); // nothing learned yet
    ok("chosen tier is RULES", r.chosen.tier === "RULES");
    ok("capability is local-fixers", r.chosen.capability === "local-fixers");
    ok("external AI NOT used", r.usesExternalAI === false);
});

console.log("Case 3 — Local LLM before External AI");
inTempCwd((router) => {
    const r = router.route({ goal: "invent a brand new payment provider" }, { localModelAvailable: true });
    ok("chosen tier is LOCAL_LLM", r.chosen.tier === "LOCAL_LLM");
    ok("external AI NOT used while a local model exists", r.usesExternalAI === false);
});

console.log("Case 4 — External AI only as last resort");
inTempCwd((router) => {
    const r = router.route({ goal: "invent a brand new payment provider" }, { localModelAvailable: false });
    ok("chosen tier is EXTERNAL_AI", r.chosen.tier === "EXTERNAL_AI");
    ok("it is flagged lastResort", r.chosen.lastResort === true);
    ok("plan always ends with External AI", r.plan[r.plan.length - 1].tier === "EXTERNAL_AI");
});

console.log(`\nCAPABILITY ROUTER — ${passed} assertions passed.`);
