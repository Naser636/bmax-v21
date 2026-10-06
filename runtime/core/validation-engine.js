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
// Scope + evidence primitives live in ONE shared module (no second concurrent implementation).
const { changedPathsInScope, trackedFilesInScope, artifactNonEmpty } = require("./scope-observer");

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

// 2b. Evidence integrity — a capability that claims it EXECUTED must have produced the evidence
// artifact it points to. This removes the class of false MISSION SUCCESS where a capability is
// recorded as run without actually producing any proof: an `evidence` path that is missing or empty
// on disk fails the mission. Entries without an `evidence` field (legacy read-only RECORDED steps)
// are unaffected, so existing missions keep their behaviour.
const evidenceEntries = executed.filter((e) => e && typeof e.evidence === "string");
// Reuse the shared evidence-integrity predicate (existence + non-emptiness); behaviour unchanged.
const missingEvidence = evidenceEntries.filter((e) => !artifactNonEmpty(e.evidence).ok);
const evidenceOk = missingEvidence.length === 0;

// 3. Engineering performed (write-scope missions only).
const authorizedPaths = Array.isArray(plan.authorizedPaths) ? plan.authorizedPaths : [];
const isEngineering = plan.requiresEngineering === true && authorizedPaths.length > 0;

// 2c. No RECORDED no-op coverage for ENGINEERING missions (A3). The Patch Executor marks an objective
// `RECORDED` when it maps to NEITHER a real `edits` patch NOR a capability executor — a symbolic no-op
// with no evidence (exactly the objective-attribution RECORDED-NO-EVIDENCE verdict, consumed here as
// the literal executor status so no done_when is parsed and no new semantics are introduced). For a
// write-scope ENGINEERING mission such a no-op must NOT count as satisfied coverage, otherwise the
// mission reaches SUCCESS/RELEASE without doing the work its objective describes. Scoped to
// isEngineering so read-only AUDIT missions (no authorized paths) keep their historical behaviour.
// Only the literal no-op status is caught: EXECUTED(+evidence), APPLIED (real file edits) and DONE
// (legacy actions that write an output artifact) are unaffected.
const recordedNoOp = executed.filter((e) => e && e.status === "RECORDED");
const noRecordedNoOp = !isEngineering || recordedNoOp.length === 0;

// Scope observation delegated to the shared scope-observer module (single implementation; same
// context and moment-of-observation rules). No behaviour change — same inputs, same results.
const scopedChanges = isEngineering ? changedPathsInScope(authorizedPaths) : [];
// Idempotent engineering proof: a write-scope mission is satisfied by a FRESH in-scope change
// (this run) OR by an already-committed deliverable inside the authorized scope (a prior run's
// result). Without the latter, a completed+committed engineering mission can never re-validate —
// producing a new diff would dirty the tree and fail gitClean, an unresolvable contradiction.
const deliverableInScope = isEngineering ? trackedFilesInScope(authorizedPaths) : [];
const engineeringOk = !isEngineering || scopedChanges.length > 0 || deliverableInScope.length > 0;

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

// 5. Capability proofs — the Capability Probe Framework (runtime/core/capability-probes.js) turns
// the mission contract's `verify` block into machine-verified evidence against real generated
// artifacts. Each proof is REQUIRED by default (opt out with `required: false`); SUCCESS is blocked
// whenever a required proof is missing — an unregistered probe or an absent/failing evidence
// artifact. Missions with no `verify` block declare no proofs, so they get NO extra gate.
const probes = require("./capability-probes");
const missionId = plan.mission || patch.mission;
// RUN-OWNERSHIP wiring (ADD_PROBE_RUN_OWNERSHIP_V1 parity with the LOCAL route runtime-executor.ts:96):
// supply the current run's start time so freshness-bearing probes (clean-workspace-scanned,
// external-research-dry-run-planned) REJECT a stale prior-run artifact — runtime/generated is never
// cleared, so a leftover otherwise satisfied them here. The run start is the EXISTING per-run token
// pipeline-checkpoint.startedAt (no new timestamp source), trusted ONLY when the checkpoint belongs to
// THIS mission (same mission-match guard as mission-ledger.js:126-129); otherwise undefined and the
// probes keep their content-only behaviour (backward-compatible).
const checkpoint = readJsonSafe("runtime/generated/pipeline-checkpoint.json");
const runStartedAtMs =
    checkpoint && checkpoint.mission === missionId && typeof checkpoint.startedAt === "string"
        ? Date.parse(checkpoint.startedAt)
        : undefined;
