#!/usr/bin/env node

/* Capability Executors — Connectivity Audit behavioural test.
 *
 * Proves the Mission → Capability → Execution → Evidence chain is real: the audit runs, writes a
 * structured evidence artifact, never leaks a secret value, and the resolver maps only connectivity
 * objectives to it. Network-independent: probes have bounded timeouts, so the audit produces honest
 * evidence whether or not the host is online. Runs in a throwaway cwd. */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const MODULE = path.resolve(__dirname, "capability-executors.js");

function inTempCwd(fn) {
    const prev = process.cwd();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "capexec-test-"));
    process.chdir(dir);
    try {
        delete require.cache[MODULE];
        const mod = require(MODULE);
        fn(mod, dir);
    } finally {
        process.chdir(prev);
    }
}

// 1. Resolver maps only connectivity objectives.
inTempCwd((mod) => {
    const audit = mod.resolve({ objectiveId: "RUN_CONNECTIVITY_AUDIT_1", goal: "Run Connectivity Audit" });
    ok("resolves a connectivity objective to the Connectivity Audit capability", audit && audit.capability === "Connectivity Audit");
    ok("does NOT resolve an unrelated objective", mod.resolve({ objectiveId: "REFACTOR_X_1", goal: "Refactor module X" }) === null);
});

// 2. The audit runs, writes real evidence, and never exposes a secret.
inTempCwd((mod) => {
    // A recognisable fake secret to prove it is fingerprinted, not written verbatim.
    const SECRET = "sk-test-SUPERSECRET-abcdef0123456789";
    process.env.ANTHROPIC_API_KEY = SECRET;
    try {
        const executor = mod.resolve({ objectiveId: "RUN_CONNECTIVITY_AUDIT_1", goal: "Run Connectivity Audit" });
        const result = executor.run();
        ok("executor returns the evidence path", result && typeof result.evidence === "string");
        ok("evidence artifact exists on disk", fs.existsSync(result.evidence) && fs.statSync(result.evidence).size > 0);

        const report = JSON.parse(fs.readFileSync(result.evidence, "utf8"));
        ok("report declares the capability", report.capability === "Connectivity Audit");
        ok("report has DNS probes", Array.isArray(report.dns) && report.dns.length > 0);
        ok("report has HTTP probes", Array.isArray(report.http) && report.http.length > 0);
        ok("report has an internet reachability verdict", report.internet && typeof report.internet.reachable === "boolean");
        ok("report has provider probes", Array.isArray(report.providers) && report.providers.length > 0);
        ok("report has an environment audit", Array.isArray(report.environment) && report.environment.length > 0);
        ok("report asserts no secrets exposed", report.secretsExposed === false);

        const serialized = JSON.stringify(report);
        ok("secret value is NOT present anywhere in the evidence", !serialized.includes(SECRET));

        const envEntry = report.environment.find((e) => e.name === "ANTHROPIC_API_KEY");
        ok("configured env var is recorded present", envEntry && envEntry.present === true);
        ok("env var records length, not value", envEntry.length === SECRET.length);
        ok("env var records a one-way fingerprint, not the value", typeof envEntry.fingerprint === "string" && envEntry.fingerprint.length === 8 && envEntry.fingerprint !== SECRET);
    } finally {
        delete process.env.ANTHROPIC_API_KEY;
    }
});

console.log(`\nCapability Executors: ${passed} assertions passed.`);
