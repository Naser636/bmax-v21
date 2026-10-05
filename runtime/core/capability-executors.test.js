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
    // "online" / "internet" intent must ALSO reach the Connectivity Audit, so the evidence exists for
    // the internet-reachable proof such missions are now REQUIRED to satisfy.
    const online = mod.resolve({ objectiveId: "EXPLORE_ONLINE_OPPORTUNITIES_1", goal: "Explore Online Opportunities" });
    ok("resolves an online-opportunity objective to the Connectivity Audit capability", online && online.capability === "Connectivity Audit");
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

// --- External Research Acquisition: precedence, self-gating, dry-run zero-network, live provenance ---

function writePolicy(enabled) {
    fs.mkdirSync("runtime/config", { recursive: true });
    fs.writeFileSync("runtime/config/provider-policy.json", JSON.stringify({ externalProvidersEnabled: enabled }));
}

// 3. Strict precedence + disjoint matcher: EXTERNAL_RESEARCH_ resolves to the research executor, and
//    an online objective STILL resolves to Connectivity Audit (precedence did not steal it).
inTempCwd((mod) => {
    const r = mod.resolve({ objectiveId: "EXTERNAL_RESEARCH_1", goal: "Add governed external research executor" });
    ok("EXTERNAL_RESEARCH_* resolves to External Research Acquisition", r && r.capability === "External Research Acquisition");
    const online = mod.resolve({ objectiveId: "EXPLORE_ONLINE_OPPORTUNITIES_1", goal: "Explore Online Opportunities" });
    ok("online objective STILL resolves to Connectivity Audit (precedence is disjoint)", online && online.capability === "Connectivity Audit");
    const conn = mod.resolve({ objectiveId: "RUN_CONNECTIVITY_AUDIT_1", goal: "Run Connectivity Audit" });
    ok("connectivity objective unchanged → Connectivity Audit", conn && conn.capability === "Connectivity Audit");
});

// 4. DRY-RUN is the hard default: no execute ⇒ ZERO network calls, acquired:false evidence written.
inTempCwd((mod) => {
    let calls = 0;
    const fetch = () => { calls += 1; return { status: 200, body: "x" }; };
    const exec = mod.resolve({ objectiveId: "EXTERNAL_RESEARCH_1", research_acquisition: { authorized: true, source_allowlist: ["https://a.test"], fetch } });
    const res = exec.run();
    const ev = JSON.parse(fs.readFileSync(res.evidence, "utf8"));
    ok("dry-run performs ZERO network calls (fetcher never invoked)", calls === 0);
    ok("dry-run evidence records mode DRY_RUN and acquired:false", ev.mode === "DRY_RUN" && ev.acquired === false);
    ok("dry-run captures no sources", Array.isArray(ev.sources) && ev.sources.length === 0);
});

// 5. Fail-closed: execute=true but authorization missing ⇒ throws (recorded FAILED upstream).
inTempCwd((mod) => {
    writePolicy(true);
    const exec = mod.resolve({ objectiveId: "EXTERNAL_RESEARCH_1", research_acquisition: { authorized: false, execute: true, source_allowlist: ["https://a.test"], fetch: () => ({ status: 200, body: "x" }) } });
    let threw = false; try { exec.run(); } catch { threw = true; }
    ok("live acquisition without authorization fails closed (throws)", threw === true);
});

// 6. Fail-closed: policy denies external providers ⇒ throws.
inTempCwd((mod) => {
    writePolicy(false);
    const exec = mod.resolve({ objectiveId: "EXTERNAL_RESEARCH_1", research_acquisition: { authorized: true, execute: true, source_allowlist: ["https://a.test"], fetch: () => ({ status: 200, body: "x" }) } });
    let threw = false; try { exec.run(); } catch { threw = true; }
    ok("live acquisition fails closed when provider policy disallows external providers", threw === true);
});

// 7. Live acquisition with an injected fake fetcher: per-source provenance + bound ranking.
inTempCwd((mod) => {
    writePolicy(true);
    let calls = 0;
    const fetch = (url) => { calls += 1; return { status: 200, body: `body-of-${url}`, fetched_at: "2026-01-01T00:00:00.000Z" }; };
    const ra = {
        authorized: true, execute: true,
        source_allowlist: ["https://a.test", "https://b.test"],
        items: [
            { name: "Alpha", scores: { incomePotential: 9, demandGrowth: 10, startupCostInverse: 9, timeToRevenueInverse: 8, skillAlignment: 10 }, sources: ["https://a.test"] },
            { name: "Beta", scores: { incomePotential: 6, demandGrowth: 4, startupCostInverse: 8, timeToRevenueInverse: 3, skillAlignment: 6 }, sources: ["https://b.test"] },
        ],
        fetch,
    };
    const exec = mod.resolve({ objectiveId: "EXTERNAL_RESEARCH_1", research_acquisition: ra });
    const res = exec.run();
    const ev = JSON.parse(fs.readFileSync(res.evidence, "utf8"));
    ok("live fetch called once per allowlisted source", calls === 2);
    ok("evidence mode LIVE + acquired:true", ev.mode === "LIVE" && ev.acquired === true);
    ok("each source carries a sha256 (64 hex) content_hash", ev.sources.every((s) => /^[0-9a-f]{64}$/.test(s.content_hash)));
    ok("each source carries url/fetched_at/http_status/bytes/evidence_ref", ev.sources.every((s) => s.url && s.fetched_at && s.http_status === 200 && s.bytes > 0 && s.evidence_ref));
    ok("ranking is deterministic: Alpha outranks Beta", ev.ranked[0].name === "Alpha" && ev.ranked[0].rank === 1);
    ok("each ranked item carries a verified provenance_ref", ev.ranked.every((it) => typeof it.provenance_ref === "string" && it.provenance_ref));
});

// 8. Fail-closed: a ranked item citing an unverified (not-fetched) source ⇒ throws.
inTempCwd((mod) => {
    writePolicy(true);
    const ra = {
        authorized: true, execute: true,
        source_allowlist: ["https://a.test"],
        items: [{ name: "Alpha", scores: { incomePotential: 1, demandGrowth: 1, startupCostInverse: 1, timeToRevenueInverse: 1, skillAlignment: 1 }, sources: ["https://UNVERIFIED.test"] }],
        fetch: () => ({ status: 200, body: "x" }),
    };
    const exec = mod.resolve({ objectiveId: "EXTERNAL_RESEARCH_1", research_acquisition: ra });
    let threw = false; try { exec.run(); } catch { threw = true; }
    ok("ranked item citing an unverified source fails closed (throws)", threw === true);
});

console.log(`\nCapability Executors: ${passed} assertions passed.`);
