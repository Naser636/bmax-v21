#!/usr/bin/env node

/*
 * P6 — Capability Learning Engine.
 *
 * "Le système doit apprendre après chaque mission." After a mission finishes, this engine:
 *   - records a per-objective outcome (which capability, success/failure) to the shared autonomy
 *     store, feeding P7 Capability Metrics and P8 the Router;
 *   - when the mission validated AND applied real edits, stores those edits in P1 Patch Memory so
 *     the same problem is solved locally next time (DON'T ASK AI FIRST).
 *
 * Reuses P1 (patch-memory), P4 (decision-rules) and the shared autonomy-store. No new store.
 */

"use strict";

const store = require("./autonomy-store");
const patchMemory = require("./patch-memory");
const rules = require("./decision-rules");

const OUTCOMES = "capability-outcomes";

function resolveCapability(report, objective) {
    if (report.capability) return report.capability;
    const m = rules.match(objective.goal);
    return m ? m.capability : "unknown";
}

function learn(report) {
    if (!report || typeof report !== "object") throw new Error("learn requires a mission report");
    const db = store.read(OUTCOMES, { version: 1, outcomes: [] });
    const success = report.validated === true;
    const objectives = Array.isArray(report.objectives) ? report.objectives : [];
    const learnedPatches = [];
    const at = new Date().toISOString();

    for (const o of objectives) {
        const capability = resolveCapability(report, o);
        db.outcomes.push({
            capability,
            mission: report.mission || null,
            objectiveId: o.objectiveId || o.id || null,
            success,
            at,
        });
        const edits = Array.isArray(o.edits) ? o.edits : [];
        if (success && edits.length > 0) {
            // Key the stored solution on the mission-independent PROBLEM identity (goal), so the same
            // recurring problem is reusable across different missions. objectiveId is kept only as a
            // fallback inside signature() for goalless callers, and the target is deliberately NOT part
            // of the live key: the decision-time lookup (decision-engine) has no target, so including it
            // here would make the record and the lookup compute different keys and the precedent would
            // never be found. The concrete edits (and their targets) are still stored on the entry.
            const rec = patchMemory.record({
                rootCause: o.rootCause,
                goal: o.goal,
                objectiveId: o.objectiveId || o.id,
                mission: report.mission,
                edits,
            });
            learnedPatches.push(rec.signature);
        }
    }
    store.write(OUTCOMES, db);
    return { success, recordedOutcomes: objectives.length, learnedPatches };
}

function outcomes() {
    return store.read(OUTCOMES, { version: 1, outcomes: [] }).outcomes;
}

module.exports = { learn, outcomes, OUTCOMES };
