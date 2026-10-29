#!/usr/bin/env node
/**
 * independent-label-policy — the admission gate for an INDEPENDENTLY-LABELLED broad-IT evaluation set. It encodes, in
 * code, the rule that a credible VERIFIED broad-IT success rate requires ground-truth labels whose provenance is
 * independent of the evaluated system (ODG) — ODG must NOT certify its own labels. It FABRICATES nothing and asserts
 * nothing about any specific external set; it only decides whether a supplied provenance descriptor qualifies as
 * independent, and (fail-closed) refuses everything that does not.
 *
 * This is the prepared ingestion gate for the P1 broad-IT frontier: until a descriptor passes assessLabelIndependence,
 * the corpus stays self-authored ⇒ broadIT = NO_DATA. No tenth primitive; pure/deterministic.
 */
"use strict";

// A label-provenance descriptor. All fields must be positively satisfied for independence (deny-by-default).
//   author:                who produced the ground-truth labels (e.g. "odg", "third-party:acme", "upstream-ci")
//   independentOfEvaluee:  true iff the labeller is NOT ODG and has no stake in ODG's score
//   sourceRef:             a traceable provenance reference (URL / dataset id / commit) — required
//   devValidationSeparated:true iff development and validation partitions are disjoint and the validation labels
//                          were NOT visible during any ODG tuning
//   labellingMethod:       how labels were produced (e.g. "upstream-test-suite", "human-third-party", "historical-outcome")
const EVALUEE = "odg";
const SELF_AUTHORS = ["odg", "self", "self-authored", "odg-authored"];

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/**
 * assessLabelIndependence(provenance): deny-by-default. Returns { independent, reasons[] }. independent ONLY if the
 * labeller is not the evaluee, explicitly flagged independent, carries a traceable sourceRef, keeps dev/validation
 * separated, and names a labelling method that is not self-grading.
 */
function assessLabelIndependence(provenance: any): any {
  const reasons: string[] = [];
  if (!isObj(provenance)) return { independent: false, reasons: ["no provenance descriptor"] };
  const author = String(provenance.author || "").trim().toLowerCase();
  if (!nonEmptyStr(author)) reasons.push("missing label author");
  if (SELF_AUTHORS.includes(author) || author === EVALUEE || author.startsWith(EVALUEE + ":")) reasons.push(`labels authored by the evaluee (${provenance.author}) — self-certification not allowed`);
  if (provenance.independentOfEvaluee !== true) reasons.push("independentOfEvaluee not positively true");
  if (!nonEmptyStr(provenance.sourceRef)) reasons.push("missing traceable sourceRef (provenance)");
  if (provenance.devValidationSeparated !== true) reasons.push("dev/validation separation not positively asserted");
  if (!nonEmptyStr(provenance.labellingMethod)) reasons.push("missing labellingMethod");
  if (nonEmptyStr(provenance.labellingMethod) && /self|odg|own/i.test(String(provenance.labellingMethod))) reasons.push("labellingMethod appears self-graded");
  return { independent: reasons.length === 0, reasons };
}

/**
 * admitEvalSet({ provenance, devIds, validationIds }): a prepared admission check for a candidate external eval set.
 * Fail-closed: requires independent provenance AND a non-empty, DISJOINT dev/validation id split (no leakage). Returns
 * { admitted, reasons[] }. ODG runs this on a SUPPLIED external set; it never fabricates one.
 */
function admitEvalSet(input: any = {}): any {
  const reasons: string[] = [];
  const ind = assessLabelIndependence(input.provenance);
  if (!ind.independent) reasons.push(...ind.reasons);
  const dev = Array.isArray(input.devIds) ? input.devIds : null;
  const val = Array.isArray(input.validationIds) ? input.validationIds : null;
  if (!dev || !val || dev.length === 0 || val.length === 0) reasons.push("dev and validation id sets must both be non-empty");
  else {
    const devSet = new Set(dev);
    const overlap = val.filter((id: any) => devSet.has(id));
    if (overlap.length) reasons.push(`dev/validation id overlap (leakage): [${overlap.slice(0, 5).join(", ")}]`);
  }
  return { admitted: reasons.length === 0, reasons };
}

export { SELF_AUTHORS, assessLabelIndependence, admitEvalSet };
module.exports = { SELF_AUTHORS, assessLabelIndependence, admitEvalSet };

if (require.main === module) {
  // the CURRENT corpus provenance (ODG self-authored) ⇒ not independent ⇒ broad-IT stays NO_DATA.
  const current = { author: "odg", independentOfEvaluee: false, sourceRef: "", devValidationSeparated: true, labellingMethod: "odg-authored" };
  process.stdout.write(JSON.stringify({ current: assessLabelIndependence(current) }, null, 2) + "\n");
}
