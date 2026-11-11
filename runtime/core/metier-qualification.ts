#!/usr/bin/env node
"use strict";
/*
 * V137 — MÉTIER QUALIFICATION evaluator. PURE, deterministic, fail-closed. Given the results of running a métier's
 * canonical module through THREE scenario classes — NOMINAL (valid input ⇒ correct output), BOUNDARY (edge input ⇒
 * handled), CONTROLLED-FAILURE (malformed/hostile input ⇒ FAIL-CLOSED) — it classifies the métier's LOCAL qualification
 * and maturity. It does NOT run the scenarios itself (the runner invokes the real modules and injects the results), and it
 * NEVER promotes a local test to production: the maturity vocabulary explicitly separates VALIDATED_LOCAL (tests pass) from
 * ACTIVE_IN_PRODUCTION (never emitted here). A scenario that did not run, or whose fail-closed check did not hold, fails
 * qualification — a métier is QUALIFIED only when all three classes pass AND the failure class is genuinely fail-closed.
 */
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
// one scenario result: { ran:boolean, passed:boolean, detail?:string }. Absent/garbage ⇒ not-ran, not-passed (fail-closed).
function norm(s: any): { ran: boolean; passed: boolean; detail: string } {
  if (!isObj(s)) return { ran: false, passed: false, detail: "no result (fail-closed)" };
  return { ran: s.ran === true, passed: s.ran === true && s.passed === true, detail: typeof s.detail === "string" ? s.detail : "" };
}

/** evaluateQualification(metier, results) -> frozen verdict. results = { nominal, boundary, failure } scenario results.
 * qualified === (all three ran AND passed). The FAILURE class is the fail-closed proof — if it did not pass, the métier is
 * NOT qualified regardless of nominal/boundary. Maturity is LOCAL-only; ACTIVE_IN_PRODUCTION is never emitted. */
function evaluateQualification(metier: any, results: any): any {
  const r = isObj(results) ? results : {};
  const nominal = norm(r.nominal), boundary = norm(r.boundary), failure = norm(r.failure);
  const all = [nominal, boundary, failure];
  const ranCount = all.filter((s) => s.ran).length;
  const passCount = all.filter((s) => s.passed).length;
  const qualified = nominal.passed && boundary.passed && failure.passed;
  // maturity — honest, LOCAL-scoped taxonomy (test maturity ≠ production operation):
  //  VALIDATED_LOCAL   : all three classes pass (incl. genuine fail-closed) — the strongest a LOCAL test can assert.
  //  PARTIAL_LOCAL     : nominal + fail-closed hold but boundary did not (functional + safe, edge-handling gap).
  //  NOT_FAIL_CLOSED   : nominal works but the failure class did NOT fail-closed — a SAFETY gap (surfaced, never hidden).
  //  NOT_QUALIFIED     : nominal did not pass / scenarios did not run.
  let maturity: string;
  if (qualified) maturity = "VALIDATED_LOCAL";
  else if (nominal.passed && failure.passed) maturity = "PARTIAL_LOCAL";
  else if (nominal.passed && !failure.passed && failure.ran) maturity = "NOT_FAIL_CLOSED";
  else maturity = "NOT_QUALIFIED";
  return Object.freeze({
    metier: typeof metier === "string" ? metier : (isObj(metier) ? metier.metier : "(unnamed)"),
    qualified, maturity,
    scenarios: Object.freeze({ nominal: Object.freeze(nominal), boundary: Object.freeze(boundary), failure: Object.freeze(failure) }),
    ranCount, passCount,
    note: "LOCAL qualification from three scenario classes; maturity is test-scoped (VALIDATED_LOCAL ≠ ACTIVE_IN_PRODUCTION); a non-fail-closed failure class is a surfaced SAFETY gap.",
  });
}

/** summarise(verdicts) -> frozen matrix roll-up. Honest: counts by maturity; qualifiedCount; any safety gaps surfaced. */
function summarise(verdicts: any[]): any {
  const v = Array.isArray(verdicts) ? verdicts.filter(isObj) : [];
  const byMaturity: any = { VALIDATED_LOCAL: 0, PARTIAL_LOCAL: 0, NOT_FAIL_CLOSED: 0, NOT_QUALIFIED: 0 };
  for (const x of v) if (byMaturity[x.maturity] !== undefined) byMaturity[x.maturity]++;
  return Object.freeze({
    total: v.length, qualifiedCount: v.filter((x) => x.qualified === true).length,
    byMaturity: Object.freeze(byMaturity),
    safetyGaps: Object.freeze(v.filter((x) => x.maturity === "NOT_FAIL_CLOSED").map((x) => x.metier)),
    allQualified: v.length > 0 && v.every((x) => x.qualified === true),
    note: "ACTIVE_IN_PRODUCTION is NOT assertable from this matrix (local tests only); production operation requires real operational evidence.",
  });
}

const METIER_QUALIFICATION_CONTRACT = Object.freeze({
  id: "V137-METIER-QUALIFICATION",
  purpose: "Classify a métier's LOCAL qualification from nominal/boundary/controlled-failure scenario results; fail-closed; test-scoped maturity.",
  invariants: Object.freeze([
    "qualified ⟺ all three scenario classes ran AND passed (nominal correct + boundary handled + failure fail-closed)",
    "the FAILURE class is the fail-closed proof — if it did not pass, the métier is NOT qualified (safety gap surfaced, not hidden)",
    "maturity is LOCAL/test-scoped; ACTIVE_IN_PRODUCTION is NEVER emitted here (tests ≠ production operation)",
    "a scenario with no/garbage result counts as not-ran + not-passed (fail-closed); pure/deterministic/frozen output",
  ]),
});

module.exports = { evaluateQualification, summarise, METIER_QUALIFICATION_CONTRACT };
export {};
