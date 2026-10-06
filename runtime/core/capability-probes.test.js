#!/usr/bin/env node

/* Capability Probe Framework — behavioural test.
 *
 * Proves the framework is a real, looked-up registry (not an inline switch), that the required-proof
 * gate BLOCKS when a required proof is missing while optional proofs never block, and that the
 * `internet-reachable` probe proves the Connectivity Audit connector's evidence (reusing the
 * existing Provider/Connector architecture) rather than re-implementing network I/O.
 *
 * Deterministic and network-independent: every probe here reads generated artifacts in a throwaway
 * cwd. */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const MODULE = path.resolve(__dirname, "capability-probes.js");

function inTempCwd(fn) {
    const prev = process.cwd();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "capprobe-test-"));
    process.chdir(dir);
    try {
        delete require.cache[MODULE];
        const mod = require(MODULE);
        fs.mkdirSync("runtime/generated", { recursive: true });
        fn(mod, dir);
    } finally {
        process.chdir(prev);
    }
}

function writeAudit(reachable) {
    fs.writeFileSync(
        "runtime/generated/connectivity-audit.json",
        JSON.stringify({ capability: "Connectivity Audit", internet: { reachable }, summary: { http: "1/2 reachable" } })
    );
}

// 1. The framework is a real registry, and unknown proofs are treated as NOT proven.
inTempCwd((mod) => {
    ok("PROBES is a registry object", mod.PROBES && typeof mod.PROBES === "object");
    ok("registry exposes the internet-reachable probe", typeof mod.PROBES["internet-reachable"] === "function");
    const unknown = mod.runProbe("no-such-probe", {});
    ok("unknown probe returns not-ok", unknown.ok === false && /unknown evidence probe/.test(unknown.detail));
});

// 2. internet-reachable reuses the Connectivity Audit connector's evidence.
inTempCwd((mod) => {
    let r = mod.runProbe("internet-reachable", {});
    ok("no audit evidence → required proof MISSING (not ok)", r.ok === false && /Connectivity Audit evidence/.test(r.detail));

    writeAudit(true);
    r = mod.runProbe("internet-reachable", {});
    ok("audit reachable=true → proven", r.ok === true);

    writeAudit(false);
    r = mod.runProbe("internet-reachable", {});
    ok("audit reachable=false → not proven", r.ok === false && /NOT reachable/.test(r.detail));
});

// 3. Required-proof gate: a missing REQUIRED proof blocks; an optional one never does.
inTempCwd((mod) => {
    // internet not exercised yet (no evidence) → required internet proof is missing.
    const required = mod.evaluate(
        [{ capability: "Internet", evidence: "internet-reachable" }],
        {}
    );
    ok("required missing proof → evaluate.ok is false", required.ok === false);
    ok("the missing required proof is reported", required.missingRequired.length === 1 && required.missingRequired[0].capability === "Internet");
    ok("result marks it required by default", required.results[0].required === true);

    // Same failing proof declared optional → does NOT block.
    const optional = mod.evaluate(
        [{ capability: "Internet", evidence: "internet-reachable", required: false }],
        {}
    );
    ok("optional failing proof → evaluate.ok stays true", optional.ok === true);
    ok("optional proof still recorded as not-ok", optional.results[0].ok === false && optional.results[0].required === false);

    // Once the connector produces reachable evidence, the required proof passes.
    writeAudit(true);
    const met = mod.evaluate([{ capability: "Internet", evidence: "internet-reachable" }], {});
    ok("required proof satisfied by connector evidence → evaluate.ok is true", met.ok === true && met.missingRequired.length === 0);
});

// 4. A ctx-driven delegated probe still works through the registry (build-green).
inTempCwd((mod) => {
    ok("build-green ok when verify.build=true", mod.runProbe("build-green", { verify: { build: true } }).ok === true);
    ok("build-green fails when verify absent", mod.runProbe("build-green", {}).ok === false);
    const none = mod.evaluate([], {});
    ok("no declared proofs → no gate (ok, none missing)", none.ok === true && none.results.length === 0);
});

// 5. capability-probes-finalized proves the framework's own finalization against the real repo tree
// (registry present + exported, wired into the Validation Engine and the Contract Factory).
(function () {
    const prev = process.cwd();
    const repoRoot = path.resolve(__dirname, "..", "..");
    process.chdir(repoRoot);
    try {
        delete require.cache[MODULE];
        const mod = require(MODULE);
        const r = mod.runProbe("capability-probes-finalized", {});
        ok("capability-probes-finalized proven in the real tree", r.ok === true);
        ok("finalization detail names the registered probe count", /registered probes/.test(r.detail));
        const gate = mod.evaluate([{ capability: "Capability Probe Framework", evidence: "capability-probes-finalized" }], {});
        ok("declared as a required proof → evaluate.ok is true", gate.ok === true && gate.missingRequired.length === 0);
    } finally {
        process.chdir(prev);
    }
})();

