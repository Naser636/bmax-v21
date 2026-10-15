#!/usr/bin/env node

/*
 * P6 — Capability Learning Engine (TypeScript port; parity with runtime/core/capability-learning.js).
 *
 * After a mission finishes: records a per-objective outcome (capability, success/failure) to the shared
 * autonomy-store (feeding P7 metrics + P8 router) and, when validated AND real edits applied, stores
 * those edits in P1 Patch Memory. Reuses P1 (patch-memory), P4 (decision-rules) and autonomy-store —
 * all already TS, co-located in dist (deps=3, shallow closure). Strict port: the public exports (learn,
 * outcomes, OUTCOMES), the capability resolution (report.capability → rules.match(goal) → "unknown"),
 * the success=validated===true semantics, the goal-keyed patch-memory record with authoredBy forwarding,
 * and the return shape are preserved EXACTLY. learn() keeps its real new Date().toISOString() `at`.
 * The historical .js remains the behavioural reference; several consumers depend on this API.
 */

"use strict";

const store = require("./autonomy-store");
const patchMemory = require("./patch-memory");
const rules = require("./decision-rules");

const OUTCOMES = "capability-outcomes";

function resolveCapability(report: any, objective: any): any {
  if (report.capability) return report.capability;
  const m = rules.match(objective.goal);
  return m ? m.capability : "unknown";
}

function learn(report: any): any {
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
      // Key on the mission-independent PROBLEM identity (goal); objectiveId is only a signature() fallback,
      // and the target is deliberately NOT part of the live key (decision-time lookup has no target).
      const rec = patchMemory.record({
        rootCause: o.rootCause,
        goal: o.goal,
        objectiveId: o.objectiveId || o.id,
        mission: report.mission,
        // CTO Phase-03: carry the proven origin through without loss; absent/invalid ⇒ patch-memory's
        // fail-closed UNKNOWN default (NEVER requalified to ODG just because a patch was stored/replayed).
        ...(typeof o.authoredBy === "string" && o.authoredBy ? { authoredBy: o.authoredBy } : {}),
        edits,
      });
      learnedPatches.push(rec.signature);
    }
  }
  store.write(OUTCOMES, db);
  return { success, recordedOutcomes: objectives.length, learnedPatches };
}

function outcomes(): any {
  return store.read(OUTCOMES, { version: 1, outcomes: [] }).outcomes;
}

module.exports = { learn, outcomes, OUTCOMES };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names (resolveCapability)
// are module-scoped, not global script scope (prevents cross-lot TS2393). The CommonJS API is unchanged.
export {};
