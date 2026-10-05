#!/usr/bin/env node

/*
 * Capability Probe Framework.
 *
 * A capability probe turns a mission's Definition of Done into machine-verified evidence: given an
 * `evidence` name it returns a pure { ok, detail } verdict computed from real generated artifacts.
 * Previously these lived as an inline switch in the Validation Engine; they are now a real, named
 * registry so probes can be looked up, added, and reused without touching the validation gate.
 *
 * REQUIRED-PROOF GATE (see `evaluate`): a mission declares its proofs in the contract `verify` block.
 * Each entry is REQUIRED by default (opt out with `required: false`). SUCCESS is blocked whenever a
 * required proof is missing — the probe is unregistered, or its evidence artifact is absent/failing.
 * Optional proofs are recorded for the report but never block.
 *
 * INTERNET CAPABILITY: the `internet-reachable` probe reuses the existing Provider/Connector
 * architecture — the Connectivity Audit capability executor (capability-executors.js) is the
 * connector that reaches DNS / HTTP / the AI providers and writes connectivity-audit.json. This
 * probe proves that connector's evidence rather than re-implementing network access, keeping the
 * validation gate synchronous and deterministic.
 */

"use strict";

const fs = require("fs");
const { CONNECTIVITY_EVIDENCE, EXTERNAL_RESEARCH_EVIDENCE, GIT_BRANCH_INTEGRATION_EVIDENCE, BASH_COMMAND_EVIDENCE } = require("./capability-executors");
const { validateStateTransition } = require("./state-transition");