const verifyChecks = Array.isArray(plan.verify) ? plan.verify : [];
const capabilityEval = probes.evaluate(verifyChecks, { missionId, verify, runStartedAtMs });
const capabilityResults = capabilityEval.results;
const capabilitiesOk = capabilityEval.ok;
const missingRequiredProofs = capabilityEval.missingRequired;

// 5b. OPT-IN per-objective proof gate (ObjectiveSpec.proof). An objective may declare a `proof` naming
// a registered probe that independently verifies THAT objective's outcome. Objectives that declare no
// proof are untouched (legacy behaviour). A declared proof that fails or names an unregistered probe
// blocks SUCCESS — the provider's self-reported objectivesAddressed / APPLIED / a changed file can
// never substitute for it, and done_when is never interpreted. Reuses the same probe registry/runner.
const planObjectives = Array.isArray(plan.objectives) ? plan.objectives : [];
const objectiveProofEval = probes.evaluateObjectiveProofs(planObjectives, { missionId, verify, runStartedAtMs });
const objectiveProofsOk = objectiveProofEval.ok;
const failingObjectiveProofs = objectiveProofEval.failing;

const checks = {
    objectiveCoverage: coverageOk,
    noFailedActions: noFailures,
    evidenceIntegrity: evidenceOk,
    noRecordedNoOp,
    recordedNoOp: recordedNoOp.map((e) => e.objectiveId || e.action),
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
    objectiveProofs: objectiveProofEval.results,
    objectiveProofsOk,
};

const validated = coverageOk && noFailures && evidenceOk && noRecordedNoOp && engineeringOk && buildOk && typescriptOk && capabilitiesOk && objectiveProofsOk;

const unmet = [];
if (!coverageOk) unmet.push(`Objective coverage incomplete (objectives=${objectiveCount}, planned=${plannedCount}, executed=${executed.length}).`);
if (!noFailures) unmet.push(`${failed.length} action(s) FAILED: ${failed.map((f) => f.action).join(", ")}.`);
if (!evidenceOk) unmet.push(`Capability claimed EXECUTED without producing evidence: ${missingEvidence.map((e) => e.evidence).join(", ")}.`);
if (!noRecordedNoOp) unmet.push(`Objective(s) recorded as a no-op without evidence (RECORDED): ${recordedNoOp.map((e) => e.objectiveId || e.action).join(", ")}.`);
if (!engineeringOk) unmet.push(`Write-scope mission changed nothing inside authorized_paths (${authorizedPaths.join(", ")}).`);
if (!buildOk) unmet.push("Build gate is red (runtime-verify.json build=false).");
if (!typescriptOk) unmet.push("TypeScript gate is red (runtime-verify.json typescript=false).");
for (const c of missingRequiredProofs) unmet.push(`Required capability proof missing — "${c.capability}" not proven: ${c.detail}.`);
for (const p of failingObjectiveProofs) unmet.push(`Objective "${p.objective}" declared proof "${p.proof}" did not pass: ${p.detail || "no detail"}.`);

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
if (evidenceEntries.length) console.log("Evidence  :", evidenceOk ? `OK (${evidenceEntries.length} artifact(s))` : `MISSING (${missingEvidence.length})`);
if (isEngineering) console.log("Engineering:", engineeringOk ? `OK (${scopedChanges.length} changed, ${deliverableInScope.length} committed in scope)` : "NONE in scope");
if (gatesEvaluated) console.log("Gates     :", `build=${buildOk} tsc=${typescriptOk}`);
for (const c of capabilityResults) console.log("Capability:", `${c.ok ? "OK  " : "FAIL"} ${c.capability}${c.required ? "" : " [optional]"} (${c.detail})`);
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
