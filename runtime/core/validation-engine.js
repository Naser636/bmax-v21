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
const verify = readJsonSafe("runtime/generated/runtime-verify.json");
const buildOk = verify ? verify.build === true : true;
const typescriptOk = verify ? verify.typescript === true : true;
const gatesEvaluated = verify !== null;

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
};

const validated = coverageOk && noFailures && engineeringOk && buildOk && typescriptOk;

const unmet = [];
if (!coverageOk) unmet.push(`Objective coverage incomplete (objectives=${objectiveCount}, planned=${plannedCount}, executed=${executed.length}).`);
if (!noFailures) unmet.push(`${failed.length} action(s) FAILED: ${failed.map((f) => f.action).join(", ")}.`);
if (!engineeringOk) unmet.push(`Write-scope mission changed nothing inside authorized_paths (${authorizedPaths.join(", ")}).`);
if (!buildOk) unmet.push("Build gate is red (runtime-verify.json build=false).");
if (!typescriptOk) unmet.push("TypeScript gate is red (runtime-verify.json typescript=false).");

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

console.log("======================================");
console.log("VALIDATION ENGINE v3 (evidence-based)");
console.log("======================================");
console.log("Mission   :", report.mission);
console.log("Coverage  :", coverageOk ? "OK" : "INCOMPLETE", `(${executed.length}/${objectiveCount})`);
console.log("Failures  :", failed.length);
if (isEngineering) console.log("Engineering:", engineeringOk ? `OK (${scopedChanges.length} changed)` : "NONE in scope");
if (gatesEvaluated) console.log("Gates     :", `build=${buildOk} tsc=${typescriptOk}`);
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
