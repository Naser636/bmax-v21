#!/usr/bin/env node
"use strict";

/*
 * V5 PHASE 4 / M-CH3-03 (Root-Cause Engineering — program §4.4 + RCE-07 Independent Assurance + RCE-08 Repair Decision).
 * PURE, deterministic. Enforces the obligatory repair-assurance chain before a fix may be kept:
 *   FAIL-TO-PASS (the reproduction test FAILED before the fix and PASSES after) · PASS-TO-PASS (previously-passing tests
 *   still pass — no regression) · ADVERSARIAL (survives adversarial probing) · INDEPENDENT VERIFY (the verifier is
 *   independent of the patch generator — the fix is NEVER its own proof). Decision: RETAIN / ROLLBACK / NEEDS_REVIEW.
 * REUSES evaluator-independence.auditIndependence (Builder≠Verifier). Fail-closed: incomplete evidence ⇒ NEEDS_REVIEW
 * (never RETAIN on an unproven fix); any pass-to-pass regression or failed adversarial ⇒ ROLLBACK. It decides whether
 * to KEEP a repair's evidence bundle; it applies/reverts nothing itself and grants no authority. Dual export.
 */

const IND = require("./evaluator-independence");       // auditIndependence — the verifier must be independent of the builder

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const DECISION = Object.freeze(["RETAIN", "ROLLBACK", "NEEDS_REVIEW"]);

/**
 * assessRepair({ reproduction, passToPass, adversarial, actors }) -> { decision, gates, reasons }.
 *   reproduction: { beforeFix: bool, afterFix: bool } — fail-to-pass: must be FALSE before, TRUE after.
 *   passToPass: [{ id, beforeFix: bool, afterFix: bool }] — each must stay TRUE → TRUE (a TRUE→FALSE is a regression).
 *   adversarial: { ran: bool, passed: bool } — optional; if ran and not passed ⇒ ROLLBACK.
 *   actors: { builder:{id,...}, verifier:{id,...} } — independence (the fix is never its own proof).
 * Fail-closed: missing reproduction / independence COMPROMISED / incomplete evidence ⇒ NEEDS_REVIEW; regression ⇒ ROLLBACK.
 */
function assessRepair(input: any): any {
  const o = isObj(input) ? input : {};
  const reasons: string[] = []; const gates: any = {};

  // FAIL-TO-PASS — the reproduction test must have FAILED before and PASS after.
  const rep = isObj(o.reproduction) ? o.reproduction : null;
  if (!rep || typeof rep.beforeFix !== "boolean" || typeof rep.afterFix !== "boolean") { gates.failToPass = "UNVERIFIED"; reasons.push("no reproduction result (beforeFix/afterFix) ⇒ cannot prove fail-to-pass"); }
  else if (rep.beforeFix === true) { gates.failToPass = "INVALID"; reasons.push("the reproduction test PASSED before the fix — it does not demonstrate the defect (the fix is not proven)"); }
  else if (rep.afterFix !== true) { gates.failToPass = "FAIL"; reasons.push("the reproduction test still FAILS after the fix — the defect is not resolved"); }
  else { gates.failToPass = "PASS"; }

  // PASS-TO-PASS — previously-passing tests must still pass (no regression).
  const p2p = arr(o.passToPass).filter(isObj);
  const regressions = p2p.filter((t) => t.beforeFix === true && t.afterFix !== true);
  gates.passToPass = p2p.length === 0 ? "UNVERIFIED" : (regressions.length === 0 ? "PASS" : "REGRESSION");
  if (p2p.length === 0) reasons.push("no pass-to-pass tests supplied ⇒ cannot prove no regression");
  if (regressions.length > 0) reasons.push(`${regressions.length} previously-passing test(s) now fail (regression)`);

  // ADVERSARIAL — optional; if it ran it must pass.
  const adv = isObj(o.adversarial) ? o.adversarial : null;
  gates.adversarial = !adv || adv.ran !== true ? "NOT_RUN" : (adv.passed === true ? "PASS" : "FAIL");
  if (gates.adversarial === "FAIL") reasons.push("adversarial testing found a failure");

  // INDEPENDENT VERIFY — the fix is never its own proof (reuse evaluator-independence).
  const indep = IND.auditIndependence(isObj(o.actors) ? o.actors : {});
  gates.independence = indep.verdict;
  if (indep.verdict === "COMPROMISED") reasons.push("verifier is NOT independent of the builder — the fix would be its own proof (COMPROMISED)");
  else if (indep.verdict === "INSUFFICIENT_DATA") reasons.push("builder/verifier identities not supplied — independence unproven");

  // DECISION ladder (fail-closed).
  let decision: string;
  if (gates.passToPass === "REGRESSION" || gates.adversarial === "FAIL") decision = "ROLLBACK";
  else if (gates.failToPass === "PASS" && gates.passToPass === "PASS" && indep.verdict !== "COMPROMISED" && indep.verdict !== "INSUFFICIENT_DATA" && gates.adversarial !== "FAIL") decision = "RETAIN";
  else decision = "NEEDS_REVIEW";
  if (decision === "RETAIN") reasons.push("fail-to-pass ✓ + pass-to-pass ✓ + independent verifier + no adversarial failure ⇒ RETAIN");

  return Object.freeze({ decision, gates: Object.freeze(gates), reasons: Object.freeze(reasons) });
}

const RCE_ASSURANCE_CHAIN_CONTRACT = Object.freeze({
  id: "V5-RCE-ASSURANCE-CHAIN",
  source: "ODG Master program §4.4 repair chain + RCE-07 Independent Assurance + RCE-08 Repair Decision",
  decisions: DECISION,
  reuses: Object.freeze(["evaluator-independence.auditIndependence (Builder≠Verifier)", "consumes p1-differential-property / p6-mutation / eval-significance results as the adversarial/pass evidence"]),
  notAuthority: "decides whether to KEEP a repair's evidence bundle; it applies/reverts nothing and grants no authority",
  invariants: Object.freeze([
    "RETAIN requires fail-to-pass (reproduction FAILED before, PASSES after) AND pass-to-pass (no regression) AND an INDEPENDENT verifier AND no adversarial failure",
    "a previously-passing test now failing ⇒ ROLLBACK; an adversarial failure ⇒ ROLLBACK",
    "the fix is NEVER its own proof: a verifier not independent of the builder ⇒ COMPROMISED ⇒ NEEDS_REVIEW",
    "fail-closed: missing reproduction / unproven independence / incomplete evidence ⇒ NEEDS_REVIEW (never RETAIN on an unproven fix)",
    "pure/deterministic: outcomes in → decision out; no clock/random/network; applies nothing",
  ]),
});

module.exports = { assessRepair, RCE_ASSURANCE_CHAIN_CONTRACT };

if (require.main === module) {
  const demo = assessRepair({ reproduction: { beforeFix: false, afterFix: true }, passToPass: [{ id: "t1", beforeFix: true, afterFix: true }], adversarial: { ran: true, passed: true }, actors: { builder: { id: "b" }, verifier: { id: "v" } } });
  process.stdout.write(JSON.stringify({ ...RCE_ASSURANCE_CHAIN_CONTRACT, demo: { decision: demo.decision, gates: demo.gates } }, null, 2) + "\n");
}

export {};
