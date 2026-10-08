#!/usr/bin/env node

/*
 * V28 — Governed Post-Release Experience Accumulation (ADVISORY adapter).
 *
 * The V27 gap: the EXISTING capability-learning → patch-memory mechanism was never invoked by any real
 * governed mission-completion path, so verified engineering experience never accumulated. This module
 * is the single, minimal adapter that transforms THIS mission's ALREADY-VALIDATED evidence
 * (runtime/generated/mission-report.json) + its ALREADY-APPLIED patch evidence
 * (runtime/generated/patch-execution.json) into the EXISTING learn() input shape, then delegates to the
 * EXISTING capability-learning.learn() (which writes the EXISTING patch-memory store). It invents no new
 * persistence mechanism, store, or format.
 *
 * It is ADVISORY and POST-RELEASE: the mission-ledger release decision has already completed before this
 * runs; a failure here is NON-AUTHORITATIVE and never turns a recorded mission into FAILED (the caller in
 * mission-ledger.js guards the call). Memory is reusable experience, NEVER proof.
 *
 * Governance (matches the V27/V28 contract):
 *   - consumes evidence from the CURRENT mission/run ONLY (both artifacts must carry mission === this mission);
 *   - requires validated === true (read from the same report the ledger's proven-only gate read);
 *   - requires REAL APPLIED edits (patch-execution entries with status "APPLIED" and ≥1 file target);
 *   - does NOT invent edits from plans, metadata, forecasts, or cached memory — the edits come solely from
 *     the APPLIED execution evidence;
 *   - if required evidence is absent/mismatched/stale ⇒ zero entries (fail closed);
 *   - preserves the EXISTING signature semantics rootCause | objectiveId | target (via learn()/patch-memory).
 */

"use strict";

const fs = require("fs");
const learning = require("./capability-learning");

const MISSION_REPORT = "runtime/generated/mission-report.json";
const PATCH_EXECUTION = "runtime/generated/patch-execution.json";

function readJsonSafe(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

/*
 * Build the EXISTING learn() report shape for `mission`, or return null (⇒ zero learning) when the
 * evidence does not justify accumulating experience. `deps` lets tests inject { report, execution }
 * instead of reading disk; absent deps ⇒ read the current-run artifacts.
 */
function buildLearnReport(mission, deps) {
    deps = deps || {};
    const report = deps.report !== undefined ? deps.report : readJsonSafe(MISSION_REPORT);
    const execution = deps.execution !== undefined ? deps.execution : readJsonSafe(PATCH_EXECUTION);

    // Current mission identity + validated===true (unvalidated / wrong-mission / absent ⇒ null).
    if (!report || report.mission !== mission || report.validated !== true) return null;
    // Current mission identity on the APPLIED evidence too (stale / wrong-mission / absent ⇒ null).
    if (!execution || execution.mission !== mission || !Array.isArray(execution.executed)) return null;

    // REAL applied edits only: status "APPLIED" (genuine file writes) with concrete file targets. EXECUTED
    // (capability runs) and RECORDED (no-op) are NOT reusable file-edit patches and are excluded.
    const objectives = execution.executed
        .filter((e) =>
            e && e.status === "APPLIED" && Array.isArray(e.files) && e.files.length > 0 &&
            e.files.every((f) => f && typeof f.target === "string" && f.target))
        .map((e) => ({
            objectiveId: e.objectiveId || e.action,
            // Preserved verbatim if the execution evidence carries it; signature() tolerates its absence.
            rootCause: e.rootCause,
            // The mission-independent problem identity used as the reuse key. Carried verbatim from the
            // APPLIED execution evidence (the Patch Executor records the objective's goal on each APPLIED
            // entry); signature() tolerates its absence (falls back to objectiveId for older evidence).
            goal: e.goal,
            // Edits derive SOLELY from the APPLIED execution evidence — never from the plan.
            edits: e.files.map((f) => ({ target: f.target, mode: f.mode })),
        }));

    if (objectives.length === 0) return null; // validated but no APPLIED edits ⇒ zero entries
    return { mission, validated: true, objectives };
}

/*
 * Advisory accumulation entry point. Returns a small summary; the EXISTING patch-memory.record is
 * idempotent by signature, so re-running for the same proven mission does not create duplicate entries.
 */
function accumulate(mission, deps) {
    const learnReport = buildLearnReport(mission, deps);
    if (!learnReport) return { learned: 0, reason: "NO_ELIGIBLE_EVIDENCE" };
    const res = learning.learn(learnReport);
    return { learned: res.learnedPatches.length, signatures: res.learnedPatches };
}

module.exports = { accumulate, buildLearnReport };
