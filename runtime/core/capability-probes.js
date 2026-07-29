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
const { CONNECTIVITY_EVIDENCE } = require("./capability-executors");

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

module.exports = { PROBES, runProbe, evaluate, CONNECTIVITY_EVIDENCE };
