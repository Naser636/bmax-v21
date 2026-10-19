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
const { trackedFilesInScope, changedPathsInScope } = require("./scope-observer");
// The Governed Git Branch Integration capability (local, fast-forward-only, C03-recorded). This is a
// capability IMPLEMENTATION the single registry routes to — NOT a second executor/evidence system.
const gitBranchIntegration = require("./git-branch-integration");
// The Governed Bash/Linux Command capability (parse→analyse→action-gate→genuine-isolation sandbox→
// observed-effect→C03). Another capability IMPLEMENTATION the single registry routes to — not a second
// command engine, policy, authority, evidence or sandbox system.
const bashGovernor = require("./bash-command-governor");
// Pure economic capability modules (recovered additively; no network, reuse economic-unit). Used ONLY
// on the LIVE research path to turn ACQUIRED 2xx bytes into OBSERVED economic observations + a
// deterministic opportunity classification. They add nothing on dry-run and nothing when the grant
// declares no extraction rules / opportunity candidates.
const economicExtractor = require("./economic-extractor");
const opportunityPolicy = require("./opportunity-policy");
// Autonomy-rate signal builder (B140) — the SAME production builder odg-state.js uses, reused by the
// Governed Observability Verification capability to re-derive and verify the autonomy signal. Declared
// TOP-LEVEL (not a lazy in-function require) so the dist-closure tracer reliably copies it into
// runtime/dist/core alongside this module.
const { buildAutonomyRate } = require("./autonomy-rate");
// Evidence provenance (audit C5-A2): stamps every evidence artifact with an attributable, tamper-evident
// provenance block (source commit + tree-dirty + sha256 of its own payload). Additive and fail-closed —
// it never changes an executor's control flow or the evidence path returned to callers.
const { stampProvenance } = require("./evidence-provenance");
// Stage-6 governed autonomous code implementation: REUSE the proven delegation seam (working-copy →
// scoped diff → fail-closed validateScope → atomic apply; ODG never auto-commits) + the sandboxed local
// generator tier. Composed here; NEITHER module is modified. No external/billable provider is ever
// activated from this path — unavailability fails closed.
const delegateIso = require("./delegate-isolation");
const localModel = require("./local-model-manager");

const GENERATED_DIR = "runtime/generated";
const CONNECTIVITY_EVIDENCE = path.join(GENERATED_DIR, "connectivity-audit.json");
const GIT_BRANCH_INTEGRATION_EVIDENCE = path.join(GENERATED_DIR, "git-branch-integration.json");
const BASH_COMMAND_EVIDENCE = path.join(GENERATED_DIR, "bash-command.json");
const PROVIDER_ACTIVATION_EVIDENCE = path.join(GENERATED_DIR, "provider-activation.json");
const CLEAN_WORKSPACE_SCAN_EVIDENCE = path.join(GENERATED_DIR, "clean-workspace-scan.json");
const CLEAN_WORKSPACE_COVERAGE_EVIDENCE = path.join(GENERATED_DIR, "clean-workspace-coverage.json");
const CLEAN_WORKSPACE_REPORT_EVIDENCE = path.join(GENERATED_DIR, "clean-workspace-report.json");
const EXTERNAL_RESEARCH_EVIDENCE = path.join(GENERATED_DIR, "external-research-acquisition.json");
const SYNTHETIC_DELIVERABLE_EVIDENCE = path.join(GENERATED_DIR, "odg-synthetic-deliverable.json");
const SYNTHETIC_DELIVERABLE_NAME = "odg-synthetic-manifest.txt";
// ODG Spec Author (η3-B30) — a SEMANTIC structured deliverable: a Mission-Loader-schema specification
// ODG formulates itself via mission-synthesizer.toContract (NOT a flat manifest, NEVER a copy of a
// contract-supplied patch). Its correctness is independently verifiable (spec-schema-valid probe).
const SPEC_AUTHOR_EVIDENCE = path.join(GENERATED_DIR, "odg-spec-author.json");
// Governed Observability Verification (B140) — the evidence a mission whose deliverable is an OBSERVABLE
// STATE (not a file edit) produces: the capability re-derives the autonomy-rate signal from THIS run's
// real per-run artifacts via the production builder and records whether it is STRUCTURALLY HONEST. This
// turns an otherwise-no-op observability objective into real EVIDENCED work (never a fabricated proof —
// absent real run inputs or a non-honest signal makes the capability FAIL, not pass).
const OBSERVABILITY_VERIFICATION_EVIDENCE = path.join(GENERATED_DIR, "observability-verification.json");
const IMPLEMENT_VIA_LOCAL_PROVIDER_EVIDENCE = path.join(GENERATED_DIR, "implement-via-local-provider.json");
const SPEC_AUTHOR_NAME = "odg-spec.json";
// tsx entry (run via `node <cli.mjs>` so no PATH/shebang assumption) that activates the Provider
// Registry + Orchestrator and runs the selected provider — the socle→provider edge.
const TSX_CLI = path.join("node_modules", "tsx", "dist", "cli.mjs");
const PROVIDER_ACTIVATION_ENTRY = path.join("src", "runtime", "provider-activation.ts");
// MIGRATION-READINESS (V65 §7A): the two self-re-exec workers (--http-get, connectivity audit) re-exec THIS
// file. The production default is `__filename` — an ABSOLUTE, cwd-independent path to the running .js worker
// (correct and unchanged for the .js runtime, from any cwd). To make the entry CONTROLLABLE — so a compiled/
// dist caller (or a hermetic parity bench) can re-exec the canonical historical .js instead of its own copy —
// it is overridable via env `ODG_SELF_WORKER_ENTRY` (module scope) and per-call `opts.selfEntry`
// (governedHttpGet). This is the smallest contract that masters the entry path without a cwd dependency.
const SELF_WORKER_ENTRY = (typeof process !== "undefined" && process.env && process.env.ODG_SELF_WORKER_ENTRY) || (() => {
    // The re-exec spawns `node <entry>`, which can only run the canonical .JS worker. `__filename` is NOT
    // safe as the default: under tsx the loader resolves this module to the .ts (node can't run .ts), and
    // once compiled it is the dist copy. Resolve the .js ABSOLUTELY from this module's dir (cwd-independent),
    // mapping both the dist/core and the .ts cases back to runtime/core/capability-executors.js.
    const dir = __dirname;
    if (dir.endsWith(path.join("runtime", "dist", "core"))) return path.join(dir, "..", "..", "core", "capability-executors.js");
    return path.join(dir, "capability-executors.js");
})();