// --- research-acquired probe: evidence-only, provenance/hash/2xx/citation, NO connectivity fallback ---
const HASH64 = "a".repeat(64);
function writeResearch(obj) {
    fs.writeFileSync("runtime/generated/external-research-acquisition.json", JSON.stringify(obj, null, 2));
}
function validResearch() {
    return {
        capability: "External Research Acquisition",
        mode: "LIVE",
        acquired: true,
        sources: [
            { url: "https://example.test/a", fetched_at: "2026-01-01T00:00:00.000Z", http_status: 200, content_hash: HASH64, bytes: 10, evidence_ref: "runtime/generated/external-research-acquisition.json" },
        ],
        ranked: [{ name: "X", sources: ["https://example.test/a"], provenance_ref: "https://example.test/a" }],
    };
}

inTempCwd((mod) => {
    const r = mod.runProbe("research-acquired", {});
    ok("research-acquired FAILS with no evidence (reachability never satisfies it)", r.ok === false && /reachability does NOT satisfy/.test(r.detail));
});

inTempCwd((mod) => {
    // A dry-run (plan only) MUST NOT satisfy the proof.
    writeResearch({ mode: "DRY_RUN", acquired: false, sources: [], ranked: [] });
    ok("research-acquired FAILS for a dry-run (acquired:false)", mod.runProbe("research-acquired", {}).ok === false);
});

inTempCwd((mod) => {
    // Connectivity reachable but NO external-research evidence ⇒ still FAIL (no fallback to connectivity).
    writeAudit(true);
    const r = mod.runProbe("research-acquired", {});
    ok("research-acquired does NOT fall back to connectivity-audit evidence", r.ok === false && /external research acquisition evidence/.test(r.detail));
    // And prove the file it reads is the research evidence, not the connectivity one.
    ok("internet-reachable still passes from the same connectivity evidence (independent probe)", mod.runProbe("internet-reachable", {}).ok === true);
});

inTempCwd((mod) => {
    writeResearch(validResearch());
    const r = mod.runProbe("research-acquired", {});
    ok("research-acquired PASSES for valid live provenance + bound citation", r.ok === true && /verified source/.test(r.detail));
});

inTempCwd((mod) => {
    const bad = validResearch(); bad.sources[0].http_status = 404;
    writeResearch(bad);
    ok("research-acquired FAILS on non-2xx provenance", mod.runProbe("research-acquired", {}).ok === false);
});

inTempCwd((mod) => {
    const bad = validResearch(); bad.sources[0].content_hash = "nothex";
    writeResearch(bad);
    ok("research-acquired FAILS on invalid sha256 content_hash", mod.runProbe("research-acquired", {}).ok === false);
});

inTempCwd((mod) => {
    const bad = validResearch(); bad.ranked[0].sources = ["https://example.test/UNVERIFIED"];
    writeResearch(bad);
    ok("research-acquired FAILS when a ranked item cites an unverified source", mod.runProbe("research-acquired", {}).ok === false);
});

inTempCwd((mod) => {
    const bad = validResearch(); delete bad.sources[0].evidence_ref;
    writeResearch(bad);
    ok("research-acquired FAILS on missing evidence_ref", mod.runProbe("research-acquired", {}).ok === false);
});

// clean-workspace-scanned proves the read-only Clean Workspace CLEAN_WORKSPACE_1 scan evidence.
inTempCwd((mod) => {
    const scanPath = "runtime/generated/clean-workspace-scan.json";
    let r = mod.runProbe("clean-workspace-scanned", {});
    ok("clean-workspace-scanned: no evidence → MISSING (not ok)", r.ok === false && /clean-workspace scan evidence/.test(r.detail));

    fs.writeFileSync(scanPath, JSON.stringify({ objective: "CLEAN_WORKSPACE_1", candidateCount: 2, candidates: ["runtime/generated/a", "runtime/generated/b"], deleted: 0 }));
    ok("clean-workspace-scanned: valid read-only scan → proven", mod.runProbe("clean-workspace-scanned", {}).ok === true);

    fs.writeFileSync(scanPath, JSON.stringify({ objective: "CLEAN_WORKSPACE_1", candidateCount: 2, candidates: ["only-one"], deleted: 0 }));
    ok("clean-workspace-scanned: candidates length != candidateCount → not ok", mod.runProbe("clean-workspace-scanned", {}).ok === false);

    fs.writeFileSync(scanPath, JSON.stringify({ objective: "CLEAN_WORKSPACE_1", candidateCount: 0, candidates: [], deleted: 3 }));
    ok("clean-workspace-scanned: deleted!=0 → not ok (read-only violated)", mod.runProbe("clean-workspace-scanned", {}).ok === false);

    fs.writeFileSync(scanPath, JSON.stringify({ objective: "SOMETHING_ELSE", candidateCount: 0, candidates: [], deleted: 0 }));
    ok("clean-workspace-scanned: wrong objective → not ok", mod.runProbe("clean-workspace-scanned", {}).ok === false);
});

console.log(`\nCapability Probe Framework: ${passed} assertions passed.`);
