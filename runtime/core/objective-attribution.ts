#!/usr/bin/env node

"use strict";

/*
 * Objective Attribution (TypeScript port; parity with runtime/core/objective-attribution.js).
 *
 * READ-ONLY analyzer: joins the EXPECTED side (patch-plan patches) to the ACTUAL side (patch-execution
 * executed[]) BY objectiveId and emits a per-objective verdict (EVIDENCED / RECORDED-NO-EVIDENCE /
 * FAILED / UNMATCHED / INCONSISTENT), plus a SEPARATE read-only declared-proof OBSERVATION. HARD
 * INVARIANTS preserved: never evaluates done_when; RECORDED never upgraded to proof; missing/ambiguous
 * joins never become PASS; writes nothing. Pure core (attributeObjectives is a function of its inputs;
 * the evidence check + probe runner/known are INJECTED). deps=1 capability-probes (only the default
 * probe runner/known; already resolvable in dist — co-located). Strict port: exports (attributeObjectives,
 * VERDICT, OBSERVED), the APPLIED-write evidence rule, the enforced-refusal guard and the summary tallies
 * are preserved EXACTLY. The historical .js remains the behavioural reference.
 */

const VERDICT = Object.freeze({
  EVIDENCED: "EVIDENCED",
  RECORDED_NO_EVIDENCE: "RECORDED-NO-EVIDENCE",
  FAILED: "FAILED",
  UNMATCHED: "UNMATCHED",
  INCONSISTENT: "INCONSISTENT",
});

const OBSERVED = Object.freeze({
  PASSED: "PROBE-PASSED",
  FAILED: "PROBE-FAILED",
  MISSING: "PROBE-MISSING",
  NONE: "NO-PROOF-BINDING",
});
const PROOF_NOTE = "observed proxy predicate only — not a done_when proof and not an objective verdict";

// Reuse the EXISTING registry (no new probe, no duplicated probe implementation).
const capabilityProbes = require("./capability-probes");

