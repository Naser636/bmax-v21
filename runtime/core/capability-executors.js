#!/usr/bin/env node

/*
 * Capability Executors — the missing Mission → Capability → Execution → Evidence link.
 *
 * ROOT CAUSE this module fixes: the Patch Executor's default branch discharged every mission-derived
 * objective as a no-op `RECORDED` entry. No business logic ran, yet the Validation Engine saw full
 * objective coverage with no failures and reported MISSION SUCCESS — a mission "passed" without any
 * capability ever executing or producing evidence.
 *
 * This module maps an objective to a REAL capability executor. When one matches, the Patch Executor
 * runs it: the capability performs genuine work and writes an evidence artifact under
 * runtime/generated/. The Validation Engine then requires that evidence to exist (see its evidence
 * gate), so a capability can no longer be recorded as done without proof of execution.
 *
 * When invoked directly (`node capability-executors.js <out>`) the file runs the Connectivity Audit
 * itself and writes the evidence JSON — so the audit is executed as a real, bounded subprocess and
 * the synchronous Patch Executor loop stays synchronous.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const GENERATED_DIR = "runtime/generated";
const CONNECTIVITY_EVIDENCE = path.join(GENERATED_DIR, "connectivity-audit.json");
const PROVIDER_ACTIVATION_EVIDENCE = path.join(GENERATED_DIR, "provider-activation.json");
// tsx entry (run via `node <cli.mjs>` so no PATH/shebang assumption) that activates the Provider
// Registry + Orchestrator and runs the selected provider — the socle→provider edge.
const TSX_CLI = path.join("node_modules", "tsx", "dist", "cli.mjs");
const PROVIDER_ACTIVATION_ENTRY = path.join("src", "runtime", "provider-activation.ts");

// ---------------------------------------------------------------------------
// Connectivity Audit — real business logic.
//
// Probes DNS resolution, HTTP/HTTPS reachability, general Internet reachability, known AI providers,
// and required environment variables. Secrets are NEVER written to the evidence: an env var is
// recorded only as { present, length, fingerprint } where the fingerprint is a one-way SHA-256
// prefix — enough to confirm a value is configured, impossible to reverse into the secret.
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 2500;
const DNS_TARGETS = ["api.anthropic.com", "api.openai.com", "github.com"];
const INTERNET_TARGETS = ["https://api.anthropic.com", "https://github.com"];
const PROVIDERS = [
    { name: "anthropic", host: "api.anthropic.com", url: "https://api.anthropic.com/v1/models", envVars: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_API_KEY"] },
    { name: "openai", host: "api.openai.com", url: "https://api.openai.com/v1/models", envVars: ["OPENAI_API_KEY"] },
];
const EXTRA_ENV = ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"];

function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), ms);
        promise.then(
            (v) => { clearTimeout(t); resolve(v); },
            (e) => { clearTimeout(t); reject(e); }
        );
    });
}

async function probeDns(host) {
    const dns = require("dns").promises;
    try {
        const addrs = await withTimeout(dns.lookup(host, { all: true }), TIMEOUT_MS);
        return { host, resolved: true, addresses: addrs.map((a) => a.address) };
    } catch (e) {
        return { host, resolved: false, error: e.code || String(e.message || e) };
    }
}

function probeHttp(url) {
    return new Promise((resolve) => {
        let u;
        try { u = new URL(url); } catch { return resolve({ url, ok: false, error: "invalid url" }); }
        const mod = u.protocol === "https:" ? require("https") : require("http");
        const req = mod.request(u, { method: "HEAD", timeout: TIMEOUT_MS }, (res) => {
            // Any response — even 4xx — proves the endpoint is reachable over the network.
            resolve({ url, ok: true, status: res.statusCode, protocol: u.protocol.replace(":", "") });
            res.resume();
            res.destroy();
        });
        req.on("timeout", () => { req.destroy(); resolve({ url, ok: false, error: "timeout" }); });
        req.on("error", (e) => resolve({ url, ok: false, error: e.code || String(e.message || e) }));
        req.end();
    });
}

function auditEnvVar(name) {
    const crypto = require("crypto");
    const val = process.env[name];
    const present = typeof val === "string" && val.length > 0;
    return {
        name,
        present,
        length: present ? val.length : 0,
        // One-way fingerprint: proves the value is configured without ever exposing it.
        fingerprint: present ? crypto.createHash("sha256").update(val).digest("hex").slice(0, 8) : null,
    };
}

async function runAudit() {
    const dnsResults = await Promise.all(DNS_TARGETS.map(probeDns));
    const httpResults = await Promise.all(INTERNET_TARGETS.map(probeHttp));

    const providers = [];
    for (const p of PROVIDERS) {
        const dnsRes = await probeDns(p.host);
        const httpRes = await probeHttp(p.url);
        const env = p.envVars.map(auditEnvVar);
        providers.push({
            name: p.name,
            dns: dnsRes,
            http: httpRes,
            reachable: httpRes.ok,
            credentialsPresent: env.some((e) => e.present),
            env,
        });
    }

    const environment = [...new Set([...PROVIDERS.flatMap((p) => p.envVars), ...EXTRA_ENV])].map(auditEnvVar);
    const internetReachable = httpResults.some((h) => h.ok) || dnsResults.some((d) => d.resolved);

    return {
        capability: "Connectivity Audit",
        ranAt: new Date().toISOString(),
        summary: {
            dns: `${dnsResults.filter((d) => d.resolved).length}/${dnsResults.length} resolved`,
            http: `${httpResults.filter((h) => h.ok).length}/${httpResults.length} reachable`,
            internetReachable,
            providers: `${providers.filter((p) => p.reachable).length}/${providers.length} reachable`,
            credentialsConfigured: providers.filter((p) => p.credentialsPresent).map((p) => p.name),
        },
        dns: dnsResults,
        http: httpResults,
        internet: { reachable: internetReachable },
        providers,
        environment,
        secretsExposed: false,
    };
}

// ---------------------------------------------------------------------------
// Executor registry.
// ---------------------------------------------------------------------------

function haystack(patch) {
    return [patch.action, patch.objectiveId, patch.goal, ...(Array.isArray(patch.done_when) ? patch.done_when : [])]
        .filter((s) => typeof s === "string")
        .join(" ")
        .toLowerCase();
}

const EXECUTORS = [
    {
        capability: "Connectivity Audit",
        // Any objective whose intent is the network — connectivity, internet, or exploring what is
        // available "online" — is discharged by the real Connectivity Audit, so its evidence exists
        // for the internet-reachable proof the mission is now REQUIRED to satisfy.
        matches(patch) { return /\b(connectivity|internet|online)\b/.test(haystack(patch)); },
        run() {
            const out = CONNECTIVITY_EVIDENCE;
            try { fs.rmSync(out, { force: true }); } catch { /* ignore */ }
            // Execute the audit as a real, bounded subprocess so the synchronous executor loop stays
            // synchronous while genuine async network probes run to completion.
            const res = spawnSync(process.execPath, [__filename, out], { encoding: "utf8", timeout: 30000 });
            const evidenceExists = fs.existsSync(out) && fs.statSync(out).size > 0;
            if (res.status !== 0 || !evidenceExists) {
                throw new Error(
                    `Connectivity Audit did not complete (status=${res.status}, evidence=${evidenceExists}): ` +
                    String(res.stderr || (res.error && res.error.message) || "")
                );
            }
            let report = null;
            try { report = JSON.parse(fs.readFileSync(out, "utf8")); } catch { /* evidence unparseable */ }
            return { capability: "Connectivity Audit", evidence: out, summary: report ? report.summary : null };
        },
    },
    {
        // Provider Activation — the Business-Capability socle's edge to the Providers. Activates the
        // Provider Registry + Orchestrator (src/core/*), lets the Runtime deterministically SELECT a
        // provider for the objective's capability, and runs it through the real Claude/OpenAI adapter
        // bridge — emitting evidence (provider selected + response or precise failure cause). Runs
        // WITHOUT --execute so certification never triggers an unsolicited paid provider call; a live
        // run is an explicit operator action. Executed as a bounded subprocess so the executor loop
        // stays synchronous while the TS seam runs.
        capability: "Provider Activation",
        matches(patch) { return /provider/.test(haystack(patch)); },
        run(patch) {
            const out = PROVIDER_ACTIVATION_EVIDENCE;
            try { fs.rmSync(out, { force: true }); } catch { /* ignore */ }
            const mission = {
                mission: (patch && (patch.objectiveId || patch.action)) || "PROVIDER_ACTIVATION",
                mode: "ENGINEERING",
                requiresEngineering: true,
                objectives: [{
                    id: (patch && patch.objectiveId) || "OBJ-1",
                    goal: (patch && patch.goal) || "",
                    done_when: Array.isArray(patch && patch.done_when) ? patch.done_when : [],
                }],
            };
            fs.mkdirSync(GENERATED_DIR, { recursive: true });
            const missionFile = path.join(GENERATED_DIR, "provider-activation.mission.json");
            fs.writeFileSync(missionFile, JSON.stringify(mission, null, 2));
            const res = spawnSync(process.execPath, [TSX_CLI, PROVIDER_ACTIVATION_ENTRY, missionFile, out], { encoding: "utf8", timeout: 60000 });
            const evidenceExists = fs.existsSync(out) && fs.statSync(out).size > 0;
            if (res.status !== 0 || !evidenceExists) {
                throw new Error(
                    `Provider Activation did not complete (status=${res.status}, evidence=${evidenceExists}): ` +
                    String(res.stderr || (res.error && res.error.message) || "")
                );
            }
            let report = null;
            try { report = JSON.parse(fs.readFileSync(out, "utf8")); } catch { /* evidence unparseable */ }
            return {
                capability: "Provider Activation",
                evidence: out,
                summary: report ? {
                    decision: report.orchestration.decision,
                    selectedProvider: report.orchestration.selectedProvider,
                    classification: report.execution.classification,
                } : null,
            };
        },
    },
];

function resolve(patch) {
    if (!patch || typeof patch !== "object") return null;
    return EXECUTORS.find((e) => e.matches(patch)) || null;
}

module.exports = { resolve, runAudit, EXECUTORS, CONNECTIVITY_EVIDENCE };

// Direct invocation: run the Connectivity Audit and write its evidence artifact.
if (require.main === module) {
    const out = process.argv[2] || CONNECTIVITY_EVIDENCE;
    runAudit()
        .then((report) => {
            fs.mkdirSync(path.dirname(out), { recursive: true });
            fs.writeFileSync(out, JSON.stringify(report, null, 2));
            process.exit(0);
        })
        .catch((err) => {
            // Never fake success: on unexpected failure, still write an honest evidence artifact
            // recording the failure, then exit non-zero so the executor records it as FAILED.
            try {
                fs.mkdirSync(path.dirname(out), { recursive: true });
                fs.writeFileSync(out, JSON.stringify({ capability: "Connectivity Audit", error: String(err.stack || err), secretsExposed: false }, null, 2));
            } catch { /* ignore */ }
            process.exit(1);
        });
}
