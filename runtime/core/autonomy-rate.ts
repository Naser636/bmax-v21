#!/usr/bin/env node

"use strict";

/*
 * Autonomy Rate (TypeScript port; parity with runtime/core/autonomy-rate.js).
 *
 * S1 reuse-glue: turns already-produced per-run artifacts into ONE governed autonomy signal, delegating
 * ALL measurement to autonomy-measure.js (already TS, co-located in dist). PURE/OFFLINE (no fs/network/
 * clock). Strict port: the public export (buildAutonomyRate), the notMeasurable shape, the mission
 * derivation, the eligibility-contract gating (absent execution / absent plan / incomplete eligibility ⇒
 * notMeasurable with the exact reason), the runComplete derivation and the provenance-tagged return
 * (incl. the honesty `note`) are preserved EXACTLY. The historical .js remains the behavioural reference.
 */

const {
  measureAutonomy,
  fromExecution,
  describeExecution,
  eligibilityFromObjectives,
} = require("./autonomy-measure");

// Shape a caller-level not-measurable result to MATCH autonomy-measure.js's own notMeasurable shape,
// so a dashboard reads one consistent `measure` schema whatever the reason.
function notMeasurable(reason: any): any {
  return {
    measurable: false,
    reason,
    autonomyPercent: null,
    denominator: null,
    numerator: null,
    categories: null,
    excluded: null,
    distinctions: null,
  };
}

function idOf(e: any): string {
  if (e && typeof e.objectiveId === "string" && e.objectiveId) return e.objectiveId;
  if (e && typeof e.action === "string" && e.action) return e.action;
  return "(anon)";
}

/**
 * buildAutonomyRate — assemble the governed autonomy artifact from plain per-run data.
 * @returns {object} the artifact body (WITHOUT generatedAt — the governed writer stamps that).
 */
function buildAutonomyRate(inputs: any): any {
  const src = inputs && typeof inputs === "object" ? inputs : {};
  const patchExecution = src.patchExecution || null;
  const planObjectives = Array.isArray(src.planObjectives) ? src.planObjectives : null;
  const attribution = src.attribution || null;
  const sourceArtifacts = Array.isArray(src.sourceArtifacts) ? src.sourceArtifacts : [];
  const mission =
    (typeof src.mission === "string" && src.mission) ||
    (patchExecution && typeof patchExecution.mission === "string" ? patchExecution.mission : null);

  // DESCRIPTIVE ventilation is ALWAYS safe to compute — it has no denominator and claims no autonomy %.
  const description = describeExecution(patchExecution, attribution);

  let measure;
  if (!patchExecution || !Array.isArray(patchExecution.executed)) {
    // Absent evidence ⇒ not measurable (never a fabricated percentage).
    measure = notMeasurable("no patch-execution artifact (executed[] absent)");
  } else if (!planObjectives) {
    measure = notMeasurable("no mission-plan objectives (eligibility declarations absent)");
  } else {
    // The module's documented contract: eligibility MUST be proven per-objective; a non-empty
    // `missing` set means the mission is NON_MEASURABLE — the caller must not infer a denominator.
    const elig = eligibilityFromObjectives(planObjectives);
    if (!elig.complete) {
      measure = notMeasurable(`eligibility declarations incomplete: missing [${elig.missing.join(", ")}]`);
    } else {
      // runComplete asserts every declared objective produced a result this run, so an absent result is
      // genuinely NOT_EXECUTED rather than an early stop. Proven here from the data, never assumed.
      const execIds = new Set(patchExecution.executed.map(idOf));
      const runComplete = Object.keys(elig.map).every((id) => execIds.has(id));
      const units = fromExecution(patchExecution, attribution, elig.map, { runComplete });
      measure = measureAutonomy(units);
    }
  }

  return {
    mission,
    sourceArtifacts,
    measure,
    description,
    attribution: { source: attribution ? "objective-attribution.json" : null },
    note:
      "`description` is a DESCRIPTIVE ventilation of recorded events (no denominator); it is NOT an autonomy percentage. " +
      "`measure.autonomyPercent` is null unless measurable (eligible+authorized denominator proven). " +
      "A null denominator or any ambiguity yields measurable:false — never a misleading number.",
  };
}

module.exports = { buildAutonomyRate };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names (notMeasurable,
// idOf) are module-scoped, not global script scope (prevents cross-lot TS2393). CommonJS API unchanged.
export {};
