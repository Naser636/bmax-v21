#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V85 §6 — INSPECTOR META-VALIDATION. PURE, deterministic. The producer can never be its own only inspector;
 * but an INSPECTOR is itself a mechanism that can be wrong. A clean green suite proves nothing if the inspector cannot
 * CATCH a known defect. This treats the INSPECTOR as the system-under-test: given a battery of LABELLED cases (ground
 * truth DEFECTIVE | CLEAN) and the inspector's own verdict, it scores a confusion matrix {TP,FP,TN,FN} and derives
 * detectionRate (recall on seeded defects), falsePositiveRate, falseNegativeRate. FAIL-CLOSED: an inspector that detects
 * zero seeded defects is INEFFECTIVE no matter how many clean cases it waves through; an empty/defect-free battery is NOT
 * a pass (nothing measured). This is the mutation-testing idea (p6-mutation-testing) lifted from the test-suite level to
 * the INSPECTOR level. It composes; it creates no authorizer and decides no closure — ODG acts on the honest verdict.
 * Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function round(n: number): number { return Number(n.toFixed(4)); }

/*
 * metaValidate({ inspector, cases, minDetection? }) -> meta-validation verdict for ONE inspector.
 *   inspector(caseInput) -> any   — the real inspector under test (its raw verdict object/value).
 *   cases: [{ id, label:"DEFECTIVE"|"CLEAN", input, detects(verdict)->bool }]
 *       label      = the KNOWN ground truth for the seeded case.
 *       detects()  = the labelling oracle: did the inspector FLAG this case (return a non-clean verdict)?
 *   A seeded DEFECTIVE case the inspector flags  => TP (caught).   Not flagged => FN (missed — the dangerous failure).
 *   A CLEAN case the inspector flags             => FP (false alarm).  Not flagged => TN (correctly passed).
 * Fail-closed: a non-function inspector, zero cases, or ZERO seeded defects ⇒ invalid (NOT effective — nothing proven).
 * An inspector that throws on a case is treated as HAVING FLAGGED it (a crash is a detection signal, never a silent pass).
 */
function metaValidate(input: any): any {
  const o = isObj(input) ? input : {};
  const inspector = typeof o.inspector === "function" ? o.inspector : null;
  const cases = arr(o.cases).filter(isObj);
  const minDetection = typeof o.minDetection === "number" ? o.minDetection : 1.0;   // default: must catch ALL seeded defects
  if (!inspector) return Object.freeze({ valid: false, effective: false, reason: "no inspector function (fail-closed)", confusion: { TP: 0, FP: 0, TN: 0, FN: 0 }, missed: Object.freeze([]), falseAlarms: Object.freeze([]) });
  if (cases.length === 0) return Object.freeze({ valid: false, effective: false, reason: "empty battery — nothing measured is NOT a pass (fail-closed)", confusion: { TP: 0, FP: 0, TN: 0, FN: 0 }, missed: Object.freeze([]), falseAlarms: Object.freeze([]) });
  const defects = cases.filter((c) => c.label === "DEFECTIVE");
  if (defects.length === 0) return Object.freeze({ valid: false, effective: false, reason: "no seeded DEFECTIVE case — an inspector unproven against a known defect is NOT validated (fail-closed)", confusion: { TP: 0, FP: 0, TN: 0, FN: 0 }, missed: Object.freeze([]), falseAlarms: Object.freeze([]) });

  const confusion = { TP: 0, FP: 0, TN: 0, FN: 0 };
  const missed: any[] = [];       // seeded defects the inspector FAILED to flag — the false negatives that matter most
  const falseAlarms: any[] = [];  // clean cases the inspector wrongly flagged
  const perCase: any[] = [];
  for (const c of cases) {
    const detector = typeof c.detects === "function" ? c.detects : (() => false);
    let flagged: boolean;
    try { flagged = detector(inspector(c.input)) === true; } catch { flagged = true; }   // a throw = flagged (never a silent pass)
    const groundTruthDefective = c.label === "DEFECTIVE";
    let outcome: string;
    if (groundTruthDefective && flagged) { confusion.TP++; outcome = "TP"; }
    else if (groundTruthDefective && !flagged) { confusion.FN++; outcome = "FN"; missed.push(c.id); }
    else if (!groundTruthDefective && flagged) { confusion.FP++; outcome = "FP"; falseAlarms.push(c.id); }
    else { confusion.TN++; outcome = "TN"; }
    perCase.push({ id: c.id, label: c.label, flagged, outcome });
  }

  const seededDefects = confusion.TP + confusion.FN;
  const cleanCases = confusion.TN + confusion.FP;
  const detectionRate = round(confusion.TP / seededDefects);                               // recall on seeded defects
  const falseNegativeRate = round(confusion.FN / seededDefects);
  const falsePositiveRate = cleanCases > 0 ? round(confusion.FP / cleanCases) : 0;
  // EFFECTIVE (fail-closed): catches at least minDetection of seeded defects AND raises no false alarm.
  const effective = detectionRate >= minDetection && confusion.FP === 0;

  return Object.freeze({
    valid: true, effective,
    confusion: Object.freeze(confusion),
    detectionRate, falseNegativeRate, falsePositiveRate,
    seededDefects, cleanCases, minDetection,
    missed: Object.freeze(missed), falseAlarms: Object.freeze(falseAlarms),
    perCase: Object.freeze(perCase),
    reason: effective
      ? `inspector caught ${confusion.TP}/${seededDefects} seeded defect(s), 0 false alarm(s) ⇒ EFFECTIVE`
      : `inspector missed ${confusion.FN} seeded defect(s) [${missed.join(", ") || "-"}] and raised ${confusion.FP} false alarm(s) [${falseAlarms.join(", ") || "-"}] ⇒ INEFFECTIVE (a green suite that misses a known defect proves nothing)`,
    note: "the inspector is the system-under-test; a false NEGATIVE (missed seeded defect) is the dangerous failure; fail-closed on empty/defect-free batteries",
  });
}

