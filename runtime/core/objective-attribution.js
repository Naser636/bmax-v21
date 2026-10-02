#!/usr/bin/env node

"use strict";

/*
 * Objective Attribution — Campaign 04 Path (A): PER-OBJECTIVE EVIDENCE-BACKED ATTRIBUTION.
 *
 * READ-ONLY analyzer. For each objective it joins the EXPECTED side (patch-plan.json: a patch per
 * objective, carrying objectiveId + done_when) to the ACTUAL side (patch-execution.json:
 * executed[] carrying objectiveId + status + optional evidence), BY objectiveId, and emits a
 * per-objective verdict:
 *
 *   EVIDENCED            objectiveId matched + status EXECUTED + evidence present and non-empty.
 *   RECORDED-NO-EVIDENCE objectiveId matched + execution recorded but NO usable evidence
 *                        (read-only/planning objective, or an EXECUTED entry whose evidence is
 *                        absent/empty). Honest coverage — NOT a proof.
 *   FAILED               objectiveId matched + status FAILED.
 *   UNMATCHED            no execution entry carries this objectiveId (missing join).
 *   INCONSISTENT         more than one execution entry carries this objectiveId (ambiguous join).
 *
 * HARD INVARIANTS (by construction):
 *   - This mechanism NEVER evaluates, interprets, or declares an objective's `done_when` SATISFIED.
 *     done_when is carried through as context only; the result exposes doneWhenEvaluated:false and
 *     no "satisfied"/"proven" field. EVIDENCED means "this objective ran and produced a non-empty
 *     evidence artifact", NOT "its done_when is proven".
 *   - RECORDED is never upgraded to a proof.
 *   - A missing/ambiguous join is reported explicitly and is NEVER converted to a PASS/EVIDENCED.
 *   - It reads ONLY the three already-produced artifacts; it writes nothing, changes no gate, and
 *     does not touch the mission-level SUCCESS path (validation-engine).
 *
 * Pure core: attributeObjectives(plan, patch, execution, evidenceProbe) is a pure function of its
 * inputs (evidenceProbe injects the disk check so the core needs no filesystem). The require.main
 * CLI is the only part that reads files, and it only prints.
 */

const VERDICT = Object.freeze({
  EVIDENCED: "EVIDENCED",
  RECORDED_NO_EVIDENCE: "RECORDED-NO-EVIDENCE",
  FAILED: "FAILED",
  UNMATCHED: "UNMATCHED",
  INCONSISTENT: "INCONSISTENT",
});

// Campaign 04 (read-only consumption): the OBSERVED state of an objective's DECLARED proof probe.
// This observes a machine PROXY predicate via the existing capability-probes registry — it is
// explicitly NOT a done_when proof, NOT an objective verdict, and NOT SUCCESS. Path A attribution
// (VERDICT, above) is computed independently and is NEVER affected by this observation.
const OBSERVED = Object.freeze({
  PASSED: "PROBE-PASSED",
  FAILED: "PROBE-FAILED",
  MISSING: "PROBE-MISSING",
  NONE: "NO-PROOF-BINDING",
});
const PROOF_NOTE = "observed proxy predicate only — not a done_when proof and not an objective verdict";

// Reuse the EXISTING registry (no new probe, no duplicated probe implementation).
const capabilityProbes = require("./capability-probes");

/**
 * Observe (READ-ONLY) an objective's DECLARED proof probe through the EXISTING capability-probes
 * registry. Never interprets done_when. An unknown/unregistered name ⇒ MISSING (never a pass). A
 * registered probe is executed via the injected runner and recorded as PASSED/FAILED. The result is
 * a declared-proof OBSERVATION only; callers must never read it as a proof of the objective.
 */
function observeProof(proof, known, run, ctx) {
  if (proof === null) {
    return { proof: null, observed: OBSERVED.NONE, detail: "objective declares no proof binding", note: PROOF_NOTE };
  }
  if (!known(proof)) {
    return { proof, observed: OBSERVED.MISSING, detail: `no registered probe named "${proof}"`, note: PROOF_NOTE };
  }
  const r = run(proof, ctx) || {};
  return {
    proof,
    observed: r.ok === true ? OBSERVED.PASSED : OBSERVED.FAILED,
    detail: typeof r.detail === "string" ? r.detail : null,
    note: PROOF_NOTE,
  };
}

