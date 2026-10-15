#!/usr/bin/env node

/*
 * Checkpoint Engine — self-contained behavioural test.
 *
 * Asserts the RESUME CONTRACT, not the implementation:
 *   1. fresh-start      — a first-ever run opens at stage 0 with a captured rollback anchor.
 *   2. resume-after-cut — a run interrupted after k DONE stages resumes at k (proven-DONE prefix
 *                         skipped), from the on-disk checkpoint alone.
 *   3. complete-is-fresh— once a mission is COMPLETE, the next run of the SAME mission starts over.
 *   4. different-work   — a different mission, or a changed stage list, is never treated as resumable.
 *   5. failed-is-fresh  — a FAILED run is NEVER resumed on its DONE prefix: the next run starts over
 *                         (RC-2 — DONE marks control flow, not a re-proven effect).
 *
 * Runs in a throwaway cwd so it writes its checkpoint there and never touches the real one.
 * Deterministic: no wall-clock in any assertion.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

let passed = 0;
function ok(name, cond) {
    assert.ok(cond, name);
    console.log("  ok -", name);
    passed += 1;
}

const STAGES = ["Mission Loader", "Decision Engine", "Patch Executor", "Validation Engine"];

// Each case runs in its own temp cwd. The engine resolves its relative CHECKPOINT_PATH against the
// current cwd at every fs call, so chdir fully isolates the on-disk state.
function inTempCwd(fn) {
    const prev = process.cwd();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-test-"));
    process.chdir(dir);
    try {
        // Fresh require each case so no cross-case module state can leak.
        delete require.cache[require.resolve("./checkpoint-engine")];
        fn(require("./checkpoint-engine"));
    } finally {
        process.chdir(prev);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// --- Case 1: fresh start ----------------------------------------------------
console.log("Case 1 — fresh start (no prior checkpoint)");
inTempCwd((cp) => {
    const { cp: state, resumeIndex } = cp.begin("MISSION_A", STAGES);
    ok("resumeIndex is 0 on a first-ever run", resumeIndex === 0);
    ok("status is RUNNING", state.status === "RUNNING");
    ok("all stages start PENDING", state.stages.every((s) => s.status === "PENDING"));
    ok("rollback anchor object present", state.rollback && "head" in state.rollback);
    ok("checkpoint persisted to disk", fs.existsSync(cp.CHECKPOINT_PATH));
});

// --- Case 2: resume after an interruption -----------------------------------
console.log("Case 2 — resume after cut (k DONE stages skipped)");
inTempCwd((cp) => {
    let { cp: state } = cp.begin("MISSION_A", STAGES);
    state = cp.stageRunning(state, 0);
    state = cp.stageDone(state, 0);
    state = cp.stageRunning(state, 1);
    state = cp.stageDone(state, 1);
    state = cp.stageRunning(state, 2); // interrupted here (never marked DONE)
    cp.interrupt(state, "SIGTERM");

    const reloaded = cp.load();
    ok("interrupt persisted INTERRUPTED status", reloaded.status === "INTERRUPTED");
    ok("progress reflects 2 DONE", reloaded.progress === "2/4");

    // Next run of the same mission with the same stage list resumes at the first non-DONE stage.
    const { resumeIndex } = cp.begin("MISSION_A", STAGES);
    ok("resumeIndex is 2 (skips the two proven-DONE stages)", resumeIndex === 2);
    ok("interrupted stage (index 2) re-runs, not the DONE prefix", resumeIndex === 2);
});

// --- Case 3: a COMPLETE mission starts fresh --------------------------------
console.log("Case 3 — COMPLETE mission is not resumed");
inTempCwd((cp) => {
    let { cp: state } = cp.begin("MISSION_A", STAGES);
    cp.complete(state);
    ok("status COMPLETE after complete()", cp.load().status === "COMPLETE");
    const { resumeIndex } = cp.begin("MISSION_A", STAGES);
    ok("resumeIndex is 0 — a finished mission runs from the start", resumeIndex === 0);
});

// --- Case 4: different work is never resumable ------------------------------
console.log("Case 4 — different mission / changed stage list is a fresh start");
inTempCwd((cp) => {
    let { cp: state } = cp.begin("MISSION_A", STAGES);
    state = cp.stageDone(cp.stageRunning(state, 0), 0);
    cp.interrupt(state, "SIGINT");

    ok("different mission ⇒ resumeIndex 0", cp.begin("MISSION_B", STAGES).resumeIndex === 0);
    // Re-establish MISSION_A's interrupted checkpoint (begin above overwrote it for MISSION_B).
    let { cp: s2 } = cp.begin("MISSION_A", STAGES);
    s2 = cp.stageDone(cp.stageRunning(s2, 0), 0);
    cp.interrupt(s2, "SIGINT");
    const changedStages = STAGES.slice(0, 3);
    ok("changed stage list ⇒ resumeIndex 0", cp.begin("MISSION_A", changedStages).resumeIndex === 0);
});

// --- Case 5: a FAILED mission is NOT resumed on its DONE prefix (RC-2) ------
console.log("Case 5 — FAILED mission is not resumed (RC-2: no trust in the DONE prefix)");
inTempCwd((cp) => {
    let { cp: state } = cp.begin("MISSION_A", STAGES);
    state = cp.stageRunning(state, 0);
    state = cp.stageDone(state, 0);
    state = cp.stageRunning(state, 1);
    state = cp.stageDone(state, 1);
    state = cp.stageRunning(state, 2);          // Validation Engine runs ...
    state = cp.stageFailed(state, 2, "Validation Engine BLOCKED"); // ... and fails.

    const reloaded = cp.load();
    ok("stageFailed persisted FAILED status", reloaded.status === "FAILED");
    ok("two stages are still recorded DONE on disk", reloaded.completed.length === 2);

    // RC-2: the next run of the SAME mission with the SAME stage list must NOT trust that DONE prefix.
    const { cp: restarted, resumeIndex } = cp.begin("MISSION_A", STAGES);
    ok("resumeIndex is 0 — FAILED is not resumed on its DONE prefix", resumeIndex === 0);
    ok("restart re-opens every stage PENDING (clean fresh start)", restarted.stages.every((s) => s.status === "PENDING"));
    ok("restart status is RUNNING (a fresh checkpoint, not the old FAILED one)", restarted.status === "RUNNING");
});

// WI-2 — baseline-relative dirty classification (pure; the CTO invariant is proven here).
console.log("WI-2 — baseline-relative dirty classification");
inTempCwd((cp) => {
    const h = (x) => "sha256:" + x; // stand-in content hashes (the classifier compares equality only).
    // Scenario: the tree carries pre-existing operator work; the mission edits one in-scope file and
    // also FURTHER modifies a pre-existing file that is OUTSIDE its authorized scope.
    const baseline = {
        "runtime/bin/odg-state.js": h("A"),       // pre-existing, untouched by the mission
        "src/runtime/autonomy-runtime-adapter.ts": h("B"), // pre-existing, will be re-modified below
    };
    const current = {
        "runtime/bin/odg-state.js": h("A"),       // identical ⇒ preserved pre-existing work
        "src/runtime/autonomy-runtime-adapter.ts": h("B2"), // CONTENT CHANGED by the mission (out of scope)
        "runtime/core/widget.js": h("N"),         // NEW file, inside the mission's authorized scope
    };
    const c = cp.classifyDirty({ current, baseline, authorizedPaths: ["runtime/core/widget.js"] });

    ok("pre-existing UNTOUCHED file is NOT charged to the mission",
        c.preExisting.includes("runtime/bin/odg-state.js") && !c.missionTouched.includes("runtime/bin/odg-state.js"));
    ok("CTO invariant: a pre-existing file FURTHER modified out-of-scope is UNEXPECTED (not a licence)",
        c.unexpected.includes("src/runtime/autonomy-runtime-adapter.ts"));
    ok("a new in-scope file is the mission deliverable (in scope, not unexpected)",
        c.inScope.includes("runtime/core/widget.js") && !c.unexpected.includes("runtime/core/widget.js"));
    ok("verdict OUTSIDE when any mission-touched path is out of scope", cp.verdictOf(c) === "OUTSIDE");

    // Only pre-existing dirt, nothing mission-produced ⇒ CLEAN relative to baseline ⇒ SUCCESS.
    const cleanRel = cp.classifyDirty({ current: { "a.js": h("A") }, baseline: { "a.js": h("A") }, authorizedPaths: [] });
    ok("all-pre-existing ⇒ nothing mission-touched", cleanRel.missionTouched.length === 0);
    ok("verdict CLEAN when the mission produced no dirt", cp.verdictOf(cleanRel) === "CLEAN");

    // In-scope deliverable only ⇒ PENDING_COMMIT (awaits the human commit gate).
    const pending = cp.classifyDirty({ current: { "runtime/core/x.js": h("N") }, baseline: {}, authorizedPaths: ["runtime/core/"] });
    ok("verdict PENDING_COMMIT for an in-scope deliverable", cp.verdictOf(pending) === "PENDING_COMMIT");

    // Empty baseline ⇒ byte-identical to the pre-WI-2 behaviour (no subtraction): every dirty path is
    // mission-touched and classified against scope exactly as before. Guarantees FINALIZE_* is unchanged.
    const noBase = cp.classifyDirty({ current: { "p.js": h("Z") }, baseline: {}, authorizedPaths: [] });
    ok("empty baseline + no scope ⇒ OUTSIDE (legacy behaviour preserved)", cp.verdictOf(noBase) === "OUTSIDE");

    // Rename porcelain parsing picks the NEW path; untracked "?? p" and modified " M p" are handled.
    const parsed = cp.parsePorcelainPaths(" M a.js\n?? b.js\nR  old.js -> new.js");
    ok("porcelain parse: modified/untracked/rename(new)", JSON.stringify(parsed) === JSON.stringify(["a.js", "b.js", "new.js"]));
});

console.log(`\nCHECKPOINT ENGINE — ${passed} assertions passed.`);
