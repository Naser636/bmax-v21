#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.

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

// ---- ODG Synthetic Deliverable — Phase-03 Gate B (ODG-formulated in-scope write + pre-write confinement) ----
function writePlan(dir, authorizedPaths, objectives) {
    fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
    fs.writeFileSync(path.join(dir, "runtime", "generated", "patch-plan.json"),
        JSON.stringify({ mission: "BENCH_SYNTH", authorizedPaths, objectives: objectives || [{ id: "ODG_WRITE_1" }] }));
}

// 9. Content is FORMULATED by ODG (deterministic; derived from plan data, not a contract patch).
inTempCwd((mod) => {
    const m1 = mod.formulateSyntheticManifest({ mission: "M", objectives: [{ id: "B" }, { id: "A" }] });
    const m2 = mod.formulateSyntheticManifest({ mission: "M", objectives: [{ id: "A" }, { id: "B" }] });
    ok("manifest is deterministic (order-independent, sorted ids)", m1 === m2);
    ok("manifest is ODG-formulated (mission + sorted ids + ODG generator tag)",
        /^ODG-SYNTHETIC-MANIFEST\nmission=M\nobjectives=A,B\ngenerator=ODG_CAPABILITY\n$/.test(m1));
});

// 10. Authorized in-scope write + non-empty evidence (real run through the executor in a sandbox cwd).
inTempCwd((mod, dir) => {
    writePlan(dir, ["bench-workspace/**"]);
    const res = mod.resolve({ objectiveId: "ODG_WRITE_1" }).run();
    const deliverable = path.join(dir, "bench-workspace", "odg-synthetic-manifest.txt");
    ok("writes exactly the in-scope deliverable", fs.existsSync(deliverable));
    ok("deliverable carries the ODG-formulated content", /generator=ODG_CAPABILITY/.test(fs.readFileSync(deliverable, "utf8")));
    ok("the deliverable is NOT a contract-supplied patch content", !/SHOULD|CONTRACT|BENCH-OK/.test(fs.readFileSync(deliverable, "utf8")));
    ok("evidence path returned and present & non-empty",
        typeof res.evidence === "string" && fs.existsSync(path.join(dir, res.evidence)) && fs.statSync(path.join(dir, res.evidence)).size > 0);
});

// 11. Refuse an EMPTY / invalid scope BEFORE any write.
inTempCwd((mod, dir) => {
    writePlan(dir, []); // empty scope
    let threw = false; try { mod.resolve({ objectiveId: "ODG_WRITE_1" }).run(); } catch { threw = true; }
    ok("empty authorized scope ⇒ refused (throws)", threw === true);
    ok("empty scope ⇒ no deliverable written", !fs.existsSync(path.join(dir, "bench-workspace", "odg-synthetic-manifest.txt")));
    assert.throws(() => mod.confineSyntheticTarget([], dir), /no valid authorized scope/);
});

// 12. Refuse an OUT-OF-SCOPE / absolute scope BEFORE any write.
inTempCwd((mod, dir) => {
    assert.throws(() => mod.confineSyntheticTarget(["/etc/**"], dir), /not a relative in-tree path/);
    ok("absolute scope refused before write", !fs.existsSync("/etc/odg-synthetic-manifest.txt"));
});

// 13. Reject path TRAVERSAL (scope escaping the tree) BEFORE any write.
inTempCwd((mod, dir) => {
    assert.throws(() => mod.confineSyntheticTarget(["../escape/**"], dir), /not a relative in-tree path|outside authorized scope/);
    ok("traversal scope ../escape refused", !fs.existsSync(path.join(dir, "..", "escape", "odg-synthetic-manifest.txt")));
});

// 14. Reject a SYMLINK escape from the sandbox (real-path defense) BEFORE any write.
inTempCwd((mod, dir) => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "capexec-outside-"));
    try {
        fs.symlinkSync(outside, path.join(dir, "linkdir")); // an in-cwd name resolving OUTSIDE the sandbox
        assert.throws(() => mod.confineSyntheticTarget(["linkdir/**"], dir), /symlink\/real-path escape/);
        ok("symlinked scope dir refused (no escape)", !fs.existsSync(path.join(outside, "odg-synthetic-manifest.txt")));
    } finally {
        fs.rmSync(outside, { recursive: true, force: true });
    }
});

