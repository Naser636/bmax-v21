#!/usr/bin/env node

/*
 * V28 — Governed Post-Release Experience Accumulation (TypeScript port; parity with
 * runtime/core/post-release-learning.js).
 *
 * ADVISORY adapter: transforms THIS mission's already-validated mission-report.json + already-applied
 * patch-execution.json into the EXISTING capability-learning.learn() input shape, then delegates.
 * Strict port: the public exports (accumulate, buildLearnReport), the cwd-relative artifact paths (NOT
 * __dirname), the fail-closed evidence gating (mission identity + validated===true + REAL APPLIED edits
 * only), the authoredBy/rootCause/goal forwarding semantics, the deps injection seam and all return
 * shapes are preserved EXACTLY. Depends on ./capability-learning (co-located in dist by build-dist-
 * closure). The historical .js remains the behavioural reference.
 */

"use strict";

const fs = require("fs");
const learning = require("./capability-learning");

const MISSION_REPORT = "runtime/generated/mission-report.json";
const PATCH_EXECUTION = "runtime/generated/patch-execution.json";

function readJsonSafe(file: any): any {
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
function buildLearnReport(mission: any, deps?: any): any {
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
    .filter((e: any) =>
      e && e.status === "APPLIED" && Array.isArray(e.files) && e.files.length > 0 &&
      e.files.every((f: any) => f && typeof f.target === "string" && f.target))
    .map((e: any) => ({
      objectiveId: e.objectiveId || e.action,
      // CTO Phase-03: forward the PROVEN origin the ODG executor recorded on the APPLIED evidence,
      // ONLY when explicitly present and a non-empty string. NEVER fabricate it from the APPLIED
      // status or the applicator's identity (applied-by-ODG is NOT authored-by-ODG). Absent/invalid
      // ⇒ omitted ⇒ patch-memory applies its fail-closed UNKNOWN default.
      ...(typeof e.authoredBy === "string" && e.authoredBy ? { authoredBy: e.authoredBy } : {}),
      // Preserved verbatim if the execution evidence carries it; signature() tolerates its absence.
      rootCause: e.rootCause,
      // The mission-independent problem identity used as the reuse key. Carried verbatim from the
      // APPLIED execution evidence (the Patch Executor records the objective's goal on each APPLIED
      // entry); signature() tolerates its absence (falls back to objectiveId for older evidence).
      goal: e.goal,
      // Edits derive SOLELY from the APPLIED execution evidence — never from the plan.
      edits: e.files.map((f: any) => ({ target: f.target, mode: f.mode })),
    }));

  if (objectives.length === 0) return null; // validated but no APPLIED edits ⇒ zero entries
  return { mission, validated: true, objectives };
}

/*
 * Advisory accumulation entry point. Returns a small summary; the EXISTING patch-memory.record is
 * idempotent by signature, so re-running for the same proven mission does not create duplicate entries.
 */
function accumulate(mission: any, deps?: any): any {
  const learnReport = buildLearnReport(mission, deps);
  if (!learnReport) return { learned: 0, reason: "NO_ELIGIBLE_EVIDENCE" };
  const res = learning.learn(learnReport);
  return { learned: res.learnedPatches.length, signatures: res.learnedPatches };
}

module.exports = { accumulate, buildLearnReport };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names (readJsonSafe)
// are module-scoped, not global script scope (prevents cross-lot TS2393). The CommonJS API is unchanged.
export {};
