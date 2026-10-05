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
// Reuse the existing in-scope tracked-file predicate (single implementation) for the "not tracked"
// cross-check; there is NO pre-existing git-ignored-artifact scanner to reuse, so CLEAN_WORKSPACE_1's
// candidate scan is implemented here against git directly (not a duplicate of any existing helper).
const { trackedFilesInScope } = require("./scope-observer");

const GENERATED_DIR = "runtime/generated";
const CONNECTIVITY_EVIDENCE = path.join(GENERATED_DIR, "connectivity-audit.json");
const PROVIDER_ACTIVATION_EVIDENCE = path.join(GENERATED_DIR, "provider-activation.json");
const CLEAN_WORKSPACE_SCAN_EVIDENCE = path.join(GENERATED_DIR, "clean-workspace-scan.json");
const CLEAN_WORKSPACE_COVERAGE_EVIDENCE = path.join(GENERATED_DIR, "clean-workspace-coverage.json");
const CLEAN_WORKSPACE_REPORT_EVIDENCE = path.join(GENERATED_DIR, "clean-workspace-report.json");
const EXTERNAL_RESEARCH_EVIDENCE = path.join(GENERATED_DIR, "external-research-acquisition.json");
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

// Deterministic, read-only workspace scan helpers (CLEAN_WORKSPACE). NOTHING is deleted: these only
// observe git state and write evidence under runtime/generated/. No pre-existing scanner helper
// covers the git-ignored candidate set, so it is derived from git here.
function gitLines(args) {
    const res = spawnSync("git", args, { encoding: "utf8" });
    if (res.status !== 0) {
        throw new Error(`git ${args.join(" ")} failed (status=${res.status}): ${String(res.stderr || "").trim()}`);
    }
    return String(res.stdout || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).sort();
}
// Candidate transient artifacts = git-IGNORED files under runtime/ (safe-to-remove by the existing
// .gitignore/backup/archive policy). Sorted for a reproducible artifact.
function scanTransientRuntimeArtifacts() {
    return gitLines(["ls-files", "--others", "--ignored", "--exclude-standard", "--", "runtime"]);
}
function writeEvidence(out, obj) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
    fs.writeFileSync(out, JSON.stringify(obj, null, 2));
    return out;
}

// Read the provider policy POSTURE (read-only). Used by the External Research Acquisition executor to
// honour the SAME policy the rest of the Runtime does (externalProvidersEnabled) WITHOUT introducing a
// new policy mechanism and WITHOUT importing the provider-activation seam. Absent/unreadable ⇒ null,
// which the executor treats as "external providers NOT allowed" (fail-closed).
function readProviderPolicy() {
    try {
        return JSON.parse(fs.readFileSync(path.join("runtime", "config", "provider-policy.json"), "utf8"));
    } catch {
        return null;
    }
}

// Resolve the injected fetcher for a live acquisition. By DESIGN there is NO built-in network client:
// a live fetch requires an explicitly injected synchronous fetcher (operator/caller provided, or a
// test's fake). This guarantees dry-run and the whole JSON pipeline make ZERO network calls — a
// fetcher cannot survive JSON transport, so a disk-driven mission can only ever dry-run, never fetch.
function resolveFetcher(ra, patch) {
    if (ra && typeof ra.fetch === "function") return ra.fetch;
    if (patch && typeof patch.__fetch === "function") return patch.__fetch;
    return null;
}