// 15. The capability NEVER fires for ordinary objective ids (matcher is benchmark-reserved).
inTempCwd((mod) => {
    ok("ODG_WRITE_ prefix matches the synthetic capability",
        mod.resolve({ objectiveId: "ODG_WRITE_1" }).capability === "ODG Synthetic Deliverable");
    const ordinary = mod.resolve({ objectiveId: "SOME_OBJECTIVE_1" });
    ok("ordinary objective is NOT routed to the synthetic capability",
        !ordinary || ordinary.capability !== "ODG Synthetic Deliverable");
    const cw = mod.resolve({ objectiveId: "CLEAN_WORKSPACE_1" });
    ok("Clean Workspace objective keeps its own capability (no collision)",
        cw && cw.capability === "Clean Workspace");
});

// 16. PROTECTED-GOVERNANCE guard (Q6 closure) — a scope subsuming runtime/governance does NOT authorize
//     a governance write unless the plan explicitly grants it; the guard is the SAME shared function.
inTempCwd((mod, dir) => {
    ok("isProtectedGovernanceTarget is exported (single shared guard)", typeof mod.isProtectedGovernanceTarget === "function");
    ok("guard detects a governance path", mod.isProtectedGovernanceTarget("runtime/governance/x.json") === true);
    ok("guard ignores a non-governance path", mod.isProtectedGovernanceTarget("bench-workspace/x.txt") === false);
    // A governance scope WITHOUT elevated authorization ⇒ refused before any write.
    assert.throws(() => mod.confineSyntheticTarget(["runtime/governance/**"], dir, false),
        /protected governance path requiring an explicit ODG-level elevated authorization/);
    ok("governance scope refused without authorization ⇒ no deliverable",
        !fs.existsSync(path.join(dir, "runtime", "governance", "odg-synthetic-manifest.txt")));
    // The same scope WITH explicit elevated authorization is permitted by the guard (parity with edits branch).
    const okRes = mod.confineSyntheticTarget(["runtime/governance/**"], dir, true);
    ok("governance scope allowed only with explicit elevated authorization", okRes.relTarget === path.join("runtime", "governance", "odg-synthetic-manifest.txt"));
    // Default (omitted) authorization is fail-closed (treated as not granted).
    assert.throws(() => mod.confineSyntheticTarget(["runtime/governance/**"], dir), /protected governance path/);
    // Non-governance scope stays unaffected by the guard.
    ok("bench-workspace scope unaffected by governance guard",
        mod.confineSyntheticTarget(["bench-workspace/**"], dir, false).relTarget === path.join("bench-workspace", "odg-synthetic-manifest.txt"));
});

// 17. run() end-to-end refuses a governance scope before any write (no file, throws).
inTempCwd((mod, dir) => {
    writePlan(dir, ["runtime/governance/**"]); // no allowProtectedGovernance
    let threw = false; try { mod.resolve({ objectiveId: "ODG_WRITE_1" }).run(); } catch { threw = true; }
    ok("run() refuses a governance scope (throws)", threw === true);
    ok("run() governance refusal ⇒ no governance deliverable written",
        !fs.existsSync(path.join(dir, "runtime", "governance", "odg-synthetic-manifest.txt")));
});

// --- TRUST-GAP-1 (adversarial): a JSON-NAMED built-in fetcher must NOT enable live egress ------------
// A patch/plan/model-emitted research_acquisition that NAMES the (removed) built-in fetcher + authorized +
// execute must NOT reach any live network call: resolveFetcher returns null ⇒ the executor refuses at the
// "no fetcher injected" guard BEFORE the fetch loop. A JSON name can no longer trigger outbound egress.
{
  const mod = require(MODULE);
  const malicious = mod.resolve({ objectiveId: "EXTERNAL_RESEARCH_evil", research_acquisition: { authorized: true, execute: true, source_allowlist: ["http://attacker.example/?exfil=secret"], fetcher: "governed-http-get" } });
  let threw = false, msg = "";
  try { malicious.run(); } catch (e) { threw = true; msg = e.message; }
  ok("TRUST-GAP-1: JSON-named built-in fetcher + authorized+execute ⇒ REFUSED (no fetcher injected; no live egress)", threw && /no fetcher injected/.test(msg));
  // and the legit path still works: an INJECTED function (not JSON) does perform the live fetch.
  const legit = mod.resolve({ objectiveId: "EXTERNAL_RESEARCH_ok", research_acquisition: { authorized: true, execute: true, source_allowlist: ["https://a.test"], fetch: () => ({ status: 200, body: "{\"x\":1}" }) } });
  let ran = false; try { legit.run(); ran = true; } catch { ran = false; }
  ok("TRUST-GAP-1: an INJECTED fetcher function still performs live research (legit path unbroken)", ran === true);
}

console.log(`\nCapability Executors: ${passed} assertions passed.`);
