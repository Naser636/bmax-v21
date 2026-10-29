#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the independent-label admission gate is deny-by-default: self-authored/ODG labels
// are refused, a fully-independent traceable descriptor is admitted, and the eval-set admission also enforces a
// non-empty DISJOINT dev/validation split. This is the prepared gate that keeps broad-IT NO_DATA until a real
// independently-labelled set exists — and it CANNOT be satisfied by the evaluee certifying its own labels.
"use strict";
const assert = require("assert");
const P = require("./independent-label-policy.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const indep = { author: "third-party:acme-labs", independentOfEvaluee: true, sourceRef: "https://acme/labelset#v1", devValidationSeparated: true, labellingMethod: "human-third-party" };

// (1) the CURRENT corpus (ODG self-authored) is refused.
ok("odg self-authored ⇒ NOT independent", P.assessLabelIndependence({ author: "odg", independentOfEvaluee: false, sourceRef: "", devValidationSeparated: true, labellingMethod: "odg-authored" }).independent === false);
ok("author 'self-authored' ⇒ refused", P.assessLabelIndependence({ ...indep, author: "self-authored" }).independent === false);
ok("author 'odg:subteam' (evaluee namespace) ⇒ refused", P.assessLabelIndependence({ ...indep, author: "odg:subteam" }).independent === false);

// (2) a fully-independent, traceable descriptor is admitted.
ok("independent third-party + traceable + separated ⇒ independent", P.assessLabelIndependence(indep).independent === true);

// (3) each required field is load-bearing (deny-by-default).
ok("missing sourceRef ⇒ refused", P.assessLabelIndependence({ ...indep, sourceRef: "" }).independent === false);
ok("independentOfEvaluee not true ⇒ refused", P.assessLabelIndependence({ ...indep, independentOfEvaluee: false }).independent === false);
ok("dev/validation not separated ⇒ refused", P.assessLabelIndependence({ ...indep, devValidationSeparated: false }).independent === false);
ok("self-graded labellingMethod ⇒ refused", P.assessLabelIndependence({ ...indep, labellingMethod: "odg-own-check" }).independent === false);
ok("no descriptor ⇒ refused", P.assessLabelIndependence(null).independent === false);

// (4) admitEvalSet: independence AND a non-empty disjoint dev/validation split.
ok("admit: independent + disjoint split ⇒ admitted", P.admitEvalSet({ provenance: indep, devIds: ["d1", "d2"], validationIds: ["v1", "v2"] }).admitted === true);
ok("admit: dev/validation overlap ⇒ refused (leakage)", P.admitEvalSet({ provenance: indep, devIds: ["x"], validationIds: ["x"] }).admitted === false);
ok("admit: empty split ⇒ refused", P.admitEvalSet({ provenance: indep, devIds: [], validationIds: ["v"] }).admitted === false);
ok("admit: self-authored provenance ⇒ refused even with a clean split", P.admitEvalSet({ provenance: { author: "odg", independentOfEvaluee: false }, devIds: ["d"], validationIds: ["v"] }).admitted === false);

console.log(`\nINDEPENDENT-LABEL-POLICY suite — ${pass} assertions passed. (deny-by-default; no self-certification; traceable provenance + dev/validation separation required)`);
