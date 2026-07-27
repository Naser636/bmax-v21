#!/usr/bin/env node

/*
 * Local-First Autonomy Facade: end-to-end integration test of the P1–P10 stack.
 * Proves the permanent architecture: request → mission → local-first route → learn, external AI last.
 * Runs in a throwaway cwd (isolated stores).
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "la-test-"));
    process.chdir(dir);
    try {
        for (const m of ["./local-autonomy", "./mission-synthesizer", "./capability-router", "./capability-learning",
            "./capability-factory", "./patch-memory", "./decision-rules", "./capability-metrics", "./autonomy-store"]) {
            delete require.cache[require.resolve(m)];
        }
        delete process.env.ODG_LOCAL_MODEL_CMD;
        fn(require("./local-autonomy"));
    } finally {
        process.chdir(prev);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

console.log("Case 1 — NL request resolves locally via Rules, no external AI");
inTempCwd((odg) => {
    const r = odg.handle("Please remove the unused import from odg-run");
    ok("request became a valid mission contract", Array.isArray(r.contract.objectives) && r.contract.objectives.length === 1);
    ok("routed to a LOCAL tier", r.decision.chosen.source === "LOCAL");
    ok("external AI NOT used", r.usesExternalAI === false);
});

console.log("Case 2 — learning closes the loop: the same problem (same location) hits Patch Memory");
inTempCwd((odg) => {
    // A mission runs and is learned: unused-import fixed at runtime/x.js (Patch Memory keyed by
    // rootCause|objective|target).
    odg.complete({ mission: "M1", validated: true, objectives: [{
        objectiveId: "REMOVE_THE_UNUSED_IMPORT_1", goal: "remove the unused import", rootCause: "unused-import",
        edits: [{ target: "runtime/x.js", content: "y" }] }] });
    // The same problem recurs at the same known location → the Router replays the learned patch.
    const r = odg.handle("remove the unused import", {
        rootCause: "unused-import",
        spec: { patch: { target: "runtime/x.js", content: "y" }, authorizedPaths: ["runtime/"] },
    });
    ok("now served from Memory (learned)", r.decision.chosen.tier === "PATCH_MEMORY");
    ok("still no external AI", r.usesExternalAI === false);
});

console.log("Case 3 — unknown request: manufacture a local capability instead of external AI");
inTempCwd((odg) => {
    const noFactory = odg.handle("invent a brand new payment provider");
    ok("without a local option it would reach external AI", noFactory.usesExternalAI === true);
    const withFactory = odg.handle("invent a brand new payment provider", { manufactureIfMissing: true });
    ok("a local capability was manufactured (P10)", withFactory.manufactured && withFactory.manufactured.registered === true);
    ok("external AI avoided by manufacturing locally", withFactory.usesExternalAI === false);
});

console.log(`\nLOCAL AUTONOMY FACADE — ${passed} assertions passed.`);