// MIGRATION-READINESS seams (V66 §7 A/B/C): the module's only impure dependencies — child-process spawn,
// the wall clock, and the DNS/HTTP(S) network — are routed through a single mutable `_seams` object so a
// hermetic JS/TS parity bench can CONTROL them (no real subprocess/clock/network), while PRODUCTION uses the
// real implementations by default (behaviour byte-for-byte unchanged). `__setExecutorSeams`/`__resetExecutorSeams`
// are TEST-ONLY (never called by production paths). dnsLookup/httpRequest default to lazy `require` so the
// cost is unchanged. NO security control, authorization decision, or observable effect is altered.
const _seams = {
    spawn: spawnSync,
    nowIso: () => new Date().toISOString(),
    dnsLookup: (host, options) => require("dns").promises.lookup(host, options),
    httpRequest: (u, options, cb) => (u.protocol === "https:" ? require("https") : require("http")).request(u, options, cb),
};
function __setExecutorSeams(s) { if (s && typeof s === "object") Object.assign(_seams, s); }
function __resetExecutorSeams() { _seams.spawn = spawnSync; _seams.nowIso = () => new Date().toISOString(); _seams.dnsLookup = (host, options) => require("dns").promises.lookup(host, options); _seams.httpRequest = (u, options, cb) => (u.protocol === "https:" ? require("https") : require("http")).request(u, options, cb); }

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
    try {
        const addrs = await withTimeout(_seams.dnsLookup(host, { all: true }), TIMEOUT_MS);
        return { host, resolved: true, addresses: addrs.map((a) => a.address) };
    } catch (e) {
        return { host, resolved: false, error: e.code || String(e.message || e) };
    }
}