/**
 * @param {object|null} plan       parsed mission-plan.json (used only for a coverage cross-check)
 * @param {object|null} patch      parsed patch-plan.json (the per-objective EXPECTED side)
 * @param {object|null} execution  parsed patch-execution.json (the ACTUAL side)
 * @param {(evidencePath:string)=>boolean} evidenceProbe  returns true iff the evidence artifact
 *        exists AND is non-empty. Injected so the core stays pure/testable.
 * @returns {{objectives: Array, summary: object}}
 */
function attributeObjectives(plan, patch, execution, evidenceProbe, probeRunner, probeKnown, probeCtx) {
  const probe = typeof evidenceProbe === "function" ? evidenceProbe : () => false;
  // Proof-observation injectables default to the EXISTING capability-probes registry (reuse, not
  // duplicate). Tests inject fakes to stay hermetic. These never influence the Path A verdict.
  const run = typeof probeRunner === "function" ? probeRunner : capabilityProbes.runProbe;
  const known = typeof probeKnown === "function"
    ? probeKnown
    : (name) => Object.prototype.hasOwnProperty.call(capabilityProbes.PROBES, name);
  const ctx = probeCtx && typeof probeCtx === "object" ? probeCtx : {};

  const patches = patch && Array.isArray(patch.patches) ? patch.patches : [];
  const executed = execution && Array.isArray(execution.executed) ? execution.executed : [];

  // Group execution entries by objectiveId to detect missing (0) and ambiguous (>1) joins.
  const byObjective = new Map();
  for (const e of executed) {
    if (!e || typeof e !== "object") continue;
    const oid = typeof e.objectiveId === "string" ? e.objectiveId : null;
    if (oid === null) continue; // an execution entry without an objectiveId cannot be attributed
    if (!byObjective.has(oid)) byObjective.set(oid, []);
    byObjective.get(oid).push(e);
  }

  const objectives = patches.map((p) => {
    const objectiveId = p && typeof p.objectiveId === "string" ? p.objectiveId : null;
    const doneWhen = p && Array.isArray(p.done_when) ? p.done_when : [];
    const base = { objectiveId, doneWhen, doneWhenEvaluated: false };

    if (objectiveId === null) {
      return { ...base, verdict: VERDICT.UNMATCHED, status: null, evidence: null, reason: "patch has no objectiveId" };
    }

    const matches = byObjective.get(objectiveId) || [];
    if (matches.length === 0) {
      return { ...base, verdict: VERDICT.UNMATCHED, status: null, evidence: null, reason: "no execution entry for this objectiveId" };
    }
    if (matches.length > 1) {
      return { ...base, verdict: VERDICT.INCONSISTENT, status: null, evidence: null, reason: `${matches.length} execution entries share this objectiveId` };
    }

    const e = matches[0];
    const status = typeof e.status === "string" ? e.status : null;
    const evidence = typeof e.evidence === "string" ? e.evidence : null;

    if (status === "FAILED") {
      return { ...base, verdict: VERDICT.FAILED, status, evidence, reason: "execution status FAILED" };
    }

    // EVIDENCED requires BOTH an EXECUTED status AND a usable (present & non-empty) evidence file.
    if (status === "EXECUTED" && evidence !== null && probe(evidence)) {
      return { ...base, verdict: VERDICT.EVIDENCED, status, evidence, reason: "status EXECUTED + evidence present and non-empty" };
    }

    // Everything else that matched and did not fail: recorded, but without usable evidence.
    // (read-only RECORDED objective, or an EXECUTED entry whose evidence is absent/empty, or any
    //  other non-FAILED status). Never upgraded to a proof.
    const why =
      status === "EXECUTED"
        ? "status EXECUTED but evidence absent or empty — not evidenced"
        : `status ${status === null ? "(none)" : status} carries no usable evidence`;
    return { ...base, verdict: VERDICT.RECORDED_NO_EVIDENCE, status, evidence, reason: why };
  });

  // Campaign 04 consumption: attach a SEPARATE, read-only declared-proof OBSERVATION per objective.
  // The Path A verdict objects above are spread UNCHANGED — the observation never alters attribution.
  const objectivesOut = objectives.map((attr, i) => {
    const p = patches[i];
    const proof = p && typeof p.proof === "string" && p.proof ? p.proof : null;
    return { ...attr, declaredProof: observeProof(proof, known, run, ctx) };
  });

  const count = (v) => objectivesOut.filter((o) => o.verdict === v).length;
  const countObserved = (v) => objectivesOut.filter((o) => o.declaredProof.observed === v).length;
  const planObjectiveCount = plan && Array.isArray(plan.objectives) ? plan.objectives.length : null;
  const warnings = [];
  if (planObjectiveCount !== null && planObjectiveCount !== patches.length) {
    warnings.push(`mission-plan objectives (${planObjectiveCount}) != patch-plan patches (${patches.length})`);
  }

  const summary = {
    total: objectivesOut.length,
    evidenced: count(VERDICT.EVIDENCED),
    recordedNoEvidence: count(VERDICT.RECORDED_NO_EVIDENCE),
    failed: count(VERDICT.FAILED),
    unmatched: count(VERDICT.UNMATCHED),
    inconsistent: count(VERDICT.INCONSISTENT),
    // Declared-proof OBSERVATION tallies (proxy predicates only; never a done_when proof).
    proofPassed: countObserved(OBSERVED.PASSED),
    proofFailed: countObserved(OBSERVED.FAILED),
    proofMissing: countObserved(OBSERVED.MISSING),
    proofUnbound: countObserved(OBSERVED.NONE),
    // This analyzer never asserts done_when satisfaction — stated explicitly in the output.
    doneWhenEvaluated: false,
    warnings,
  };

  return { objectives: objectivesOut, summary };
}

