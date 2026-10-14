#!/usr/bin/env node

"use strict";

/*
 * Autonomy Rate — S1 PERSIST-AUTONOMY-RATE-INTO-ODG-STATE (CTO authorization 2026-10-14).
 *
 * PURPOSE. Reuse glue only. Turns the ALREADY-produced per-run artifacts (patch-execution.json,
 * mission-plan.json objectives, and an OPTIONAL on-disk objective-attribution.json) into ONE honest,
 * governed autonomy signal that the dashboard can read. It REIMPLEMENTS NONE of the measurement logic:
 * every attribution/classification decision is owned by runtime/core/autonomy-measure.js (the frozen
 * Phase-03 calculator). This module only:
 *   1. enforces the module's documented eligibility contract (missing declaration ⇒ NON_MEASURABLE), and
 *   2. assembles the measure (gated % with explicit denominator) + the description (DESCRIPTIVE
 *      ODG/provider/human ventilation, which is NEVER a percentage) into a single provenance-tagged object.
 *
 * PURE/OFFLINE. A function of its inputs only: no filesystem, no network, no clock. The caller
 * (runtime/bin/odg-state.js, the governed single writer) reads the artifacts and stamps `generatedAt`.
 *
 * HONESTY (inherited from autonomy-measure.js, by construction):
 *   - Absent / malformed / ambiguous inputs ⇒ measurable:false + reason, autonomyPercent:null — never a number.
 *   - Provider-authored or applied-by-non-ODG work is EXTERNAL, never the ODG numerator.
 *   - Work without VALID evidence is never a verified ODG step (no attribution artifact ⇒ numerator 0).
 *   - The DESCRIPTIVE ventilation carries no denominator and is explicitly not an autonomy percentage.
 */

const {
  measureAutonomy,
  fromExecution,
  describeExecution,
  eligibilityFromObjectives,
} = require("./autonomy-measure");

// Shape a caller-level not-measurable result to MATCH autonomy-measure.js's own notMeasurable shape,
// so a dashboard reads one consistent `measure` schema whatever the reason.
function notMeasurable(reason) {
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

function idOf(e) {
  if (e && typeof e.objectiveId === "string" && e.objectiveId) return e.objectiveId;
  if (e && typeof e.action === "string" && e.action) return e.action;
  return "(anon)";
}

/**
 * buildAutonomyRate — assemble the governed autonomy artifact from plain per-run data.
 * @param {object} inputs
 * @param {string|null} [inputs.mission]
 * @param {object|null} inputs.patchExecution   parsed patch-execution.json ({mission, executed:[...]}), or null.
 * @param {Array|null}  inputs.planObjectives    mission-plan.json `objectives` (carry `.authorization`), or null.
 * @param {object|null} inputs.attribution       parsed objective-attribution.json output, or null (⇒ nothing verified).
 * @param {Array}       [inputs.sourceArtifacts] provenance list [{path, present}], recorded verbatim.
 * @returns {object} the artifact body (WITHOUT generatedAt — the governed writer stamps that).
 */
function buildAutonomyRate(inputs) {
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