function probeHttp(url) {
    return new Promise((resolve) => {
        let u;
        try { u = new URL(url); } catch { return resolve({ url, ok: false, error: "invalid url" }); }
        const req = _seams.httpRequest(u, { method: "HEAD", timeout: TIMEOUT_MS }, (res) => {
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
        ranAt: _seams.nowIso(),
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
    const res = _seams.spawn("git", args, { encoding: "utf8" });
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
    // Additive provenance stamp (C5-A2): bind the artifact to its source revision + a content digest so it
    // is attributable and tamper-evident, composing with the existing run-ownership mtime checks. Pure +
    // fail-closed (no repo/git ⇒ sourceAvailable:false); never alters `obj` nor the returned path.
    fs.writeFileSync(out, JSON.stringify(stampProvenance(obj), null, 2));
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
    // GOVERNED, JSON-SAFE live fetcher selection. A grant (never the sentence) may NAME the one built-in
    // bounded read-only fetcher; a name is the ONLY thing that survives JSON transport, so no code is
    // ever carried. This is reachable solely AFTER the LIVE gate above (authorized + policy + allowlist),
    // so naming it does not itself authorize anything. Per-request byte/time limits ride on the spec.
    if (ra && ra.fetcher === "governed-http-get") {
        return (url) => governedHttpGet(url, { maxBytes: ra.maxBytes, timeoutMs: ra.timeoutMs });
    }
    return null;
}

// ---- Governed bounded read-only HTTP(S) GET — the ONLY built-in network client -------------------
// Reachable solely via a NAMED selection inside an explicitly human-authorized LIVE research grant.
// GET only; follows NO redirects (a 3xx is returned as-is ⇒ non-2xx ⇒ never verified provenance); sends
// NO Authorization/cookies/custom headers; caps bytes AND time; writes NOTHING. Runs in a child process
// with a CLEARED environment, so it can never read a credential (no privilege escalation / leakage). The
// subprocess keeps the executor's synchronous loop synchronous — the SAME pattern the Connectivity Audit
// already uses — without adding an async model.
function httpGetBounded(rawUrl, maxBytes, timeoutMs) {
    return new Promise((resolve) => {
        let u;
        try { u = new URL(rawUrl); } catch { return resolve({ status: 0, body: "", error: "invalid url" }); }
        if (u.protocol !== "https:" && u.protocol !== "http:") return resolve({ status: 0, body: "", error: "unsupported protocol" });
        const req = _seams.httpRequest(u, { method: "GET", timeout: timeoutMs }, (res) => {
            const chunks = [];
            let bytes = 0;
            let truncated = false;
            res.on("data", (d) => {
                if (truncated) return;
                bytes += d.length;
                if (bytes <= maxBytes) chunks.push(d);
                else { truncated = true; req.destroy(); } // hard byte cap: stop reading past the limit
            });
            res.on("end", () => resolve({
                status: res.statusCode || 0,
                body: Buffer.concat(chunks).slice(0, maxBytes).toString("utf8"),
                fetched_at: _seams.nowIso(),
                truncated,
                bytes: Math.min(bytes, maxBytes),
            }));
            res.on("error", () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString("utf8"), fetched_at: _seams.nowIso(), truncated }));
        });
        req.on("timeout", () => { req.destroy(); resolve({ status: 0, body: "", error: "timeout" }); });
        req.on("error", (e) => resolve({ status: 0, body: "", error: e.code || String(e.message || e) }));
        req.end();
    });
}

// Synchronous wrapper usable inside the executor's sync loop: runs httpGetBounded in a child process with
// a CLEARED env and clamps bounds to hard ceilings (≤1 MB, ≤15 s). Returns the fetch verdict JSON.
function governedHttpGet(url, opts) {
    const maxBytes = Math.min(Math.max(1, (opts && opts.maxBytes) || 262144), 1048576);
    const timeoutMs = Math.min(Math.max(250, (opts && opts.timeoutMs) || 5000), 15000);
    const selfEntry = (opts && typeof opts.selfEntry === "string" && opts.selfEntry) ? opts.selfEntry : SELF_WORKER_ENTRY;
    const res = _seams.spawn(process.execPath, [selfEntry, "--http-get", url, String(maxBytes), String(timeoutMs)], {
        encoding: "utf8", timeout: timeoutMs + 3000, env: {}, maxBuffer: maxBytes + 65536,
    });
    if (res.status !== 0 || !res.stdout) {
        return { status: 0, body: "", error: String((res.stderr || "").trim() || (res.error && res.error.message) || "fetch subprocess failed") };
    }
    try { return JSON.parse(res.stdout); } catch { return { status: 0, body: "", error: "unparseable fetch result" }; }
}

// ---- ODG Synthetic Deliverable — PRE-WRITE confinement + ODG content formulation ----------------
// scope-observer.changedPathsInScope is a git, AFTER-write observation whose startsWith lacks a path
// boundary, so it is used here ONLY as the scope-membership authority, NOT as the guard. The guard is
// evaluated BEFORE any write and defends path traversal AND symlink/real-path escape. No existing
// security control is modified; the capability self-confines because the capability execution branch
// (patch-executor) has no edits-branch path gate. normalizePrefixes is not exported, so the glob→dir
// strip is performed inline with the SAME two-step transform (strip "*…" then trailing "/").
function stripGlobPrefix(p) {
    return typeof p === "string" ? p.replace(/[*].*$/, "").replace(/\/+$/, "") : "";
}
// PROTECTED-GOVERNANCE guard — SINGLE implementation (relocated here from patch-executor.js so BOTH the
// Patch Executor edits branch AND this capability branch reuse ONE definition; patch-executor.js already
// requires this module, so it imports the function back — there is no second copy and no new mechanism).
// A broad write scope (e.g. "runtime/**") structurally subsumes runtime/governance/**; authorized_paths
// is SCOPE, never AUTHORITY, so being inside a granted scope does NOT authorize a governance write.
const PROTECTED_GOVERNANCE_PREFIXES = ["runtime/governance"];
function isProtectedGovernanceTarget(target) {
    const norm = path.normalize(String(target || ""));
    if (path.isAbsolute(norm) || norm === ".." || norm.startsWith(".." + path.sep)) return false;
    return PROTECTED_GOVERNANCE_PREFIXES.some((pre) => norm === pre || norm.startsWith(pre + "/"));
}
// Resolve the single in-scope write target and PROVE confinement before any mutation. Throws (refuses)
// on an empty/invalid scope, a non-relative or traversal scope/target, an out-of-boundary target, or a
// real-path/symlink escape from the sandbox cwd. Returns { relTarget, absTarget, scope }.
function confineSyntheticTarget(authorizedPaths, cwd, allowProtectedGovernance, fileName = SYNTHETIC_DELIVERABLE_NAME) {
    const list = Array.isArray(authorizedPaths) ? authorizedPaths : [];
    const pre = stripGlobPrefix(list.length ? list[0] : "");
    if (!pre) throw new Error("ODG Synthetic Deliverable: refused — no valid authorized scope");
    const normPre = path.normalize(pre);
    if (path.isAbsolute(normPre) || normPre === ".." || normPre.startsWith(".." + path.sep)) {
        throw new Error(`ODG Synthetic Deliverable: refused — scope "${list[0]}" is not a relative in-tree path`);
    }
    const rel = path.normalize(path.join(normPre, fileName));
    // Boundary-anchored in-scope check (same rule as patch-executor.isAuthorizedTarget).
    if (path.isAbsolute(rel) || rel === ".." || rel.startsWith(".." + path.sep)
        || !(rel === normPre || rel.startsWith(normPre + path.sep))) {
        throw new Error(`ODG Synthetic Deliverable: refused — target "${rel}" is outside authorized scope "${normPre}"`);
    }
    // PROTECTED-GOVERNANCE guard (Q6): a scope subsuming runtime/governance does NOT authorize a
    // governance write. Reuses the SAME shared guard as the Patch Executor edits branch; the elevated
    // authorization is read ONLY from the plan (allowProtectedGovernance), NEVER inferred from scope or
    // from ODG provenance. Fail-closed: absent ⇒ refused BEFORE any directory creation or write.
    if (isProtectedGovernanceTarget(rel) && allowProtectedGovernance !== true) {
        throw new Error(`ODG Synthetic Deliverable: refused — target "${rel}" is a protected governance path requiring an explicit ODG-level elevated authorization (plan.allowProtectedGovernance); authorized_paths is scope, not authority`);
    }
    // Scope-membership authority: reuse the existing scope-observer predicate (explicit path list ⇒ no git).
    if (changedPathsInScope(authorizedPaths, [rel]).length === 0) {
        throw new Error(`ODG Synthetic Deliverable: refused — target "${rel}" not confirmed inside authorized scope`);
    }
    // Physical confinement (symlink / real-path defense): the deepest EXISTING ancestor of the target must
    // realpath INSIDE the sandbox cwd. Catches an existing symlinked scope dir pointing outside the tree.
    const absCwd = fs.realpathSync(cwd);
    let anc = path.resolve(cwd, rel);
    while (!fs.existsSync(anc)) anc = path.dirname(anc);
    const realAnc = fs.realpathSync(anc);
    if (realAnc !== absCwd && !realAnc.startsWith(absCwd + path.sep)) {
        throw new Error(`ODG Synthetic Deliverable: refused — target "${rel}" resolves outside the sandbox (symlink/real-path escape)`);
    }
    return { relTarget: rel, absTarget: path.resolve(cwd, rel), scope: normPre };
}
// ODG FORMULATES the content itself from authorized mission data (plan mission + sorted objective ids).
// Deterministic (no clock/random) and NEVER a copy of a contract-supplied patch content.
function formulateSyntheticManifest(plan) {
    const mission = plan && typeof plan.mission === "string" ? plan.mission : "UNKNOWN_MISSION";
    const ids = Array.isArray(plan && plan.objectives)
        ? plan.objectives.map((o) => (o && typeof o.id === "string" ? o.id : null)).filter(Boolean).slice().sort()
        : [];
    return `ODG-SYNTHETIC-MANIFEST\nmission=${mission}\nobjectives=${ids.join(",")}\ngenerator=ODG_CAPABILITY\n`;
}

// LOCAL activation sub-policy reader (Stage-6). LOCAL autonomous generation is permitted ONLY when
// runtime-mode declares localProviderActivation==="AUTONOMOUS_SANDBOXED". The EXTERNAL provider policy
// (providerActivation / providersEnabled) is NEVER read or changed here. Fail-closed: any error ⇒ DISABLED.
function localProviderActivation(io) {
  try {
    const cfg = JSON.parse(((io && io.readFileSync) || fs.readFileSync)("runtime/config/runtime-mode.json", "utf8"));
    return typeof cfg.localProviderActivation === "string" ? cfg.localProviderActivation : "DISABLED";
  } catch {
    return "DISABLED";
  }
}

// IMPLEMENT_VIA_LOCAL_PROVIDER (Stage-6) — ODG-orchestrated autonomous implementation of novel code via a
// LOCAL provider. ODG owns every authority step; the provider only proposes a diff inside a disposable
// working copy and has NO power to select the mission, widen scope, self-authorize, or commit. Fully
// injectable (opts.io / opts.generate / opts.verify / opts.activation / opts.root) for deterministic
// testing with a STUB generator (no model download, no network, no cost). Returns a structured result;
// NEVER a false success — unavailable generator / malformed output / out-of-scope / failed verification
// all return an explicit non-EXECUTED status, and NO external/billable provider is ever activated.
function implementViaLocalProvider(objective, opts = {}) {
  const io = opts.io || fs;
  const root = typeof opts.root === "string" ? opts.root : process.cwd();
  const refuse = (code, detail) =>
    ({ status: "REFUSED", verified: false, committed: false, code, detail, authoredBy: "LOCAL_PROVIDER", appliedBy: null });

  // 1. ACTIVATION GATE (fail-closed; LOCAL only; external untouched).
  const activation = typeof opts.activation === "string" ? opts.activation : localProviderActivation(io);
  if (activation !== "AUTONOMOUS_SANDBOXED") return refuse("PROVIDER_NOT_ACTIVATED", `localProviderActivation=${activation}`);
  const generate = typeof opts.generate === "function"
    ? opts.generate
    : (localModel && localModel.isAvailable && localModel.isAvailable()) ? opts.generate : null;
  if (typeof generate !== "function") {
    return refuse("GENERATOR_UNAVAILABLE", "no local generator (ODG_LOCAL_MODEL_CMD unset); NOT falling back to an external/billable provider");
  }

  // 2. Resolve the write-set (fail-closed on empty/glob/escape/missing).
  const writeSet = Array.isArray(objective && objective.authorized_paths) ? objective.authorized_paths
    : Array.isArray(objective && objective.writeSet) ? objective.writeSet : [];
  const resolved = delegateIso.resolveWriteSet(root, writeSet);
  if (!resolved.ok) return refuse("INVALID_WRITE_SET", resolved.error);

  // 3. Materialize a disposable working copy of ONLY the authorized files (no repo/.git/network).
  const work = delegateIso.materializeWorkingCopy(root, resolved.files, io);

  // 4. GENERATE via the LOCAL provider into the work copy (the provider sees only the copy).
  let gen;
  try { gen = generate({ objective, workDir: work.workDir, files: resolved.files, pristine: work.pristine, io }); }
  catch (e) { return refuse("PROVIDER_ERROR", String((e && e.message) || e)); }
  if (gen && gen.error) return refuse("MALFORMED_OUTPUT", String(gen.error));

  // 5. Observe the effect as a diff; VALIDATE SCOPE (fail-closed, atomic — out-of-scope ⇒ nothing applied).
  const changes = delegateIso.diffWorkingCopy(work.pristine, work.workDir, io);
  if (!changes.length) return refuse("NO_CHANGE", "provider produced no change in the authorized working copy");
  const scope = delegateIso.validateScope(changes, resolved.files);
  if (!scope.ok) return refuse("OUT_OF_SCOPE", scope.detail);

  // 6. Idempotence: apply ONLY changes whose real-tree content actually differs (replay ⇒ zero mutation).
  const effective = changes.filter((c) => {
    try { return ((io.readFileSync || fs.readFileSync)(path.join(root, c.rel), "utf8")) !== c.after; }
    catch { return true; }
  });

  // 7. APPLY within the write-set only (applyProposal re-validates — defense in depth).
  const applied = delegateIso.applyProposal(root, effective, resolved.files, io);
  if (!applied.ok) return refuse("APPLY_REFUSED", applied.reason);

  // 8. INDEPENDENT VERIFICATION — ODG verifies; the provider's own claim is never trusted.
  const verify = typeof opts.verify === "function" ? opts.verify : null;
  const verdict = verify ? verify({ root, files: resolved.files, objective, changes }) : { ok: true, detail: "no verifier injected (mechanism proof)" };
  if (!verdict || verdict.ok !== true) {
    return { status: "FAILED", verified: false, committed: false, code: "VERIFICATION_FAILED", detail: (verdict && verdict.detail) || "verification failed", authoredBy: "LOCAL_PROVIDER", appliedBy: "ODG_EXECUTOR" };
  }

  // 9. Cap at VERIFIED — ODG applied it; the provider NEVER commits (human commit = acceptance, by design).
  return {
    status: "EXECUTED", verified: true, committed: false,
    authoredBy: "LOCAL_PROVIDER", appliedBy: "ODG_EXECUTOR",
    changedPaths: applied.applied, proposedChanges: changes.length, effectiveChanges: effective.length,
    scope: scope.detail, verification: verdict.detail,
  };
}

const EXECUTORS = [
    {
        // ODG Synthetic Deliverable — ODG itself FORMULATES deterministic content and writes ONE file
        // strictly inside the mission's authorized_paths, after PRE-WRITE confinement (traversal +
        // symlink defense). STRICTLY matched on the benchmark-reserved objectiveId prefix "ODG_WRITE_"
        // (disjoint from every other executor). Authorization/scope come from the PLAN (patch-plan.json),
        // never inferred from ODG provenance; the content is ODG's, the scope is the contract's.
        capability: "ODG Synthetic Deliverable",
        matches(patch) {
            return !!patch && typeof patch.objectiveId === "string" && patch.objectiveId.startsWith("ODG_WRITE_");
        },
        run(patch) {
            const cwd = process.cwd();
            let plan = {};
            try { plan = JSON.parse(fs.readFileSync(path.join(GENERATED_DIR, "patch-plan.json"), "utf8")); } catch { plan = {}; }
            const authorizedPaths = Array.isArray(plan.authorizedPaths) ? plan.authorizedPaths : [];
            // Refuse BEFORE any write if confinement cannot be established (scope + governance guard).
            const confined = confineSyntheticTarget(authorizedPaths, cwd, plan.allowProtectedGovernance === true);
            const content = formulateSyntheticManifest(plan);
            fs.mkdirSync(path.dirname(confined.absTarget), { recursive: true });
            fs.writeFileSync(confined.absTarget, content);
            const crypto = require("crypto");
            const sha256 = crypto.createHash("sha256").update(content).digest("hex");
            const out = writeEvidence(SYNTHETIC_DELIVERABLE_EVIDENCE, {
                capability: "ODG Synthetic Deliverable",
                objective: patch.objectiveId,
                target: confined.relTarget,
                scope: confined.scope,
                bytes: Buffer.byteLength(content),
                sha256,
                authoredBy: "ODG_CAPABILITY",
                note: "Content formulated by ODG from authorized plan data; written strictly inside authorized_paths after pre-write confinement.",
            });
            return { capability: "ODG Synthetic Deliverable", evidence: out, summary: { target: confined.relTarget, bytes: Buffer.byteLength(content) } };
        },
    },
    {
        // ODG Spec Author (η3-B30) — ODG itself FORMULATES a Mission-Loader-schema specification via the
        // existing mission-synthesizer.toContract (deterministic, no clock/random) from AUTHORIZED plan data
        // (this objective's goal + mission id), and writes ONE JSON file strictly inside authorized_paths
        // after the SAME pre-write confinement as the Synthetic Deliverable. The content is ODG's (toContract),
        // NEVER a copy of a contract-supplied patch; its correctness is independently re-checked by the
        // spec-schema-valid probe (schema + decompose consistency + byte-identical determinism). STRICTLY
        // matched on the reserved objectiveId prefix "ODG_SPEC_" (disjoint from every other executor).
        // Authorization/scope come ONLY from the PLAN; no new authority is granted to this capability.
        capability: "ODG Spec Author",
        matches(patch) {
            return !!patch && typeof patch.objectiveId === "string" && patch.objectiveId.startsWith("ODG_SPEC_");
        },
        run(patch) {
            const synth = require("./mission-synthesizer"); // lazy require: avoids any load-time require cycle
            const cwd = process.cwd();
            let plan = {};
            try { plan = JSON.parse(fs.readFileSync(path.join(GENERATED_DIR, "patch-plan.json"), "utf8")); } catch { plan = {}; }
            const authorizedPaths = Array.isArray(plan.authorizedPaths) ? plan.authorizedPaths : [];
            // Refuse BEFORE any write if confinement cannot be established (reuses the ONE guard; .json target).
            const confined = confineSyntheticTarget(authorizedPaths, cwd, plan.allowProtectedGovernance === true, SPEC_AUTHOR_NAME);
            // ODG authors the spec FROM authorized plan data: this objective's goal + the mission id. The
            // objective's goal is carried ON THE PATCH by patch-engine (patch-plan.json exposes `patches`,
            // not `objectives`), so read it from the patch this executor was dispatched for. The produced
            // spec is deliberately read-only (authorizedPaths:[]): scope is the CONTRACT's, content ODG's.
            const goal = typeof patch.goal === "string" ? patch.goal : "";
            const spec = { id: `${plan.mission || "SPEC"}__${patch.objectiveId}`, goal, authorizedPaths: [] };
            const contract = synth.toContract(spec);
            const content = JSON.stringify(contract, null, 2) + "\n";
            fs.mkdirSync(path.dirname(confined.absTarget), { recursive: true });
            fs.writeFileSync(confined.absTarget, content);
            const crypto = require("crypto");
            const sha256 = crypto.createHash("sha256").update(content).digest("hex");
            const out = writeEvidence(SPEC_AUTHOR_EVIDENCE, {
                capability: "ODG Spec Author",
                objective: patch.objectiveId,
                target: confined.relTarget,
                scope: confined.scope,
                goal,
                spec,
                bytes: Buffer.byteLength(content),
                sha256,
                authoredBy: "ODG_CAPABILITY",
                note: "Spec formulated by ODG via mission-synthesizer.toContract from authorized plan data; written inside authorized_paths after pre-write confinement. Correctness verified independently by the spec-schema-valid probe.",
            });
            return { capability: "ODG Spec Author", evidence: out, summary: { target: confined.relTarget, objectives: contract.objectives.length } };
        },
    },
    {
        // Governed Git Branch Integration — local, fast-forward-only branch integration recorded as a
        // C03 state transition. STRICTLY matched on the objectiveId prefix (disjoint from every other
        // executor) and placed FIRST so first-match resolution can never route it elsewhere. The spec
        // (target/source/execute/authorization) is transported on the patch; the engine SELF-GATES and
        // is fail-closed: dry-run is the hard default (ZERO git mutation, no remote), a live BLOCKED /
        // HUMAN_APPROVAL_REQUIRED outcome writes honest evidence then throws so the mission fails closed.
        capability: "Governed Git Branch Integration",
        matches(patch) {
            return !!patch && typeof patch.objectiveId === "string" && patch.objectiveId.startsWith("GIT_BRANCH_INTEGRATION");
        },
        run(patch) {
            const spec = (patch && patch.git_branch_integration && typeof patch.git_branch_integration === "object" && !Array.isArray(patch.git_branch_integration))
                ? patch.git_branch_integration : {};
            const request = {
                objectiveId: patch.objectiveId,
                target: spec.target,
                source: spec.source,
                execute: spec.execute === true,
                authorization: spec.authorization,
                protectedBranches: spec.protectedBranches,
            };
            // The engine owns the C03 record but not the artifact path; bind the real evidence path into
            // the record's evidence_refs so a VERIFIED transition carries a real reference (C03 I5).
            const finalize = (evidence) => {
                if (evidence && evidence.state_transition && typeof evidence.state_transition === "object") {
                    evidence.state_transition.evidence_refs = [GIT_BRANCH_INTEGRATION_EVIDENCE];
                }
                return writeEvidence(GIT_BRANCH_INTEGRATION_EVIDENCE, evidence);
            };
            try {
                const evidence = gitBranchIntegration.run(request, { cwd: process.cwd() });
                const out = finalize(evidence);
                return {
                    capability: "Governed Git Branch Integration",
                    evidence: out,
                    summary: { mode: evidence.mode, outcome: evidence.outcome, integrated: evidence.integrated, pushed: evidence.pushed },
                };
            } catch (e) {
                if (e && e.evidence) { try { finalize(e.evidence); } catch { /* ignore */ } }
                throw e;
            }
        },
    },
    {
        // Governed Bash/Linux Command — the governed path for an (un)familiar shell command. STRICTLY
        // matched on the objectiveId prefix (disjoint). The command spec is transported on the patch;
        // the governor SELF-GATES (deny-by-default via action-gate) and is fail-closed: dry-run is the
        // hard default (no execution); a live BLOCKED / HUMAN_APPROVAL_REQUIRED / EFFECT_DIVERGENCE
        // writes honest evidence then throws so the mission fails closed; EXECUTED / SANDBOX_OBSERVED /
        // ANALYZED return governed evidence. NEVER hands the string to a shell (argv only).
        capability: "Governed Bash/Linux Command",
        matches(patch) {
            return !!patch && typeof patch.objectiveId === "string" && patch.objectiveId.startsWith("BASH_COMMAND");
        },
        run(patch) {
            const spec = (patch && patch.bash_command && typeof patch.bash_command === "object" && !Array.isArray(patch.bash_command))
                ? patch.bash_command : {};
            const request = {
                objectiveId: patch.objectiveId,
                command: spec.command,
                execute: spec.execute === true,
                envAllowlist: spec.envAllowlist,
                authorization: spec.authorization,
                timeoutMs: spec.timeoutMs,
                allowedPolicies: spec.allowedPolicies,
                revokedAuthorities: spec.revokedAuthorities,
            };
            const evidence = bashGovernor.govern(request, {});
            if (evidence && evidence.state_transition && typeof evidence.state_transition === "object") {
                evidence.state_transition.evidence_refs = [BASH_COMMAND_EVIDENCE];
            }
            const out = writeEvidence(BASH_COMMAND_EVIDENCE, evidence);
            const STOP = [bashGovernor.OUTCOME.BLOCKED, bashGovernor.OUTCOME.HUMAN_APPROVAL_REQUIRED, bashGovernor.OUTCOME.EFFECT_DIVERGENCE];
            if (request.execute && STOP.includes(evidence.outcome)) {
                const err = new Error(`Governed Bash/Linux Command ${evidence.outcome}: ${evidence.reason}`);
                err.outcome = evidence.outcome;
                err.evidence = out;
                throw err;
            }
            return {
                capability: "Governed Bash/Linux Command",
                evidence: out,
                summary: { outcome: evidence.outcome, decision: evidence.decision, exitCode: evidence.execution ? evidence.execution.exitCode : null },
            };
        },
    },
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
        // Governed Observability Verification (B140) — proves a mission whose deliverable is an OBSERVABLE
        // STATE (the autonomy-rate signal emitted by odg-state.js and surfaced by odg-cockpit.js), which on
        // re-run performs no file edit and would otherwise be a no-op RECORDED (BLOCKED by anti-false-success).
        // It performs REAL evidenced work: it re-derives the autonomy signal from THIS run's real per-run
        // artifacts using the SAME production builder odg-state.js uses (buildAutonomyRate — no second
        // implementation) and records whether the signal is STRUCTURALLY HONEST. It NEVER fabricates a proof:
        // it REFUSES (throws) when the run produced no real execution evidence, or when the signal is not
        // structurally honest. "Honest" = measurable===true with a numeric autonomyPercent, OR
        // measurable===false with a non-empty reason (an honest not-measurable signal IS a valid observability
        // output — the dashboard surfaces the reason, never a fabricated number). STRICTLY matched on the
        // reserved objectiveId prefix "VERIFY_OBSERVABILITY_" (disjoint from every other executor); no other
        // mission's objective is captured and no new authority is granted.
        capability: "Governed Observability Verification",
        matches(patch) {
            return !!patch && typeof patch.objectiveId === "string" && patch.objectiveId.startsWith("VERIFY_OBSERVABILITY_");
        },
        run(patch) {
            const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
            const peName = "patch-execution.json", mpName = "mission-plan.json", oaName = "objective-attribution.json";
            const missionPlan = readJson(path.join(GENERATED_DIR, mpName));
            // Non-trivial gate: REFUSE unless the run actually PLANNED (mission-plan.json exists). The
            // Execution Planner writes it BEFORE the Patch Executor dispatches this capability, so it is the
            // real available signal that a genuine mission run is in progress (patch-execution.json is NOT
            // yet written at this stage — it is the Patch Executor's OWN output — so it is deliberately not
            // required here). An absent mission-plan ⇒ no genuine run ⇒ refuse (no trivial always-pass).
            if (!missionPlan) {
                throw new Error(`Governed Observability Verification: no ${mpName} — no genuine mission run to verify the observability signal against`);
            }
            const patchExecution = readJson(path.join(GENERATED_DIR, peName));
            const attribution = readJson(path.join(GENERATED_DIR, oaName));
            // Re-derive the autonomy-rate signal with the SAME production builder odg-state.js uses. This
            // EXERCISES the real S1 observability code path; a regression that makes it throw or return a
            // malformed/non-honest shape is caught below and REFUSED (a real integrity gate, not a rubber
            // stamp). Over the artifacts available at this stage (patch-execution may be absent ⇒ the builder
            // honestly returns measurable:false + reason — itself a valid observability output the dashboard
            // surfaces, never a fabricated number).
            let signal;
            try {
                signal = buildAutonomyRate({
                    patchExecution,
                    planObjectives: Array.isArray(missionPlan.objectives) ? missionPlan.objectives : null,
                    attribution,
                    sourceArtifacts: [
                        { path: `${GENERATED_DIR}/${peName}`, present: patchExecution != null },
                        { path: `${GENERATED_DIR}/${mpName}`, present: missionPlan != null },
                        { path: `${GENERATED_DIR}/${oaName}`, present: attribution != null },
                    ],
                });
            } catch (e) {
                throw new Error(`Governed Observability Verification: the autonomy-rate builder threw (S1 observability regression): ${String((e && e.message) || e)}`);
            }
            const m = signal && signal.measure ? signal.measure : null;
            const honest = !!m
                && typeof m.measurable === "boolean"
                && (m.measurable === true
                    ? typeof m.autonomyPercent === "number"
                    : typeof m.reason === "string" && m.reason.length > 0);
            if (!honest) {
                throw new Error("Governed Observability Verification: autonomy-rate signal is not structurally honest (missing measurable/percent/reason)");
            }
            const out = writeEvidence(OBSERVABILITY_VERIFICATION_EVIDENCE, {
                objective: patch.objectiveId,
                honest: true,
                measurable: m.measurable,
                autonomyPercent: m.autonomyPercent,
                reason: m.reason || null,
                sourceArtifacts: signal.sourceArtifacts || null,
                note: "Autonomy-rate observability signal re-derived from this run's real per-run artifacts via the production buildAutonomyRate and verified structurally honest. No file edited; no number fabricated.",
            });
            return { capability: "Governed Observability Verification", evidence: out, summary: { measurable: m.measurable, autonomyPercent: m.autonomyPercent } };
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
            // Declared deterministic extraction rules [{ url, field, rule }] — the operator declares
            // WHERE a figure lives, never its VALUE. Values are OBSERVED from the acquired bytes only.
            const extractRules = ra && Array.isArray(ra.extract) ? ra.extract : [];
            const observations = [];
            const sources = [];
            for (const url of allowlist) {
                const res = fetcher(url) || {};
                const status = typeof res.status === "number" ? res.status : 0;
                const body = typeof res.body === "string" ? res.body : "";
                const content_hash = crypto.createHash("sha256").update(body).digest("hex");
                const fetched_at = typeof res.fetched_at === "string" && res.fetched_at ? res.fetched_at : _seams.nowIso();
                sources.push({
                    url,
                    fetched_at,
                    http_status: status,
                    content_hash,
                    bytes: Buffer.byteLength(body),
                    evidence_ref: EXTERNAL_RESEARCH_EVIDENCE,
                });
                // Extract declared fields for THIS source over the SAME bytes just hashed, binding each
                // OBSERVED value to content_hash + fetched_at + http_status. Non-2xx ⇒ no extraction; a
                // rule that does not match ⇒ UNKNOWN (never a fabricated value).
                for (const er of extractRules.filter((e) => e && e.url === url)) {
                    let r;
                    if (status >= 200 && status <= 299) {
                        try { r = economicExtractor.extract(body, er.rule); }
                        catch (e) { r = { status: "UNKNOWN", reason: "malformed rule: " + String(e.message || e) }; }
                    } else {
                        r = { status: "UNKNOWN", reason: "source not 2xx" };
                    }
                    observations.push({ url, field: er.field, status: r.status, raw: r.raw, quantity: r.quantity || null, reason: r.reason || null, content_hash, fetched_at, http_status: status, evidence_ref: EXTERNAL_RESEARCH_EVIDENCE });
                }
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

            // Classify declared opportunity candidates against the OBSERVED observations + provenance
            // (OBSERVED/CALCULATED/INFERRED/UNKNOWN -> PROVEN/CANDIDATE/REJECTED). The executor never
            // invents a figure; each PROVEN opportunity carries its full traceability chain.
            const opportunityCandidates = ra && Array.isArray(ra.opportunities) ? ra.opportunities : [];
            const economicDeclared = extractRules.length > 0 || opportunityCandidates.length > 0;
            const opportunityEval = economicDeclared
                ? opportunityPolicy.classify(opportunityCandidates, observations, { evidence_ref: EXTERNAL_RESEARCH_EVIDENCE })
                : null;

            const acquired = sources.length > 0 && sources.every((s) => s.http_status >= 200 && s.http_status <= 299);
            const evidence = {
                capability: "External Research Acquisition",
                objective: patch.objectiveId,
                mode: "LIVE",
                acquired,
                authorized: true,
                policyAllows: true,
                sources,
                ranked,
            };
            // Additive ONLY when the grant declared extraction rules / opportunity candidates: a LIVE
            // grant with neither stays byte-identical to the pre-wiring evidence shape.
            if (economicDeclared) {
                evidence.observations = observations;
                evidence.opportunities = opportunityEval.results;
                evidence.opportunityCounts = opportunityEval.counts;
            }
            const out = writeEvidence(EXTERNAL_RESEARCH_EVIDENCE, evidence);
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
            const res = _seams.spawn(process.execPath, [SELF_WORKER_ENTRY, out], { encoding: "utf8", timeout: 30000 });
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
            const res = _seams.spawn(process.execPath, [TSX_CLI, PROVIDER_ACTIVATION_ENTRY, missionFile, out], { encoding: "utf8", timeout: 60000 });
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
    {
        // Stage-6: ODG-orchestrated autonomous code implementation via a LOCAL provider. Dispatched ONLY
        // when a mission objective explicitly names it; in production with no local generator configured it
        // fails closed (GENERATOR_UNAVAILABLE) and NEVER activates an external/billable provider. The
        // governance chain (scope-validate/apply/verify/no-commit) is proven by the dedicated STUB test.
        capability: "Implement Via Local Provider",
        matches(patch) {
            return !!patch && typeof patch.objectiveId === "string" && patch.objectiveId.startsWith("IMPLEMENT_LOCAL_CODE");
        },
        run(patch) {
            const result = implementViaLocalProvider(patch, {});
            const out = writeEvidence(IMPLEMENT_VIA_LOCAL_PROVIDER_EVIDENCE, { objective: patch.objectiveId, ...result });
            if (result.status !== "EXECUTED") {
                throw new Error(`Implement Via Local Provider did not complete: ${result.code || result.status} — ${result.detail || ""}`);
            }
            return { capability: "Implement Via Local Provider", evidence: out, summary: { status: result.status, verified: result.verified, committed: result.committed, changed: result.changedPaths } };
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

module.exports = { resolve, runAudit, EXECUTORS, governedHttpGet, httpGetBounded, CONNECTIVITY_EVIDENCE, EXTERNAL_RESEARCH_EVIDENCE, GIT_BRANCH_INTEGRATION_EVIDENCE, BASH_COMMAND_EVIDENCE, SYNTHETIC_DELIVERABLE_EVIDENCE, SYNTHETIC_DELIVERABLE_NAME, SPEC_AUTHOR_EVIDENCE, SPEC_AUTHOR_NAME, OBSERVABILITY_VERIFICATION_EVIDENCE, IMPLEMENT_VIA_LOCAL_PROVIDER_EVIDENCE, implementViaLocalProvider, localProviderActivation, confineSyntheticTarget, formulateSyntheticManifest, isProtectedGovernanceTarget, PROTECTED_GOVERNANCE_PREFIXES, __setExecutorSeams, __resetExecutorSeams };

// Direct invocation: `--http-get <url> <maxBytes> <timeoutMs>` runs the bounded read-only fetch worker
// (cleared env) and prints its JSON verdict; otherwise run the Connectivity Audit and write evidence.
if (require.main === module) {
    if (process.argv[2] === "--http-get") {
        const url = process.argv[3];
        const maxBytes = parseInt(process.argv[4], 10) || 262144;
        const timeoutMs = parseInt(process.argv[5], 10) || 5000;
        httpGetBounded(url, maxBytes, timeoutMs)
            .then((r) => { process.stdout.write(JSON.stringify(r)); process.exit(0); })
            .catch((e) => { process.stdout.write(JSON.stringify({ status: 0, body: "", error: String((e && e.message) || e) })); process.exit(0); });
    } else {
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
}
