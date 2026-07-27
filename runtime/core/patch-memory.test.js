#!/usr/bin/env node

/*
 * P1 — Patch / Solution Memory: behavioural test (DON'T ASK AI FIRST).
 * Runs in a throwaway cwd so it writes its store there and never touches the real one.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

function inTempCwd(fn) {
    const prev = process.cwd();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-test-"));
    process.chdir(dir);
    try {
        for (const m of ["./patch-memory", "./autonomy-store"]) delete require.cache[require.resolve(m)];
        fn(require("./patch-memory"));
    } finally {
        process.chdir(prev);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const TASK = { rootCause: "unused-import", objectiveId: "OBJ_X", target: "runtime/bin/odg-run.js" };
const EDITS = [{ target: "runtime/bin/odg-run.js", diff: "@@ -1 +1 @@\n-a\n+b" }];

console.log("Case 1 — signature is stable and discriminating");
inTempCwd((pm) => {
    ok("same task ⇒ same signature", pm.signature(TASK) === pm.signature({ ...TASK }));
    ok("different target ⇒ different signature", pm.signature(TASK) !== pm.signature({ ...TASK, target: "x" }));
});

console.log("Case 2 — record then lookup replays the known solution");
inTempCwd((pm) => {
    ok("miss returns null before anything is learned", pm.lookup(TASK) === null);
    pm.record({ ...TASK, mission: "M1", edits: EDITS });
    const got = pm.lookup(TASK);
    ok("lookup returns the stored edits", JSON.stringify(got) === JSON.stringify(EDITS));
    ok("empty-edits record is rejected", (() => { try { pm.record({ ...TASK, edits: [] }); return false; } catch { return true; } })());
});

console.log("Case 3 — idempotent by signature + reuse counter");
inTempCwd((pm) => {
    pm.record({ ...TASK, mission: "M1", edits: EDITS });
    pm.record({ ...TASK, mission: "M1", edits: EDITS });
    ok("no duplicate entry for same signature", pm.list().length === 1);
    ok("hit() increments reuseCount", pm.hit(TASK) === 1 && pm.hit(TASK) === 2);
});

console.log(`\nPATCH MEMORY — ${passed} assertions passed.`);
