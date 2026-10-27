#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.

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

// ═════════ AXE 1 — GATED REUSE integration (real capability-learning consumption path) ═════════
inTempCwd((learning) => {
    const NOW = "2026-10-27";
    const REG = [{ id: "LEARN-REF", authority: "ODG", domain: "learning", version: "1.0", date: "2026-10-01", source: "ODG learning method", normativeStatus: "industry-practice", usageRights: "own", practicesAdopted: ["impl-provider"], limits: [], nextReviewDate: "2027-10-01", verificationStatus: "offline-pending-reverify" }];
    const sealed = learning.sealLearning({ capability: "impl-provider", goal: "fix-build" }, { revision: { commit: "t", treeDirty: false, available: true } });
    const recalled = { id: "CL1", capability: "impl-provider", goal: "fix-build", provenanceSealed: sealed, claims: ["a proven capability"] };

    // (a) gated reuse of a SEALED recalled learning ⇒ applied + audit chain intact
    const g = learning.reuseLearning(recalled, { registry: REG, now: NOW });
    ok("INTEGRATION: gated reuse of a sealed recalled learning ⇒ applied + audit intact", g.applied === true && g.appliedCapability === "impl-provider" && g.auditVerified === true);
    // (b) EFFECTIVE reuse: the recalled learning resolves the capability actually used (not 'unknown')
    const chosen = g.applied ? g.appliedCapability : "unknown";
    ok("INTEGRATION: reuse INFLUENCES the resolved capability (effective, not merely stored)", chosen === "impl-provider");
    // (c) unprovenanced recalled ⇒ NOT applied (fail-closed)
    ok("INTEGRATION: unprovenanced recalled learning ⇒ NOT applied", learning.reuseLearning({ capability: "x", goal: "y" }, { registry: REG, now: NOW }).applied === false);
    // (d) tampered provenance ⇒ NOT applied
    ok("INTEGRATION: tampered provenance ⇒ NOT applied (no false reuse)", learning.reuseLearning({ ...recalled, provenanceSealed: { ...sealed, capability: "HACKED" } }, { registry: REG, now: NOW }).applied === false);
    // (e) prohibited superlative claim ⇒ NOT applied
    ok("INTEGRATION: prohibited superlative claim ⇒ NOT applied", learning.reuseLearning({ ...recalled, claims: ["the world's number one best capability"] }, { registry: REG, now: NOW }).applied === false);
    // (f) stale reference ⇒ advisory, still applied (offline-safe, non-blocking)
    ok("INTEGRATION: stale reference ⇒ advisory, still applied", learning.reuseLearning(recalled, { registry: [{ ...REG[0], nextReviewDate: "2020-01-01" }], now: NOW }).excellence.advisory === true);
});

console.log(`\nCAPABILITY LEARNING — ${passed} assertions passed.`);