function readJsonSafe(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

// Registry: evidence name → pure probe (ctx) => { ok, detail }.
// ctx carries the run-scoped facts a probe may need: { missionId, verify }.
const PROBES = {
    "fleet-request-validated"(ctx) {
        // The Fleet exchange (Dispatcher → Bridge → Collector) must have driven at least one
        // request for THIS mission to the VALIDATED terminal status.
        const missionId = ctx.missionId;
        const dir = "runtime/generated/fleet/requests";
        let files = [];
        try { files = fs.readdirSync(dir); } catch { return { ok: false, detail: "no fleet requests dir" }; }
        const mine = files
            .filter((f) => f.startsWith(missionId + "-") && f.endsWith(".json"))
            .map((f) => readJsonSafe(`${dir}/${f}`))
            .filter(Boolean);
        const validated = mine.filter((r) => r.status === "VALIDATED");
        return validated.length > 0
            ? { ok: true, detail: `${validated.length}/${mine.length} fleet request(s) VALIDATED` }
            : { ok: false, detail: `no VALIDATED fleet request for ${missionId} (${mine.length} found)` };
    },

    "build-green"(ctx) {
        return ctx.verify && ctx.verify.build === true
            ? { ok: true, detail: "runtime-verify.json build=true" }
            : { ok: false, detail: "build gate not green (runtime-verify.json)" };
    },

    "typescript-green"(ctx) {
        return ctx.verify && ctx.verify.typescript === true
            ? { ok: true, detail: "runtime-verify.json typescript=true" }
            : { ok: false, detail: "typescript gate not green (runtime-verify.json)" };
    },

    "internet-reachable"() {
        // Reuse the Connectivity Audit connector's evidence (Provider/Connector architecture) rather
        // than performing network I/O here — the executor already reached the network and recorded an
        // honest verdict. No evidence means the capability was never exercised: a MISSING proof.
        const audit = readJsonSafe(CONNECTIVITY_EVIDENCE);
        if (!audit) {
            return { ok: false, detail: `no Connectivity Audit evidence at ${CONNECTIVITY_EVIDENCE} — run the Connectivity Audit capability first` };
        }
        const reachable = audit.internet && audit.internet.reachable === true;
        const http = (audit.summary && audit.summary.http) || "n/a";
        return reachable
            ? { ok: true, detail: `internet reachable per Connectivity Audit (http ${http})` }
            : { ok: false, detail: "Connectivity Audit reports internet NOT reachable" };
    },

    "research-acquired"() {
        // Verified external-research proof. Reads ONLY the External Research Acquisition executor's
        // evidence — NEVER the Connectivity Audit / reachability evidence. Reachability can therefore
        // never satisfy this proof. A dry-run (acquired:false) also fails: a plan is not research.
        // FAILS unless: evidence present, acquired===true, at least one per-source provenance record,
        // every record carries url + fetched_at + 2xx http_status + sha256 content_hash + bytes +
        // evidence_ref, and every ranked citation resolves to one of those verified records.
        const ev = readJsonSafe(EXTERNAL_RESEARCH_EVIDENCE);
        if (!ev) {
            return { ok: false, detail: `no external research acquisition evidence at ${EXTERNAL_RESEARCH_EVIDENCE} — reachability does NOT satisfy research-acquired` };
        }
        if (ev.acquired !== true) {
            return { ok: false, detail: `research not acquired (mode=${ev.mode || "unknown"}); a dry-run/plan or reachability does NOT satisfy research-acquired` };
        }
        const sources = Array.isArray(ev.sources) ? ev.sources : [];
        if (sources.length === 0) {
            return { ok: false, detail: "no per-source provenance records captured" };
        }
        const HEX64 = /^[0-9a-f]{64}$/;
        const verified = new Set();
        for (const s of sources) {
            if (!s || typeof s !== "object") return { ok: false, detail: "malformed provenance record" };
            if (typeof s.url !== "string" || !s.url) return { ok: false, detail: "provenance record missing url" };
            if (typeof s.fetched_at !== "string" || !s.fetched_at) return { ok: false, detail: `provenance ${s.url} missing fetched_at` };
            if (typeof s.http_status !== "number" || s.http_status < 200 || s.http_status > 299) return { ok: false, detail: `provenance ${s.url} not 2xx (status=${s.http_status})` };
            if (typeof s.content_hash !== "string" || !HEX64.test(s.content_hash)) return { ok: false, detail: `provenance ${s.url} missing/invalid sha256 content_hash` };
            if (typeof s.bytes !== "number" || s.bytes < 0) return { ok: false, detail: `provenance ${s.url} missing bytes` };
            if (typeof s.evidence_ref !== "string" || !s.evidence_ref) return { ok: false, detail: `provenance ${s.url} missing evidence_ref` };
            verified.add(s.url);
        }
        const ranked = Array.isArray(ev.ranked) ? ev.ranked : [];
        for (const item of ranked) {
            const cites = Array.isArray(item && item.sources) ? item.sources : [];
            if (cites.length === 0) return { ok: false, detail: `ranked item "${item && item.name}" cites no source` };
            for (const u of cites) {
                if (!verified.has(u)) return { ok: false, detail: `ranked item "${item && item.name}" cites unverified source ${u}` };
            }
        }
        return { ok: true, detail: `research acquired: ${sources.length} verified source(s), ${ranked.length} ranked item(s)` };
    },

    "git-branch-integrated"() {
        // Verified governed-git proof. Reads ONLY the Governed Git Branch Integration executor's
        // evidence. A dry-run (outcome=DRY_RUN) or a no-op (ALREADY_UP_TO_DATE) does NOT satisfy it:
        // only a real, VERIFIED fast-forward transition counts. FAILS unless: evidence present,
        // outcome===INTEGRATED, integrated===true, pushed===false (local-only), merge_commit===false,
        // and the embedded C03 state_transition VALIDATES and its observed tip matches state_after.
        const ev = readJsonSafe(GIT_BRANCH_INTEGRATION_EVIDENCE);
        if (!ev) {
            return { ok: false, detail: `no git branch integration evidence at ${GIT_BRANCH_INTEGRATION_EVIDENCE} — run the Governed Git Branch Integration capability first` };
        }
        if (ev.outcome !== "INTEGRATED" || ev.integrated !== true) {
            return { ok: false, detail: `no real integration (outcome=${ev.outcome}); a dry-run or already-up-to-date no-op does NOT satisfy git-branch-integrated` };
        }
        if (ev.pushed !== false || ev.merge_commit !== false) {
            return { ok: false, detail: `integration violated local-only/ff-only invariants (pushed=${ev.pushed}, merge_commit=${ev.merge_commit})` };
        }
        const t = ev.state_transition;
        if (!t || typeof t !== "object") {
            return { ok: false, detail: "integration evidence carries no C03 state_transition record" };
        }
        const v = validateStateTransition(t);
        if (!v.ok) {
            return { ok: false, detail: `C03 state_transition invalid: ${v.errors.join("; ")}` };
        }
        if (t.verification_status !== "VERIFIED") {
            return { ok: false, detail: `state_transition not VERIFIED (status=${t.verification_status})` };
        }
        const observedTo = t.observed_effect && t.observed_effect.to;
        const afterTip = t.state_after && t.state_after.targetSha;
        if (!observedTo || observedTo !== afterTip) {
            return { ok: false, detail: `observed tip (${observedTo}) does not match state_after (${afterTip})` };
        }
        return { ok: true, detail: `branch "${ev.target}" fast-forwarded to ${observedTo} (${t.observed_effect.commits_advanced} commit(s)); local-only, no merge, C03 VERIFIED` };
    },

    "bash-command-governed"() {
        // Verified governed-shell proof. Reads ONLY the Governed Bash/Linux Command executor's evidence.
        // Always requires shellExecution===false (the string was NEVER handed to a shell; argv only).
        // A dry-run (ANALYZED) or a governed refusal does NOT satisfy it — only a command the capability
        // actually exercised safely: EXECUTED (VERIFIED C03 + sandbox network off + no effect divergence)
        // or SANDBOX_OBSERVED (unknown profiled in isolation with network off, trust withheld).
        const ev = readJsonSafe(BASH_COMMAND_EVIDENCE);
        if (!ev) {
            return { ok: false, detail: `no bash command evidence at ${BASH_COMMAND_EVIDENCE} — run the Governed Bash/Linux Command capability first` };
        }
        if (ev.shellExecution !== false) {
            return { ok: false, detail: "evidence does not assert shellExecution=false (raw shell execution is forbidden)" };
        }
        if (ev.outcome === "EXECUTED") {
            const t = ev.state_transition;
            if (!t || typeof t !== "object") return { ok: false, detail: "EXECUTED without a C03 state_transition record" };
            const v = validateStateTransition(t);
            if (!v.ok) return { ok: false, detail: `C03 state_transition invalid: ${v.errors.join("; ")}` };
            if (t.verification_status !== "VERIFIED") return { ok: false, detail: `state_transition not VERIFIED (status=${t.verification_status})` };
            const iso = ev.execution && ev.execution.isolation;
            if (!iso || iso.network !== false || iso.envCleared !== true) return { ok: false, detail: "execution lacked genuine isolation (network/env)" };
            return { ok: true, detail: `command "${ev.parsed.command}" executed in genuine isolation (exit ${ev.execution.exitCode}, network off, env cleared); C03 VERIFIED` };
        }
        if (ev.outcome === "SANDBOX_OBSERVED") {
            const iso = ev.execution && ev.execution.isolation;
            if (!iso || iso.network !== false) return { ok: false, detail: "sandbox observation lacked network isolation" };
            if (ev.humanApprovalRequired !== true) return { ok: false, detail: "unknown command profiled but trust not withheld (humanApprovalRequired must be true)" };
            return { ok: true, detail: `unknown command "${ev.parsed.command}" profiled in isolation (network off); trust withheld pending human review` };
        }
        return { ok: false, detail: `command not governed-executed (outcome=${ev.outcome}); a dry-run or governed refusal does NOT satisfy bash-command-governed` };
    },

    "legacy-runtime-retired"() {
        // Deterministic DoD proof for RETIRE_LEGACY_RUNTIME: the legacy Mission-Standard engine
        // is physically gone AND no live launch/execution path references it. Pure fs reads.
        const legacyDir = "runtime/mission-standard";
        if (fs.existsSync(legacyDir)) {
            return { ok: false, detail: `${legacyDir} still present` };
        }
        const liveFiles = [
            "runtime/bin/odg",
            "runtime/bin/odg-local-pipeline.sh",
            "runtime/bin/odg-run.js",
            "runtime/bin/odg-verify.js",
        ];
        const offenders = liveFiles.filter((f) => {
            let text = null;
            try { text = fs.readFileSync(f, "utf8"); } catch { text = null; }
            return text !== null && text.includes("mission-standard");
        });
        return offenders.length === 0
            ? { ok: true, detail: `${legacyDir} absent; no live reference across ${liveFiles.length} launch/exec files` }
            : { ok: false, detail: `live reference to the legacy engine in: ${offenders.join(", ")}` };
    },

    "samurai-output-mode"() {
        // Deterministic DoD proof for the Samurai / summary output mode. Pure fs reads.
        let src = null;
        try { src = fs.readFileSync("runtime/bin/odg-run.js", "utf8"); } catch { src = null; }
        if (src === null) return { ok: false, detail: "runtime/bin/odg-run.js not found" };
        const missing = [];
        if (!/process\.env\.ODG_VERBOSE/.test(src)) missing.push("ODG_VERBOSE gate");
        if (!/runtime\/generated\/logs/.test(src) || !/appendFileSync\(\s*RUN_LOG/.test(src)) missing.push("run-log tee");
        if (!/encoding:\s*["']utf8["']/.test(src)) missing.push("captured stage output");
        return missing.length === 0
            ? { ok: true, detail: "odg-run.js: default summary + run-log artifact, ODG_VERBOSE-gated live stream" }
            : { ok: false, detail: `samurai output mode incomplete: missing ${missing.join(", ")}` };
    },

    "single-runtime-entrypoint"() {
        // Deterministic DoD proof for the single-entrypoint consolidation. Pure fs reads.
        const offenders = [];
        let cli = null;
        try { cli = fs.readFileSync("src/runtime/mission-cli.ts", "utf8"); } catch { cli = null; }
        if (cli === null) return { ok: false, detail: "src/runtime/mission-cli.ts not found" };
        if (cli.includes("FALLBACK_TO_MSE")) offenders.push("mission-cli.ts still references FALLBACK_TO_MSE");
        if (fs.existsSync("runtime/bin/odg-fallback.sh")) offenders.push("legacy odg-fallback.sh still present");
        if (!fs.existsSync("runtime/bin/odg-local-pipeline.sh")) offenders.push("odg-local-pipeline.sh missing");
        let launcher = null;
        try { launcher = fs.readFileSync("runtime/bin/odg", "utf8"); } catch { launcher = null; }
        if (launcher === null || !/exec\s+node_modules\/\.bin\/tsx\s+src\/runtime\/mission-cli\.ts/.test(launcher)) {
            offenders.push("odg launcher does not exec the single mission-cli entrypoint");
        }
        return offenders.length === 0
            ? { ok: true, detail: "single entrypoint: FALLBACK_TO_MSE removed, one mission driver, local pipeline first-class" }
            : { ok: false, detail: offenders.join("; ") };
    },

    "capability-probes-finalized"() {
        // Deterministic DoD proof for FINALIZE_CAPABILITY_PROBES: the probe framework is a real,
        // named registry AND it is actually wired into the two consumers that make its verdicts
        // matter — the Validation Engine (executes the proofs) and the Mission Contract Factory
        // (declares them from intent). Pure fs reads; the framework proving its own finalization.
        const offenders = [];
        let self = null;
        try { self = fs.readFileSync("runtime/core/capability-probes.js", "utf8"); } catch { self = null; }
        if (self === null) return { ok: false, detail: "runtime/core/capability-probes.js not found" };
        if (!/const PROBES = \{/.test(self)) offenders.push("no named PROBES registry");
        if (!/function evaluate\(/.test(self)) offenders.push("no evaluate() required-proof gate");
        if (!/module\.exports = \{[^}]*evaluate/.test(self)) offenders.push("evaluate not exported");

        let engine = null;
        try { engine = fs.readFileSync("runtime/core/validation-engine.js", "utf8"); } catch { engine = null; }
        if (engine === null) offenders.push("validation-engine.js not found");
        else if (!/require\(["']\.\/capability-probes["']\)/.test(engine) || !/\.evaluate\(/.test(engine)) {
            offenders.push("Validation Engine does not execute the probe framework");
        }

        let factory = null;
        try { factory = fs.readFileSync("runtime/core/mission-contract-factory.js", "utf8"); } catch { factory = null; }
        if (factory === null) offenders.push("mission-contract-factory.js not found");
        else if (!/resolveVerifyProbes/.test(factory)) {
            offenders.push("Contract Factory does not declare probes from intent");
        }

        const registered = Object.keys(PROBES).length;
        return offenders.length === 0
            ? { ok: true, detail: `probe framework finalized: ${registered} registered probes, wired into Validation Engine + Contract Factory` }
            : { ok: false, detail: offenders.join("; ") };
    },
};

// Run a single named probe. Unknown probe → not ok (a required proof for an unregistered capability
// therefore cannot pass, so SUCCESS is blocked).
function runProbe(evidence, ctx) {
    const probe = PROBES[evidence];
    if (typeof probe !== "function") {
        return { ok: false, detail: `unknown evidence probe "${evidence}"` };
    }
    return probe(ctx || {});
}

// Evaluate all of a mission's declared capability proofs (the contract `verify` block).
// Each entry: { capability, evidence, required? }. `required` defaults to true.
// Returns { results, ok, missingRequired } — `ok` is false iff any REQUIRED proof is missing/failing.
function evaluate(verifyChecks, ctx) {
    const list = Array.isArray(verifyChecks) ? verifyChecks : [];
    const results = list.map((v) => {
        const r = runProbe(v.evidence, ctx);
        return {
            capability: v.capability,
            evidence: v.evidence,
            required: v.required !== false,
            ok: r.ok,
            detail: r.detail,
        };
    });
    const missingRequired = results.filter((r) => r.required && !r.ok);
    return { results, ok: missingRequired.length === 0, missingRequired };
}

// OPT-IN per-objective proof gate. An objective's OPTIONAL `proof` field (ObjectiveSpec.proof) NAMES a
// registered probe that independently verifies that specific objective's expected outcome. This runs
// each DECLARED objective proof through the SAME registry/runner as the `verify` block above (reuse,
// no new probe, no done_when interpretation) and reports per-objective PASS/FAIL. An objective that
// declares NO proof (absent / non-string / empty) is SKIPPED entirely — legacy behaviour is preserved
// exactly (opt-in). A declared proof that FAILS or names an UNREGISTERED probe (runProbe → ok:false)
// makes `ok` false, so the Validation Engine blocks the mission; the proof stays tied to its own
// objective (keyed by id) and never satisfies another objective. `runner` is injectable for tests.
// Returns { results, ok, failing } — `ok` is false iff any declared objective proof did not pass.
function evaluateObjectiveProofs(objectives, ctx, runner) {
    const run = typeof runner === "function" ? runner : runProbe;
    const declared = (Array.isArray(objectives) ? objectives : []).filter(
        (o) => o && typeof o.proof === "string" && o.proof.length > 0,
    );
    const results = declared.map((o) => {
        const r = run(o.proof, ctx || {}) || {};
        return {
            objective: typeof o.id === "string" ? o.id : null,
            proof: o.proof,
            ok: r.ok === true,
            detail: typeof r.detail === "string" ? r.detail : null,
        };
    });
    const failing = results.filter((r) => !r.ok);
    return { results, ok: failing.length === 0, failing };
}

module.exports = { PROBES, runProbe, evaluate, evaluateObjectiveProofs, CONNECTIVITY_EVIDENCE };
