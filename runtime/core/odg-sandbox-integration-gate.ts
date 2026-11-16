#!/usr/bin/env node
"use strict";
/*
 * V232 §8 — SANDBOX AUTO-INTEGRATION DECISION GATE. PURE, deterministic, DENY-BY-DEFAULT. Given the evidence from a
 * sandbox experiment, it decides INTEGRATE / REJECT / RETURN_TO_EXPERIMENT. It does NOT execute an integration, run the
 * sandbox, or deploy anything — it is the DECISION gate a controlled auto-integration chain consults (like governanceGate
 * / action-gate are decision gates). It composes the EXISTING isolation (frontier-sandbox) + maturity ladder; no new gate
 * engine, no second roadmap.
 *
 * HARD RULES (deny-by-default): INTEGRATE requires ALL 12 §8 conditions true. A CONTRACT/PERMISSION/SECURITY violation ⇒
 * REJECT (a hard stop, never "retry"). A missing soft condition (need/review/baseline/tests/non-regression/gain/isolation/
 * inspection-when-significant/V12.4-link/rollback) ⇒ RETURN_TO_EXPERIMENT. A significant change without independent
 * inspection stays VALIDATION_PENDING ⇒ RETURN, never INTEGRATE.
 *
 * CRITICAL BOUNDARY: INTEGRATE = merge-eligible decision, NOT deployment. Deployment, secrets, destructive ops, real
 * production changes and external spend ALWAYS stay OWNER_GATED regardless of this verdict. Dual export.
 */

// The 12 §8 conditions. `hard` = a violation ⇒ REJECT (not retry); others ⇒ RETURN_TO_EXPERIMENT when false.
const CONDITIONS = Object.freeze([
  { key: "linkedToV124", hard: false, desc: "improvement linked to a V12.4 requirement/mission" },
  { key: "needDemonstrated", hard: false, desc: "a real need or opportunity is demonstrated" },
  { key: "codeAndDepsReviewed", hard: false, desc: "code + dependencies reviewed" },
  { key: "isolatedExperiment", hard: false, desc: "ran in an isolated sandbox (frontier-sandbox)" },
  { key: "baselineRecorded", hard: false, desc: "baseline recorded before the change" },
  { key: "functionalTestsPass", hard: false, desc: "functional tests pass" },
  { key: "nonRegressionPass", hard: false, desc: "non-regression (full gate) passes" },
  { key: "measurableGainOrNewCapability", hard: false, desc: "a measurable gain or a demonstrated new capability" },
  { key: "noContractOrPermissionViolation", hard: true, desc: "no contract/permission violation" },
  { key: "securityValidated", hard: true, desc: "security validation passed" },
  { key: "independentInspection", hard: false, desc: "independent inspection (required when significant)" },
  { key: "rollbackAvailable", hard: false, desc: "a rollback procedure is available" },
]);

/* decide(evidence) -> integration verdict. evidence: a map of the 12 condition keys to booleans + optional {significant}.
 * A missing key is treated as FALSE (deny-by-default: unproven ⇒ not satisfied). */
function decide(evidence?: any): any {
  const e = evidence && typeof evidence === "object" ? evidence : {};
  const significant = e.significant !== false;   // default: treat as significant (inspection required) unless explicitly false

  const results = CONDITIONS.map((c: any) => {
    // inspection only required when the change is significant; otherwise it is auto-satisfied.
    const satisfied = (c.key === "independentInspection" && !significant) ? true : e[c.key] === true;
    return Object.freeze({ key: c.key, hard: c.hard, satisfied, desc: c.desc });
  });

  const hardViolations = results.filter((r: any) => r.hard && !r.satisfied).map((r: any) => r.key);
  const softMissing = results.filter((r: any) => !r.hard && !r.satisfied).map((r: any) => r.key);
  const allSatisfied = results.every((r: any) => r.satisfied);

  const verdict = hardViolations.length > 0 ? "REJECT"
    : allSatisfied ? "INTEGRATE"
    : "RETURN_TO_EXPERIMENT";

  return Object.freeze({
    verdict, significant,
    satisfiedCount: results.filter((r: any) => r.satisfied).length, total: CONDITIONS.length,
    hardViolations: Object.freeze(hardViolations),
    softMissing: Object.freeze(softMissing),
    conditions: Object.freeze(results),
    deployStillOwnerGated: true,   // ALWAYS — integration ≠ deployment
    reason: verdict === "REJECT" ? "hard stop — contract/permission/security violation: " + hardViolations.join(", ")
      : verdict === "INTEGRATE" ? "all 12 §8 conditions satisfied — merge-eligible (NOT deployed; deploy stays OWNER_GATED)"
      : "return to experiment — unsatisfied condition(s): " + softMissing.join(", ") + (significant && softMissing.includes("independentInspection") ? " (VALIDATION_PENDING: significant change needs independent inspection)" : ""),
    note: "DENY-BY-DEFAULT: a missing condition is treated as unsatisfied. INTEGRATE authorizes a MERGE only — NOT deployment; secrets/destructive/production/external-spend remain OWNER_GATED regardless of this verdict.",
  });
}

const SANDBOX_INTEGRATION_GATE_CONTRACT = Object.freeze({
  id: "V232-SANDBOX-INTEGRATION-GATE",
  purpose: "§8 — deny-by-default auto-integration DECISION over the 12 sandbox-experiment conditions; INTEGRATE ≠ DEPLOY",
  invariants: Object.freeze([
    "DENY-BY-DEFAULT: INTEGRATE only when ALL 12 §8 conditions are satisfied; a missing condition = unsatisfied",
    "a CONTRACT/PERMISSION/SECURITY violation ⇒ REJECT (hard stop, never retry); other misses ⇒ RETURN_TO_EXPERIMENT",
    "a significant change without independent inspection ⇒ RETURN (VALIDATION_PENDING), NEVER INTEGRATE",
    "INTEGRATE = merge-eligible decision ONLY; deploy/secrets/destructive/production/external-spend stay OWNER_GATED; decides nothing itself",
  ]),
});

module.exports = { CONDITIONS, decide, SANDBOX_INTEGRATION_GATE_CONTRACT };
export {};
