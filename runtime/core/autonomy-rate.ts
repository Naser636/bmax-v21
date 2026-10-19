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

/**
 * evaluateSLO — PURE SLO verdict over ONE SLI (never an aggregate score; never reads the deterministic
 * 25% benchmark; never coerces measurable:false to a number). Returns WITHIN | BREACH |
 * INSUFFICIENT_EVIDENCE. The target is a DECLARED spec that MUST carry provenance — no live target source
 * exists in the repo (constitution/ROADMAP declare none), so an undeclared/unprovenanced target is refused
 * (INSUFFICIENT_EVIDENCE), never defaulted. This EVALUATES; it performs no measurement (autonomy-measure
 * remains the sole measurer) and no I/O.
 *
 *   sli  = { measurable:boolean, numerator:number, denominator:number, reason?:string }  // the measure view;
 *          SLI-2 (capability successRate) / SLI-3 (test PASS ratio) are adapted into this shape caller-side.
 *   spec = { target:number, direction?:"atLeast"|"atMost", minSampleN?:number,
 *            provenance:{ source:string, authoredBy:string, rationale:string, declaredAt?:string } }
 */
function evaluateSLO(sli: any, spec: any): any {
  const s = sli && typeof sli === "object" ? sli : {};
  const sp = spec && typeof spec === "object" ? spec : {};
  const out = (status: string, actual: any, reason: string) => ({
    status,
    actual,
    target: typeof sp.target === "number" ? sp.target : null,
    sampleSize: typeof s.denominator === "number" ? s.denominator : null,
    reason,
  });

  // 0. The target must be DECLARED with provenance (anti-illusion §8: no unjustified target).
  if (
    typeof sp.target !== "number" || !Number.isFinite(sp.target) ||
    !sp.provenance || typeof sp.provenance !== "object" ||
    !sp.provenance.source || !sp.provenance.authoredBy || !sp.provenance.rationale
  ) {
    return out("INSUFFICIENT_EVIDENCE", null, "undeclared target: spec.target + spec.provenance{source,authoredBy,rationale} are required (no live target source exists)");
  }
  const minN = typeof sp.minSampleN === "number" && sp.minSampleN > 0 ? sp.minSampleN : 1;

  // 1. measurable:false ⇒ never coerced to a number (invariant: measurable:false stays false).
  if (s.measurable !== true) return out("INSUFFICIENT_EVIDENCE", null, s.reason || "sli not measurable");

  // 2. Falsified / impossible-data guard — the sli may be a deserialized artifact, not a fresh compute.
  const num = s.numerator, den = s.denominator;
  if (typeof num !== "number" || typeof den !== "number" || den < 0 || num < 0 || num > den) {
    return out("INSUFFICIENT_EVIDENCE", null, `falsified measure (numerator=${num}, denominator=${den})`);
  }

  // 3. Small-sample gate (invariant 5: small denominators are NOT generalizable).
  if (den < minN) return out("INSUFFICIENT_EVIDENCE", null, `sample N=${den} below minimum ${minN}`);

  // 4. WITHIN vs BREACH — recompute `actual` from num/den (a tampered precomputed percent is thus ignored).
  const actual = num / den;
  const direction = sp.direction === "atMost" ? "atMost" : "atLeast";
  const ok = direction === "atMost" ? actual <= sp.target : actual >= sp.target;
  return out(ok ? "WITHIN" : "BREACH", actual, `actual ${actual} ${direction} target ${sp.target} (N=${den})`);
}

module.exports = { buildAutonomyRate, evaluateSLO };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names (notMeasurable,
// idOf) are module-scoped, not global script scope (prevents cross-lot TS2393). CommonJS API unchanged.
export {};
