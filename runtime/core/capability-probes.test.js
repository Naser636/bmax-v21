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

console.log(`\nCapability Probe Framework: ${passed} assertions passed.`);