/* metaValidateMany(inspectors) -> { results, allEffective, weakest }. inspectors: [{ name, ...metaValidate-input }]. */
function metaValidateMany(inspectors: any): any {
  const list = arr(inspectors).filter(isObj);
  const results = list.map((i) => ({ name: typeof i.name === "string" ? i.name : "?", ...metaValidate(i) }));
  const allEffective = results.length > 0 && results.every((r) => r.effective === true);
  // weakest = lowest detectionRate among valid runs (most likely to wave a real defect through).
  const valid = results.filter((r) => r.valid);
  const weakest = valid.length ? valid.slice().sort((a, b) => a.detectionRate - b.detectionRate)[0].name : null;
  return Object.freeze({ results: Object.freeze(results), allEffective, weakest, inspectorCount: results.length });
}

const INSPECTOR_META_VALIDATION_CONTRACT = Object.freeze({
  id: "V85-INSPECTOR-META-VALIDATION",
  source: "CTO V85 §6 — test the inspectors and the tests themselves (seed known defects; measure detection / false-negatives)",
  lineage: "lifts p6-mutation-testing (test-suite effectiveness) up to the INSPECTOR level; composes, no new engine",
  statuses: Object.freeze(["EFFECTIVE", "INEFFECTIVE", "INVALID"]),
  notAuthority: "scores an inspector against labelled cases; it decides no closure and creates no authorizer — ODG acts on the verdict",
  invariants: Object.freeze([
    "the INSPECTOR is the system-under-test; a seeded DEFECTIVE case it fails to flag is a FALSE NEGATIVE (the dangerous failure)",
    "EFFECTIVE requires detectionRate ≥ minDetection (default 1.0 — catch ALL seeded defects) AND zero false alarms",
    "fail-closed: no inspector / empty battery / ZERO seeded defects ⇒ INVALID (nothing measured is never a pass)",
    "a crash on a case counts as FLAGGED (a throw is a detection signal, never a silent pass)",
    "a fully green clean-only battery proves nothing — detection against a KNOWN defect is the proof",
    "pure/deterministic; no clock, no randomness",
  ]),
});

module.exports = { metaValidate, metaValidateMany, INSPECTOR_META_VALIDATION_CONTRACT };

if (require.main === module) {
  // demo: a blind inspector (always says CLEAN) vs a real one, over a 1-defect / 1-clean battery.
  const blind = metaValidate({ inspector: () => ({ status: "VALID" }), cases: [
    { id: "seeded-defect", label: "DEFECTIVE", input: {}, detects: (v: any) => v.status !== "VALID" },
    { id: "clean", label: "CLEAN", input: {}, detects: (v: any) => v.status !== "VALID" },
  ] });
  process.stdout.write(JSON.stringify({ ...INSPECTOR_META_VALIDATION_CONTRACT, demoBlindInspector: { effective: blind.effective, detectionRate: blind.detectionRate, missed: blind.missed } }, null, 2) + "\n");
}

export {};