function observeProof(proof: any, known: any, run: any, ctx: any): any {
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

function attributeObjectives(plan: any, patch: any, execution: any, evidenceProbe: any, probeRunner?: any, probeKnown?: any, probeCtx?: any): any {
  const probe = typeof evidenceProbe === "function" ? evidenceProbe : () => false;
  const run = typeof probeRunner === "function" ? probeRunner : capabilityProbes.runProbe;
  const known = typeof probeKnown === "function"
    ? probeKnown
    : (name: any) => Object.prototype.hasOwnProperty.call(capabilityProbes.PROBES, name);
  const ctx = probeCtx && typeof probeCtx === "object" ? probeCtx : {};

  const patches = patch && Array.isArray(patch.patches) ? patch.patches : [];
  const executed = execution && Array.isArray(execution.executed) ? execution.executed : [];

  const byObjective = new Map();
  for (const e of executed) {
    if (!e || typeof e !== "object") continue;
    const oid = typeof e.objectiveId === "string" ? e.objectiveId : null;
    if (oid === null) continue;
    if (!byObjective.has(oid)) byObjective.set(oid, []);
    byObjective.get(oid).push(e);
  }

  const objectives = patches.map((p: any) => {
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

    if (status === "EXECUTED" && evidence !== null && probe(evidence)) {
      return { ...base, verdict: VERDICT.EVIDENCED, status, evidence, reason: "status EXECUTED + evidence present and non-empty" };
    }

    // APPLIED real-file WRITE (Phase-03, CTO Gate B): the deliverable IS its evidence.
    if (status === "APPLIED") {
      const files = Array.isArray(e.files) ? e.files : [];
      const targets = files
        .map((f: any) => (f && typeof f.target === "string" ? f.target.trim() : ""))
        .filter((t: any) => t.length > 0);
      const admission = Array.isArray(e.admission) ? e.admission : [];
      const enforcedRefusal = admission.some((a: any) => a && a.enforced === true && a.decision !== "ALLOW");
      const allTargetsPresent = targets.length > 0 && targets.every((t: any) => probe(t));
      if (allTargetsPresent && !enforcedRefusal) {
        return { ...base, verdict: VERDICT.EVIDENCED, status, evidence: targets.join("; "),
          reason: "status APPLIED + every written target present and non-empty + no enforced refusal" };
      }
      const why = enforcedRefusal
        ? "status APPLIED under an enforced non-ALLOW admission — never counted as autonomous"
        : targets.length === 0
          ? "status APPLIED but no written target declared — not evidenced"
          : "status APPLIED but a written target is absent or empty — not evidenced";
      return { ...base, verdict: VERDICT.RECORDED_NO_EVIDENCE, status, evidence, reason: why };
    }

    const why =
      status === "EXECUTED"
        ? "status EXECUTED but evidence absent or empty — not evidenced"
        : `status ${status === null ? "(none)" : status} carries no usable evidence`;
    return { ...base, verdict: VERDICT.RECORDED_NO_EVIDENCE, status, evidence, reason: why };
  });

  // The proof binding is declared on the mission CONTRACT objective (plan.objectives[].proof) — the SAME
  // source the Validation Engine reads (validation-engine.*:evaluateObjectiveProofs over plan.objectives).
  // Resolve it by objectiveId (order-independent), falling back to the patch-plan's own `proof` field for
  // legacy plans that stamped it there. This removes the documented attribution↔validation disagreement
  // where attribution read ONLY patches[i].proof and reported a false NO-PROOF-BINDING while the engine
  // correctly saw the declared proof (e.g. VE_CROSS_MISSION_OWNERSHIP_GUARD). Backward compatible: with no
  // plan proof, behaviour is identical to before (patch proof, else null).
  const planObjectives = plan && Array.isArray(plan.objectives) ? plan.objectives : [];
  const proofByObjId = new Map();
  for (const o of planObjectives) {
    if (o && typeof o.id === "string" && typeof o.proof === "string" && o.proof) proofByObjId.set(o.id, o.proof);
  }
  const objectivesOut = objectives.map((attr: any, i: number) => {
    const p = patches[i];
    const fromPlan = attr && typeof attr.objectiveId === "string" ? proofByObjId.get(attr.objectiveId) : undefined;
    const proof = (typeof fromPlan === "string" && fromPlan)
      ? fromPlan
      : (p && typeof p.proof === "string" && p.proof ? p.proof : null);
    return { ...attr, declaredProof: observeProof(proof, known, run, ctx) };
  });

  const count = (v: any) => objectivesOut.filter((o: any) => o.verdict === v).length;
  const countObserved = (v: any) => objectivesOut.filter((o: any) => o.declaredProof.observed === v).length;
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
    proofPassed: countObserved(OBSERVED.PASSED),
    proofFailed: countObserved(OBSERVED.FAILED),
    proofMissing: countObserved(OBSERVED.MISSING),
    proofUnbound: countObserved(OBSERVED.NONE),
    doneWhenEvaluated: false,
    warnings,
  };

  return { objectives: objectivesOut, summary };
}

module.exports = { attributeObjectives, VERDICT, OBSERVED };

// ---------------------------------------------------------------------------
// Read-only CLI: read the three already-produced artifacts and PRINT the attribution.
// ---------------------------------------------------------------------------
if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const GENERATED_DIR = "runtime/generated";
  const readJsonSafe = (file: any) => {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
  };
  const evidenceProbe = (p: any) => {
    try { return typeof p === "string" && p.length > 0 && fs.statSync(p).size > 0; } catch { return false; }
  };

  const plan = readJsonSafe(path.join(GENERATED_DIR, "mission-plan.json"));
  const patch = readJsonSafe(path.join(GENERATED_DIR, "patch-plan.json"));
  const execution = readJsonSafe(path.join(GENERATED_DIR, "patch-execution.json"));

  if (!patch || !execution) {
    console.error("STOP: missing patch-plan.json / patch-execution.json — earlier stages must run first.");
    process.exit(1);
  }

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
  process.exit(0);
}

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names (observeProof)
// are module-scoped, not global script scope (prevents cross-lot TS2393). The CommonJS API is unchanged.
export {};
