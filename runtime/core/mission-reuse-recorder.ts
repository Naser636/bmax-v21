#!/usr/bin/env node
/**
 * mission-reuse-recorder — the PRODUCER side of the learning loop (V22 Priority One, second half).
 *
 * V22 closed the CONSUMER side: capability-router de-selects a precedent the reuse-ledger marks suppressed.
 * But nothing RECORDED reuse outcomes in production, so the ledger only ever populated in tests. This module
 * reads a completed mission's decision.json (which objectives actually REUSED a patch-memory precedent — those
 * carry a memory-sourced patch, authoredBy ≠ CONTRACT) + mission-report.json (validated) and writes a reuse
 * OUTCOME per reused signature via reuse-ledger.recordReuseOutcome. The outcome is mapped HONESTLY:
 *
 *   - mission did NOT validate            ⇒ a real regression signal ⇒ REUSE_FAILED (suppresses after 2)
 *   - validated WITH a measured before/after improvement (deps.improvement[objectiveId]) ⇒ REUSE_VALIDATED
 *   - validated but NO measurement        ⇒ flat ⇒ REUSE_INCONCLUSIVE (NO fabricated effect — passing a mission
 *                                           once does not prove the reuse improved anything)
 *
 * This is deliberately conservative: it learns the DANGEROUS half automatically (stop reusing precedents whose
 * missions fail) without inventing positive effect. Fail-closed; additive (no existing module modified); the
 * artifacts it reads are already written by decision-engine + the mission pipeline. Store injectable for tests.
 */
"use strict";

const fs = require("fs");
const PM = require("./patch-memory.js");
const RL = require("./reuse-ledger.js");

const DECISION = "runtime/generated/decision.json";
const MISSION_REPORT = "runtime/generated/mission-report.json";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function readJsonSafe(file: string): any { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } }

/** reusedObjectives(decision): objectives that actually replayed a patch-memory precedent (not a CONTRACT patch). */
function reusedObjectives(decision: any): any[] {
  if (!isObj(decision) || !Array.isArray(decision.objectives)) return [];
  return decision.objectives.filter((o: any) =>
    o && typeof o.id === "string" && o.patch && typeof o.authoredBy === "string" && o.authoredBy !== "CONTRACT");
}

/**
 * recordMissionReuseOutcomes(mission, deps?, opts?): for each precedent reused in `mission`, record its outcome.
 * deps: { decision, report, improvement?: { <objectiveId>: {before, after, senseMap} }, at? } (inject to avoid disk).
 * opts: { store } forwarded to reuse-ledger. Returns { ok, recorded, validated, results[] } or fail-closed.
 */
function recordMissionReuseOutcomes(mission: any, deps: any = {}, opts: any = {}): any {
  if (typeof mission !== "string" || !mission.trim()) return { ok: false, code: "INVALID_INPUT", detail: "mission id required" };
  const decision = deps.decision !== undefined ? deps.decision : readJsonSafe(DECISION);
  const report = deps.report !== undefined ? deps.report : readJsonSafe(MISSION_REPORT);
  if (!isObj(decision) || decision.mission !== mission || !Array.isArray(decision.objectives)) return { ok: false, code: "NO_DECISION", detail: "decision.json missing / wrong mission" };
  if (!isObj(report) || report.mission !== mission || typeof report.validated !== "boolean") return { ok: false, code: "NO_REPORT", detail: "mission-report.json missing / wrong mission / no validated boolean" };

  const reused = reusedObjectives(decision);
  if (reused.length === 0) return { ok: true, recorded: 0, validated: report.validated, results: [], reason: "NO_REUSE_IN_MISSION" };

  const validated = report.validated === true;
  const improvement = isObj(deps.improvement) ? deps.improvement : {};
  const at = typeof deps.at === "string" && deps.at ? deps.at : undefined;
  // ATTRIBUTED mode (V26): when the caller supplies the set of objective ids whose ACTION actually FAILED,
  // only THOSE reused objectives are marked REUSE_FAILED — a mission-level failure never blames an unrelated
  // reused precedent, and a BLOCKED (not FAILED) objective is NOT a reuse failure. Absent ⇒ legacy mission-level
  // mode (preserved for the success/ledger hook).
  const failedIds = Array.isArray(deps.failedObjectiveIds) ? new Set(deps.failedObjectiveIds.map((x: any) => String(x))) : null;
  const results: any[] = [];

  for (const o of reused) {
    const sig = PM.signature({ goal: o.goal, objectiveId: o.id });
    let before: any, after: any, senseMap: any;
    const measured = isObj(improvement[o.id]) && isObj(improvement[o.id].before) && isObj(improvement[o.id].after);
    if (failedIds) {
      if (failedIds.has(String(o.id))) {
        // This precedent's OWN objective FAILED ⇒ attributable regression ⇒ REUSE_FAILED.
        before = { signals: { objectiveSucceeded: 1 } }; after = { signals: { objectiveSucceeded: 0 } }; senseMap = { objectiveSucceeded: "higher" };
      } else if (validated && measured) {
        before = improvement[o.id].before; after = improvement[o.id].after; senseMap = improvement[o.id].senseMap;
      } else if (validated) {
        before = { signals: { objectiveSucceeded: 1 } }; after = { signals: { objectiveSucceeded: 1 } };
      } else {
        // Not validated but THIS objective did not fail (e.g. blocked / unrelated) ⇒ no attributable signal.
        results.push({ objectiveId: o.id, signature: sig, outcome: null, ok: true, skipped: "UNATTRIBUTABLE" });
        continue;
      }
    } else if (!validated) {
      before = { signals: { missionValidated: 1 } }; after = { signals: { missionValidated: 0 } }; senseMap = { missionValidated: "higher" };
    } else if (measured) {
      before = improvement[o.id].before; after = improvement[o.id].after; senseMap = improvement[o.id].senseMap;
    } else {
      before = { signals: { missionValidated: 1 } }; after = { signals: { missionValidated: 1 } };
    }
    const rec = RL.recordReuseOutcome(sig, { before, after, senseMap, context: `mission ${mission}`, adapted: false, at }, opts);
    results.push({ objectiveId: o.id, signature: sig, outcome: rec.ok ? rec.outcome : null, ok: rec.ok });
  }
  return { ok: true, recorded: results.filter((r) => !r.skipped).length, validated, attributed: !!failedIds, results, note: "Attributed mode: only objectives whose action FAILED ⇒ reuse-failed (never blames an unrelated precedent; BLOCKED≠FAILED). Passed+measured ⇒ validated; passed+unmeasured ⇒ inconclusive (no fabricated effect)." };
}

export { reusedObjectives, recordMissionReuseOutcomes };
module.exports = { reusedObjectives, recordMissionReuseOutcomes };

// Read-only CLI: print the honest outcome-mapping policy; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "mission-reuse-recorder/1", mapping: { failedMission: "REUSE_FAILED", validatedMeasuredImprovement: "REUSE_VALIDATED", validatedUnmeasured: "REUSE_INCONCLUSIVE" } }, null, 2) + "\n");
}