const EXECUTORS = [
    {
        // Clean Workspace — REAL execution of CLEAN_WORKSPACE_1/2/3 (scan → confirm policy → report).
        // STRICTLY matched on the objectiveId prefix so goal/done_when are never consulted and no other
        // mission's objective is captured. Deletes NOTHING; each step writes a deterministic,
        // non-empty, objective-specific evidence artifact so the chain records EXECUTED (not RECORDED).
        capability: "Clean Workspace",
        matches(patch) {
            return !!patch && typeof patch.objectiveId === "string" && patch.objectiveId.startsWith("CLEAN_WORKSPACE_");
        },
        run(patch) {
            const id = patch.objectiveId;
            if (id === "CLEAN_WORKSPACE_1") {
                const candidates = scanTransientRuntimeArtifacts();
                const out = writeEvidence(CLEAN_WORKSPACE_SCAN_EVIDENCE, {
                    objective: id, candidateCount: candidates.length, candidates, deleted: 0,
                });
                return { capability: "Clean Workspace", evidence: out, summary: { candidateCount: candidates.length } };
            }
            if (id === "CLEAN_WORKSPACE_2") {
                // Candidates are git-ignored by construction (policy-covered). Cross-check NONE is
                // tracked/required (reuse trackedFilesInScope). Self-sufficient: re-scan if step 1's
                // artifact is absent.
                let candidates;
                try { candidates = JSON.parse(fs.readFileSync(CLEAN_WORKSPACE_SCAN_EVIDENCE, "utf8")).candidates; }
                catch { candidates = null; }
                if (!Array.isArray(candidates)) candidates = scanTransientRuntimeArtifacts();
                const tracked = new Set(trackedFilesInScope(["runtime/**"]));
                const violations = candidates.filter((p) => tracked.has(p));
                const out = writeEvidence(CLEAN_WORKSPACE_COVERAGE_EVIDENCE, {
                    objective: id,
                    total: candidates.length,
                    confirmedCovered: candidates.length - violations.length,
                    anyTrackedOrRequired: violations.length > 0,
                    violations,
                });
                if (violations.length > 0) {
                    throw new Error(`CLEAN_WORKSPACE_2: ${violations.length} candidate(s) tracked/required: ${violations.join(", ")}`);
                }
                return { capability: "Clean Workspace", evidence: out, summary: { confirmedCovered: candidates.length } };
            }
            if (id === "CLEAN_WORKSPACE_3") {
                const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
                const scan = readJson(CLEAN_WORKSPACE_SCAN_EVIDENCE);
                const coverage = readJson(CLEAN_WORKSPACE_COVERAGE_EVIDENCE);
                const candidatesScanned = scan && typeof scan.candidateCount === "number"
                    ? scan.candidateCount
                    : scanTransientRuntimeArtifacts().length;
                const out = writeEvidence(CLEAN_WORKSPACE_REPORT_EVIDENCE, {
                    objective: id,
                    candidatesScanned,
                    coverageConfirmed: !!coverage && coverage.anyTrackedOrRequired === false,
                    deleted: 0,
                    trackedRemoved: [],
                    note: "Read-only workspace audit: no tracked or required artifact was deleted.",
                });
                return { capability: "Clean Workspace", evidence: out, summary: { candidatesScanned, deleted: 0 } };
            }
            throw new Error(`Clean Workspace: unsupported objectiveId "${id}"`);
        },
    },
    {
        // External Research Acquisition — the governed external-data node. It is placed BEFORE the
        // Connectivity Audit entry so first-match resolution can never route a research objective to
        // the reachability probe, and it matches ONLY the strict, disjoint objectiveId prefix
        // EXTERNAL_RESEARCH_ (never a loose online/internet keyword). Path B (patch-executor) runs
        // capabilities BEFORE any governance authorization, so this executor SELF-GATES and is
        // fail-closed: dry-run is the hard default (ZERO network), and a live acquisition requires an
        // explicit research_acquisition authorization transported on the patch, execute===true, the
        // provider policy allowing external providers, a non-empty source allowlist, AND an injected
        // fetcher. Reachability is NEVER treated as research.
        capability: "External Research Acquisition",
        matches(patch) {
            return !!patch && typeof patch.objectiveId === "string" && patch.objectiveId.startsWith("EXTERNAL_RESEARCH_");
        },
        run(patch) {
            const ra = (patch && patch.research_acquisition && typeof patch.research_acquisition === "object" && !Array.isArray(patch.research_acquisition))
                ? patch.research_acquisition : null;
            const authorized = !!ra && ra.authorized === true;
            const execute = !!ra && ra.execute === true;
            const allowlist = ra && Array.isArray(ra.source_allowlist)
                ? ra.source_allowlist.filter((u) => typeof u === "string" && u) : [];
            const policy = readProviderPolicy();
            const policyAllows = !!policy && policy.externalProvidersEnabled === true;

            // DRY-RUN DEFAULT (hard): execute not set ⇒ plan-only, ZERO network. The fetcher is never
            // consulted. The emitted evidence records acquired:false so the research-acquired proof
            // CANNOT be satisfied by a dry run (reachability/plan ≠ research).
            if (!execute) {
                const out = writeEvidence(EXTERNAL_RESEARCH_EVIDENCE, {
                    capability: "External Research Acquisition",
                    objective: patch.objectiveId,
                    mode: "DRY_RUN",
                    acquired: false,
                    authorized,
                    policyAllows,
                    plannedSources: allowlist,
                    sources: [],
                    ranked: [],
                    note: "Dry-run default: no network access performed. Live acquisition requires research_acquisition.authorized=true, execute=true, provider policy externalProvidersEnabled=true, a non-empty source_allowlist, and an injected fetcher.",
                });
                return { capability: "External Research Acquisition", evidence: out, summary: { mode: "DRY_RUN", acquired: false } };
            }

            // LIVE path — fail closed on ANY missing/invalid gate (a throw is recorded FAILED by the
            // Patch Executor, which blocks validation). Order: authorization → policy → allowlist →
            // fetcher. None of these is assumed to have been checked upstream.
            if (!authorized) throw new Error("External Research Acquisition BLOCKED: research_acquisition.authorized is not true");
            if (!policyAllows) throw new Error("External Research Acquisition BLOCKED: provider policy externalProvidersEnabled is not true");
            if (allowlist.length === 0) throw new Error("External Research Acquisition BLOCKED: empty source_allowlist");
            const fetcher = resolveFetcher(ra, patch);
            if (!fetcher) throw new Error("External Research Acquisition BLOCKED: no fetcher injected (zero built-in network client by design)");

            const crypto = require("crypto");
            const sources = [];
            for (const url of allowlist) {
                const res = fetcher(url) || {};
                const status = typeof res.status === "number" ? res.status : 0;
                const body = typeof res.body === "string" ? res.body : "";
                const content_hash = crypto.createHash("sha256").update(body).digest("hex");
                sources.push({
                    url,
                    fetched_at: typeof res.fetched_at === "string" && res.fetched_at ? res.fetched_at : new Date().toISOString(),
                    http_status: status,
                    content_hash,
                    bytes: Buffer.byteLength(body),
                    evidence_ref: EXTERNAL_RESEARCH_EVIDENCE,
                });
            }
            // Only 2xx fetches count as verified provenance a citation may bind to.
            const verifiedUrls = new Set(sources.filter((s) => s.http_status >= 200 && s.http_status <= 299).map((s) => s.url));

            // Bind each candidate item's citations to captured provenance; a citation to an unverified
            // source fails closed. Candidate items (names + dimension scores) are an auditable INPUT on
            // the authorization block — the executor never invents research data.
            const items = ra && Array.isArray(ra.items) ? ra.items : [];
            const ranking = require("./research-ranking");
            const bound = items.map((it) => {
                const cites = Array.isArray(it && it.sources) ? it.sources : [];
                for (const u of cites) {
                    if (!verifiedUrls.has(u)) {
                        throw new Error(`External Research Acquisition BLOCKED: item "${it && it.name}" cites unverified source ${u}`);
                    }
                }
                return { ...it, provenance_ref: cites[0] || null };
            });
            const ranked = bound.length ? ranking.rank(bound) : [];

            const acquired = sources.length > 0 && sources.every((s) => s.http_status >= 200 && s.http_status <= 299);
            const out = writeEvidence(EXTERNAL_RESEARCH_EVIDENCE, {
                capability: "External Research Acquisition",
                objective: patch.objectiveId,
                mode: "LIVE",
                acquired,
                authorized: true,
                policyAllows: true,
                sources,
                ranked,
            });
            if (!acquired) throw new Error("External Research Acquisition BLOCKED: no 2xx source acquired");
            return { capability: "External Research Acquisition", evidence: out, summary: { mode: "LIVE", acquired, sources: sources.length, ranked: ranked.length } };
        },
    },
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
    const matched = EXECUTORS.find((e) => e.matches(patch)) || null;
    // Bind the matched patch to run() so an executor that needs the objective context (Clean Workspace
    // branches on patch.objectiveId) receives it, even though the Patch Executor calls run() with no
    // argument. The spread preserves `capability`/`matches`; connectivity's run() ignores the extra
    // arg and provider's run(patch) already tolerates it, so existing executors behave identically.
    return matched ? { ...matched, run: () => matched.run(patch) } : null;
}

module.exports = { resolve, runAudit, EXECUTORS, CONNECTIVITY_EVIDENCE, EXTERNAL_RESEARCH_EVIDENCE };

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
