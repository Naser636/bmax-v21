#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.

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

console.log("Case 2b — lookupFresh gates reuse on FORWARD validity (V324 §6.3); lookup() unchanged");
inTempCwd((pm) => {
    ok("lookupFresh miss ⇒ null", pm.lookupFresh(TASK, {}) === null);
    pm.record({ ...TASK, mission: "M1", authoredBy: "odg-native", edits: EDITS });
    const rec = pm.recall(TASK);
    const asOf = Date.parse(rec.learnedAt) + 86400000; // 1 day after it was learned (deterministic time base)
    const fresh = pm.lookupFresh(TASK, { asOfMs: asOf, changedPaths: [] });
    ok("fresh + provenanced + drift-clean ⇒ REUSABLE_AS_PROVEN, reusableAsProven true, edits returned",
        fresh.validity.verdict === "REUSABLE_AS_PROVEN" && fresh.reusableAsProven === true && JSON.stringify(fresh.edits) === JSON.stringify(EDITS));
    const changed = pm.lookupFresh(TASK, { asOfMs: asOf, changedPaths: [EDITS[0].target] });
    ok("the edited file changed since learned ⇒ REQUIRES_REVALIDATION, not reusable-as-proven",
        changed.validity.verdict === "REQUIRES_REVALIDATION" && changed.reusableAsProven === false);
    ok("prior net-regression (suppressed) ⇒ STALE", pm.lookupFresh(TASK, { asOfMs: asOf, changedPaths: [], suppressed: true }).validity.verdict === "STALE");
    ok("no freshness signals ⇒ REQUIRES_REVALIDATION (fail-closed: remembered ≠ valid today)", pm.lookupFresh(TASK, {}).reusableAsProven === false);
    const unknownProv = (() => { pm.record({ ...TASK, target: "x/y.js", mission: "M2", edits: [{ target: "x/y.js", diff: "d" }] }); const r = pm.recall({ ...TASK, target: "x/y.js" }); return pm.lookupFresh({ ...TASK, target: "x/y.js" }, { asOfMs: Date.parse(r.learnedAt) + 1, changedPaths: [] }); })();
    ok("UNKNOWN provenance record ⇒ REQUIRES_REVALIDATION (never auto-reused)", unknownProv.validity.verdict === "REQUIRES_REVALIDATION" && unknownProv.authoredBy === "UNKNOWN");
    ok("lookup() UNCHANGED (still returns raw edits — non-breaking)", JSON.stringify(pm.lookup(TASK)) === JSON.stringify(EDITS));
});

console.log("Case 3 — idempotent by signature + reuse counter");
inTempCwd((pm) => {
    pm.record({ ...TASK, mission: "M1", edits: EDITS });
    pm.record({ ...TASK, mission: "M1", edits: EDITS });
    ok("no duplicate entry for same signature", pm.list().length === 1);
    ok("hit() increments reuseCount", pm.hit(TASK) === 1 && pm.hit(TASK) === 2);
});

console.log("Case 4 — inter-mission reuse: the goal is the key, the objective id is NOT");
inTempCwd((pm) => {
    // A solution proven under mission A's objective is reusable from mission B for the SAME problem
    // (goal), even though every mission labels its objectives <MISSION>_<n> (so the ids never match).
    const learned = { goal: "add governed telemetry flag", objectiveId: "MISSION_A_1" };
    const want = { goal: "add governed telemetry flag", objectiveId: "MISSION_B_1" };
    ok("same goal, different objective id ⇒ same signature", pm.signature(learned) === pm.signature(want));
    pm.record({ ...learned, mission: "MISSION_A", edits: EDITS });
    ok("lookup from a different mission's objective replays the proven edits",
        JSON.stringify(pm.lookup(want)) === JSON.stringify(EDITS));
    ok("a different goal does NOT reuse", pm.lookup({ goal: "unrelated problem", objectiveId: "MISSION_B_2" }) === null);
    ok("goal key is whitespace/case-insensitive", pm.signature({ goal: "  Add   Governed Telemetry FLAG " }) === pm.signature({ goal: "add governed telemetry flag" }));
});

console.log(`\nPATCH MEMORY — ${passed} assertions passed.`);
