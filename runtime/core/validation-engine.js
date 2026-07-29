#!/usr/bin/env node

/*
 * Validation Engine — evidence-based.
 *
 * The verdict is NO LONGER hardcoded. `validated` is computed from real, observable evidence about
 * the just-run mission, and the stage EXITS NON-ZERO when the mission is not proven — so the
 * pipeline halts before the Ledger and a mission can no longer be recorded as done without proof.
 *
 * Evidence gates (all must hold):
 *   1. Objective coverage — every planned objective produced a patch, and every patch produced an
 *      execution entry (no objective silently dropped).
 *   2. No failed actions — no execution entry has status "FAILED".
 *   3. Engineering performed (only for write-scope missions) — the working tree shows real changes
 *      inside the mission's authorized_paths. A write mission that changed nothing is NOT done.
 *   4. Build/type gates — if runtime-verify.json is present, build and typescript must be green.
 *
 * Deterministic for read-only missions: output is a pure function of the generated plan/execution
 * artifacts (no wall-clock stamp).
 */

const fs = require("fs");
const { execFileSync } = require("child_process");

function readJsonSafe(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

const plan = readJsonSafe("runtime/generated/mission-plan.json");
const patch = readJsonSafe("runtime/generated/patch-plan.json");
const execution = readJsonSafe("runtime/generated/patch-execution.json");

if (!plan || !patch || !execution) {
    console.error("STOP: missing mission-plan / patch-plan / patch-execution — earlier stages must run first.");
    process.exit(1);
}

const objectiveCount = Array.isArray(plan.objectives) ? plan.objectives.length : 0;
const plannedCount = Array.isArray(patch.patches) ? patch.patches.length : 0;
const executed = Array.isArray(execution.executed) ? execution.executed : [];
const failed = executed.filter((e) => e && e.status === "FAILED");

// 1. Objective coverage.
const coverageOk = objectiveCount > 0 && plannedCount === objectiveCount && executed.length === plannedCount;

// 2. No failed actions.
const noFailures = failed.length === 0;

// 3. Engineering performed (write-scope missions only).
const authorizedPaths = Array.isArray(plan.authorizedPaths) ? plan.authorizedPaths : [];
const isEngineering = plan.requiresEngineering === true && authorizedPaths.length > 0;

function changedPathsInScope() {
    let porcelain = "";
    try {
        porcelain = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
    } catch {
        return [];
    }
    const changed = porcelain
        .split(/\r?\n/)
        .map((l) => l.slice(3).trim()) // strip the 2-char status + space
        .filter(Boolean);
    // Normalize authorized paths (drop glob tails like /** or *) to a prefix match.
    const prefixes = authorizedPaths.map((p) => p.replace(/[*].*$/, "").replace(/\/+$/, ""));
    return changed.filter((f) => prefixes.some((pre) => pre.length > 0 && f.startsWith(pre)));
}

const scopedChanges = isEngineering ? changedPathsInScope() : [];
const engineeringOk = !isEngineering || scopedChanges.length > 0;

// 4. Build / type gates (if evidence present).
//
// BUILD_GATE_AUTONOMY: a red build / TypeScript gate NO LONGER stops the pipeline here. Instead the
// Validation Engine DELEGATES to the Build Recovery Engine, which runs a bounded, evidence-guarded
// self-repair loop and hands control back. The gate is then judged on that FRESH evidence:
//   - recovered green            → validation continues and the mission can be promoted;
//   - no improvement demonstrable → the Provider is authorized (by the recovery engine) and the
//                                   mission stays BLOCKED locally.
let verify = readJsonSafe("runtime/generated/runtime-verify.json");
let buildOk = verify ? verify.build === true : true;
let typescriptOk = verify ? verify.typescript === true : true;
const gatesEvaluated = verify !== null;

let recovery = null;
if (gatesEvaluated && (!buildOk || !typescriptOk)) {
    const bre = require("./build-recovery-engine");
    const targetMission = plan.mission || patch.mission;
    recovery = bre.recover({
        authorizedPaths,
        mission: targetMission,
        cwd: process.cwd(),
    });
    buildOk = recovery.build;
    typescriptOk = recovery.typescript;
    // Judge the capability probes below against the fresh gate too. In-memory only: odg-verify.js
    // remains the SOLE writer of runtime-verify.json on disk (the verification pipeline stays
    // unified — we override this run's verdict from fresher evidence, we do not rewrite the file).
    verify = { ...(verify || {}), build: buildOk, typescript: typescriptOk };
    const stamp = new Date().toISOString();
    bre.writeReport(targetMission, recovery, stamp);
    bre.writeProviderAuthorization(targetMission, recovery, stamp);
}

// 5. Capability probes (only when the mission contract declares `verify`). Each probe is a pure
// check against real generated artifacts, turning the mission's Definition of Done into machine-
// verified evidence. Missions with no `verify` block get NO extra gate (behaviour unchanged).
const missionId = plan.mission || patch.mission;
function runProbe(evidence) {
    switch (evidence) {
        case "fleet-request-validated": {
            // The Fleet exchange (Dispatcher → Bridge → Collector) must have driven at least one
            // request for THIS mission to the VALIDATED terminal status.
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
        }
        case "build-green":
            return verify && verify.build === true
                ? { ok: true, detail: "runtime-verify.json build=true" }
                : { ok: false, detail: "build gate not green (runtime-verify.json)" };
        case "typescript-green":
            return verify && verify.typescript === true
                ? { ok: true, detail: "runtime-verify.json typescript=true" }
                : { ok: false, detail: "typescript gate not green (runtime-verify.json)" };
        case "legacy-runtime-retired": {
            // Deterministic DoD proof for RETIRE_LEGACY_RUNTIME: the legacy Mission-Standard engine
            // is physically gone AND no live launch/execution path references it. Pure fs reads (no
            // wall clock, no subprocess) ⇒ reproducible — the same tree always yields the same verdict.
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
        }
        case "samurai-output-mode": {
            // Deterministic DoD proof for the Samurai / summary output mode: the pipeline driver
            // prints a compact one-line-per-stage summary BY DEFAULT and tees the full transcript to
            // a run-log artifact, gated on ODG_VERBOSE for the historical live stream. Pure fs reads.
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
        }
        case "single-runtime-entrypoint": {
            // Deterministic DoD proof for the single-entrypoint consolidation: the FALLBACK_TO_MSE
            // exit protocol and the "fallback engine" script are gone, mission-cli.ts is the one
            // mission driver, and the local execution route is a first-class pipeline. Pure fs reads.
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
        }
        default:
            return { ok: false, detail: `unknown evidence probe "${evidence}"` };
    }
}
const verifyChecks = Array.isArray(plan.verify) ? plan.verify : [];
const capabilityResults = verifyChecks.map((v) => {
    const r = runProbe(v.evidence);
    return { capability: v.capability, evidence: v.evidence, ok: r.ok, detail: r.detail };
});
const capabilitiesOk = capabilityResults.every((r) => r.ok);

const checks = {
    objectiveCoverage: coverageOk,
    noFailedActions: noFailures,
    engineeringPerformed: engineeringOk,
    buildGate: buildOk,
    typescriptGate: typescriptOk,
    gatesEvaluated,
    objectives: objectiveCount,
    planned: plannedCount,
    executed: executed.length,
    failed: failed.length,
    engineering: isEngineering,
    scopedChanges,
    capabilities: capabilityResults,
    capabilitiesOk,
};

const validated = coverageOk && noFailures && engineeringOk && buildOk && typescriptOk && capabilitiesOk;

const unmet = [];
if (!coverageOk) unmet.push(`Objective coverage incomplete (objectives=${objectiveCount}, planned=${plannedCount}, executed=${executed.length}).`);
if (!noFailures) unmet.push(`${failed.length} action(s) FAILED: ${failed.map((f) => f.action).join(", ")}.`);
if (!engineeringOk) unmet.push(`Write-scope mission changed nothing inside authorized_paths (${authorizedPaths.join(", ")}).`);
if (!buildOk) unmet.push("Build gate is red (runtime-verify.json build=false).");
if (!typescriptOk) unmet.push("TypeScript gate is red (runtime-verify.json typescript=false).");
for (const c of capabilityResults.filter((r) => !r.ok)) unmet.push(`Capability "${c.capability}" not proven: ${c.detail}.`);

const report = {
    mission: patch.mission,
    status: validated ? "SUCCESS" : "BLOCKED",
    validated,
    mode: plan.mode,
    checks,
    definitionOfDone: Array.isArray(plan.definitionOfDone) ? plan.definitionOfDone : [],
    unmet,
    totalPatches: plannedCount,
    summary: {
        objectives: objectiveCount,
        executed: executed.length,
        failed: failed.length,
    },
};

fs.mkdirSync("runtime/generated", { recursive: true });
fs.writeFileSync(
    "runtime/generated/mission-report.json",
    JSON.stringify(report, null, 2)
);

// BUILD_GATE_AUTONOMY delegated run: the gate was red and the Build Recovery Engine ran. Per the
// capability contract, emit ONLY the focused summary (Root Cause / files / iterations / Build /
// TypeScript / Validation / Mission promue) — not the general verbose block.
if (recovery) {
    const bre = require("./build-recovery-engine");
    bre.printSummary(recovery, { validated, promoted: validated });
    process.exit(validated ? 0 : 1);
}

console.log("======================================");
console.log("VALIDATION ENGINE v3 (evidence-based)");
console.log("======================================");
console.log("Mission   :", report.mission);
console.log("Coverage  :", coverageOk ? "OK" : "INCOMPLETE", `(${executed.length}/${objectiveCount})`);
console.log("Failures  :", failed.length);
if (isEngineering) console.log("Engineering:", engineeringOk ? `OK (${scopedChanges.length} changed)` : "NONE in scope");
if (gatesEvaluated) console.log("Gates     :", `build=${buildOk} tsc=${typescriptOk}`);
for (const c of capabilityResults) console.log("Capability:", `${c.ok ? "OK  " : "FAIL"} ${c.capability} (${c.detail})`);
console.log("Validated :", validated);
console.log("Status    :", report.status);
if (!validated) {
    console.error("--------------------------------------");
    console.error("BLOCKED — unmet evidence:");
    for (const u of unmet) console.error(" -", u);
    console.error("======================================");
    process.exit(1);
}
console.log("======================================");