module.exports = { attributeObjectives, VERDICT, OBSERVED };

// ---------------------------------------------------------------------------
// Read-only CLI: read the three already-produced artifacts and PRINT the attribution. Writes
// nothing, gates nothing. Never fabricates a verdict — missing artifacts are reported as such.
// ---------------------------------------------------------------------------
if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const GENERATED_DIR = "runtime/generated";
  const readJsonSafe = (file) => {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
  };
  const evidenceProbe = (p) => {
    try { return typeof p === "string" && p.length > 0 && fs.statSync(p).size > 0; } catch { return false; }
  };

  const plan = readJsonSafe(path.join(GENERATED_DIR, "mission-plan.json"));
  const patch = readJsonSafe(path.join(GENERATED_DIR, "patch-plan.json"));
  const execution = readJsonSafe(path.join(GENERATED_DIR, "patch-execution.json"));

  if (!patch || !execution) {
    console.error("STOP: missing patch-plan.json / patch-execution.json — earlier stages must run first.");
    process.exit(1);
  }

  // Build the SAME probe ctx the mission-level gate uses, so declared-proof observation reuses the
  // existing registry against real evidence. Observation only — the SUCCESS gate is NOT touched.
  const verify = readJsonSafe(path.join(GENERATED_DIR, "runtime-verify.json"));
  const probeCtx = { missionId: (plan && plan.mission) || (patch && patch.mission), verify };
  const result = attributeObjectives(plan, patch, execution, evidenceProbe, undefined, undefined, probeCtx);
  console.log("======================================");
  console.log("OBJECTIVE ATTRIBUTION (Campaign 04 — read-only; done_when NOT evaluated)");
  console.log("Path A verdict + declared-proof OBSERVATION (proxy predicate, NOT a done_when proof)");
  console.log("======================================");
  for (const o of result.objectives) {
    const dp = o.declaredProof;
    const proofStr = dp.observed === "NO-PROOF-BINDING" ? "" : `  [proof:${dp.proof} => ${dp.observed}]`;
    console.log(`  ${o.objectiveId === null ? "(no objectiveId)" : o.objectiveId} : ${o.verdict} — ${o.reason}${proofStr}`);
  }
  console.log("--------------------------------------");
  console.log(JSON.stringify(result.summary));
  console.log("======================================");
  // Read-only analyzer: exit 0 regardless of the mix. It observes; it does not gate SUCCESS.
  process.exit(0);
}
