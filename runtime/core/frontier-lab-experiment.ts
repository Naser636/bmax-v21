#!/usr/bin/env node
"use strict";

/*
 * V5 PHASE 7 / M-CH5-01 (Frontier Lab — program §7). PURE, deterministic. Two capabilities:
 *  (1) registerExperiment — enforces the §7.3 experiment protocol: an experiment is VALID only with a stable id,
 *      hypothesis, reference, baseline, method and expected result; otherwise INVALID (it cannot run). Fail-closed.
 *  (2) evaluateExperiment — the §7.4 comparison: a candidate method is PROMOTE_CANDIDATE only when it DEMONSTRATES
 *      value over the baseline (measured improvement, no regression, reproducible, and — when sampled eval evidence is
 *      supplied — statistically significant). An innovation is NEVER integrated just because it is newer or popular.
 *      REUSES improvement-baseline.measureDelta + eval-significance.significanceGate. It RECOMMENDS only — promotion
 *      stays external (evolution-loop.applyExternalPromotion); selfAuthorized:false. Dual export.
 */

const BASE = require("./improvement-baseline");        // measureDelta — baseline vs candidate, signal-by-signal
const SIG = require("./eval-significance");            // significanceGate — a win must not be sampling noise

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }

const REQUIRED_FIELDS = Object.freeze(["id", "hypothesis", "reference", "baseline", "method", "expected"]);
const DECISION = Object.freeze(["PROMOTE_CANDIDATE", "KEEP_BASELINE", "INCONCLUSIVE"]);

/** registerExperiment(spec) -> { valid, missing, experiment }. Fail-closed: a missing protocol field ⇒ INVALID. */
function registerExperiment(spec: any): any {
  const s = isObj(spec) ? spec : {};
  const missing = REQUIRED_FIELDS.filter((f) => s[f] === undefined || s[f] === null || (typeof s[f] === "string" && s[f].length === 0));
  const valid = missing.length === 0 && isStr(s.id);
  return Object.freeze({ valid, missing: Object.freeze(missing), experiment: valid ? Object.freeze({ id: s.id, hypothesis: s.hypothesis, reference: s.reference }) : null, note: valid ? "experiment protocol complete (§7.3)" : `INVALID: missing ${missing.join(", ")} — an experiment cannot run without the full protocol (fail-closed)` });
}

/**
 * evaluateExperiment({ baseline, candidate, senseMap, significanceEvidence, reproducible }) -> { decision, delta, reasons, selfAuthorized }.
 * Fail-closed: regression ⇒ KEEP_BASELINE; not reproducible / supplied-but-not-significant / no measured improvement ⇒ INCONCLUSIVE;
 * PROMOTE_CANDIDATE only when it DEMONSTRATES value (improved + no regression + reproducible + significant-if-evidence).
 */
function evaluateExperiment(input: any): any {
  const o = isObj(input) ? input : {};
  const delta = BASE.measureDelta(o.baseline, o.candidate, o.senseMap);
  const reasons: string[] = [];
  const improved = delta.summary.improved > 0;
  const regressed = delta.summary.regressed > 0;
  const reproducible = o.reproducible === true;

  if (regressed) { reasons.push(`candidate regresses ${delta.summary.regressed} metric(s) ⇒ KEEP_BASELINE`); return decide("KEEP_BASELINE", delta, reasons); }
  if (!reproducible) { reasons.push("result not marked reproducible ⇒ INCONCLUSIVE (an unreproducible result is never promoted)"); return decide("INCONCLUSIVE", delta, reasons); }
  if (!improved) { reasons.push("no measured improvement over baseline ⇒ INCONCLUSIVE (newer/popular is not a reason)"); return decide("INCONCLUSIVE", delta, reasons); }
  // when sampled eval evidence is supplied, the improvement must be statistically significant (not noise).
  if (isObj(o.significanceEvidence)) {
    const g = SIG.significanceGate(o.significanceEvidence);
    if (g.verdict !== "IMPROVEMENT") { reasons.push(`improvement not statistically significant (${g.verdict}) ⇒ INCONCLUSIVE`); return decide("INCONCLUSIVE", delta, reasons); }
    reasons.push("improvement is statistically significant");
  }
  reasons.push(`candidate demonstrates value (improved ${delta.summary.improved}, 0 regressions, reproducible) ⇒ PROMOTE_CANDIDATE (recommendation only; promotion external)`);
  return decide("PROMOTE_CANDIDATE", delta, reasons);
}

function decide(decision: string, delta: any, reasons: string[]): any {
  return Object.freeze({ decision, delta: Object.freeze(delta.summary), reasons: Object.freeze(reasons), selfAuthorized: false, grantsNoPromotion: true });
}

const FRONTIER_LAB_EXPERIMENT_CONTRACT = Object.freeze({
  id: "V5-FRONTIER-LAB-EXPERIMENT",
  source: "ODG Master program §7 (Frontier Lab) — §7.3 experiment protocol + §7.4 comparison + §7.5 promotion (external)",
  requiredFields: REQUIRED_FIELDS, decisions: DECISION,
  reuses: Object.freeze(["improvement-baseline.measureDelta (baseline vs candidate)", "eval-significance.significanceGate (win not noise)", "forwards to evolution-loop.applyExternalPromotion (external promotion)"]),
  notAuthority: "registers + evaluates experiments and RECOMMENDS; it promotes nothing and grants no authority",
  invariants: Object.freeze([
    "an experiment is VALID only with the full §7.3 protocol (id/hypothesis/reference/baseline/method/expected); else INVALID (cannot run)",
    "PROMOTE_CANDIDATE only when the candidate DEMONSTRATES value: measured improvement + no regression + reproducible + statistically significant (if evidence supplied)",
    "a regression ⇒ KEEP_BASELINE; an unreproducible or non-significant or non-improving result ⇒ INCONCLUSIVE",
    "an innovation is NEVER integrated just because it is newer or more popular",
    "selfAuthorized:false, grantsNoPromotion:true — promotion stays external; pure/deterministic, no clock/random/network",
  ]),
});

module.exports = { registerExperiment, evaluateExperiment, FRONTIER_LAB_EXPERIMENT_CONTRACT };

if (require.main === module) {
  const reg = registerExperiment({ id: "exp1", hypothesis: "X faster", reference: "ref", baseline: { signals: { latency: 100 } }, method: "A/B", expected: "lower latency" });
  const ev = evaluateExperiment({ baseline: { signals: { successRate: 0.8 } }, candidate: { signals: { successRate: 0.9 } }, reproducible: true });
  process.stdout.write(JSON.stringify({ ...FRONTIER_LAB_EXPERIMENT_CONTRACT, demo: { registered: reg.valid, decision: ev.decision } }, null, 2) + "\n");
}

export {};
