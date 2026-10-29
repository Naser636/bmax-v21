#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the ingestion+measurement harness for the broad-it-independent-eval-set
// blocker: a self-authored/ODG-labelled set is NOT admitted (broad-IT NO_DATA, fail-closed); an INDEPENDENT admitted
// set yields a MEASURED rate from the REAL checker vs EXTERNAL labels (labels not trusted blindly — a wrong label
// surfaces as a confusion error); dev/validation leakage is rejected. NOTE: the "independent" descriptor here is a
// TEST FIXTURE that simulates a third-party set to exercise the mechanism — a REAL broad-IT measurement still requires
// a genuinely independent third-party-labelled set (owner-supplied). The JavaScript checker is real (node present).
"use strict";
const assert = require("assert");
const I = require("./broad-it-eval-ingest.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// a genuinely-independent-LOOKING provenance (fixture) — author != ODG, separated, traceable, expert-labelled.
const indepProv = { author: "acme-labs", independentOfEvaluee: true, sourceRef: "https://example.org/datasets/code-eval-v1", devValidationSeparated: true, labellingMethod: "manual-expert-annotation" };
const jsOk = "const a = 1; module.exports = a;\n";
const jsBad = "const a = ;\n";

// (1) SELF-AUTHORED provenance ⇒ NOT admitted ⇒ NO_DATA (fail-closed, no self-certification).
{
  const r = I.measureOnEvalSet({ provenance: { author: "ODG", independentOfEvaluee: false, sourceRef: "x", devValidationSeparated: true, labellingMethod: "self" }, cases: [{ id: "v1", partition: "validation", language: "JavaScript", content: jsOk, label: "PASS" }] });
  ok("self-authored eval set ⇒ NOT admitted, broad-IT NO_DATA", r.ok && r.admitted === false && r.broadIT === "NO_DATA" && r.reasons.length > 0);
}
// (2) INDEPENDENT admitted set ⇒ MEASURED rate from the REAL checker vs external labels.
{
  const r = I.measureOnEvalSet({ provenance: indepProv, cases: [
    { id: "d1", partition: "dev", language: "JavaScript", content: jsOk, label: "PASS" },
    { id: "v1", partition: "validation", language: "JavaScript", content: jsOk, label: "PASS" },
    { id: "v2", partition: "validation", language: "JavaScript", content: jsBad, label: "FAIL" },
  ] });
  ok("independent admitted set ⇒ MEASURED, n=2, accuracy 1.0 (real checker agrees with correct labels)",
     r.admitted === true && r.broadIT === "MEASURED" && r.n === 2 && r.accuracy === 1 && r.confusion.truePass === 1 && r.confusion.trueFail === 1);
}
// (3) labels NOT trusted blindly: a WRONG external label surfaces as a confusion error (real checker overrides).
{
  const r = I.measureOnEvalSet({ provenance: indepProv, cases: [
    { id: "d1", partition: "dev", language: "JavaScript", content: jsOk, label: "PASS" },
    { id: "v1", partition: "validation", language: "JavaScript", content: jsOk, label: "FAIL" },   // WRONG label: clean code labelled FAIL
  ] });
  ok("wrong label ⇒ falsePass (checker PASS vs label FAIL), accuracy < 1 (labels not trusted blindly)",
     r.admitted === true && r.n === 1 && r.accuracy === 0 && r.confusion.falsePass === 1);
}
// (4) dev/validation id OVERLAP (leakage) ⇒ NOT admitted.
{
  const r = I.measureOnEvalSet({ provenance: indepProv, cases: [
    { id: "x1", partition: "dev", language: "JavaScript", content: jsOk, label: "PASS" },
    { id: "x1", partition: "validation", language: "JavaScript", content: jsOk, label: "PASS" },
  ] });
  ok("dev/validation id overlap ⇒ NOT admitted (leakage)", r.admitted === false && r.reasons.some((x) => /overlap|leakage/i.test(x)));
}
// (5) admitted but no scorable validation case (unsupported language) ⇒ NO_DATA, not guessed.
{
  const r = I.measureOnEvalSet({ provenance: indepProv, cases: [
    { id: "d1", partition: "dev", language: "JavaScript", content: jsOk, label: "PASS" },
    { id: "v1", partition: "validation", language: "COBOL", content: "x", label: "PASS" },
  ] });
  ok("admitted + only unsupported validation cases ⇒ NO_DATA (excluded, not guessed)", r.admitted === true && r.broadIT === "NO_DATA" && r.n === 0 && r.confusion.excluded === 1);
}
// (6) fail-closed on bad input.
{
  ok("non-object / missing cases ⇒ INVALID_INPUT", I.measureOnEvalSet({}).code === "INVALID_INPUT" && I.measureOnEvalSet(null).ok === false);
}

console.log(`\nBROAD-IT-EVAL-INGEST suite — ${pass} assertions passed. (self-authored⇒NO_DATA; independent⇒MEASURED via real checker; labels-not-trusted-blindly; leakage rejected; unsupported excluded; fail-closed)`);
