#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.

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

// --- AXE 1: excellence gate on the real route() selection decision ----------------------------------------------
inTempCwd((router) => {
    const NOW = "2026-10-27";
    // (a) valid selection + gate (no claims) ⇒ admit, chosen kept, excellence attached
    const a = router.route(TASK, { excellence: { now: NOW, registry: [] } });
    ok("AXE1 router: gated selection admits + keeps chosen", a.admit === true && !!a.chosen && !!a.excellence);
    // (b) PROHIBITED superlative claim ⇒ NOT admitted, chosen null (contract-honouring caller does NOT dispatch)
    const b = router.route({ ...TASK, claims: ["the world's best, number one capability"] }, { excellence: { now: NOW, registry: [] } });
    ok("AXE1 router: prohibited superlative ⇒ not admitted, chosen null (no dispatch)", b.admit === false && b.chosen === null);
    // (c) STALE reference ⇒ advisory, admit, chosen kept (offline-safe, non-blocking)
    const SREF = { id: "SEL-REF", authority: "ODG", domain: "capability-selection", version: "1.0", date: "2026-10-01", source: "ODG selection method", normativeStatus: "industry-practice", usageRights: "own", practicesAdopted: [], limits: [], nextReviewDate: "2020-01-01", verificationStatus: "offline-pending-reverify" };
    const c = router.route(TASK, { excellence: { now: NOW, registry: [SREF] } });
    ok("AXE1 router: stale reference ⇒ advisory, admit, chosen kept", c.admit === true && c.excellence.advisory === true && !!c.chosen);
    // (d) reviewer UNAVAILABLE ⇒ advisory, admit, chosen kept
    const d = router.route(TASK, { excellence: { now: NOW, registry: [], reviewer: () => { throw new Error("down"); } } });
    ok("AXE1 router: reviewer unavailable ⇒ advisory, admit, chosen kept", d.admit === true && d.excellence.reviewerErrored === true && !!d.chosen);
    // (e) NO excellence opts ⇒ EXACT legacy behaviour (no excellence field)
    const e = router.route(TASK);
    ok("AXE1 router: no opts ⇒ legacy (no excellence field)", e.excellence === undefined && e.admit === undefined && !!e.chosen);
});

console.log(`\nCAPABILITY ROUTER — ${passed} assertions passed.`);
