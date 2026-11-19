#!/usr/bin/env node
"use strict";
/* Tests for odg-inter-rater-agreement (Cohen's & Fleiss' κ). PURE. Examples hand-computed from the definitions. */
const A = require("./odg-inter-rater-agreement.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // Cohen's κ — hand-computed: N=10, po=0.8, each rater 5×"1"/5×"0" ⇒ pe=0.5, κ=(0.8-0.5)/(1-0.5)=0.6
  const a = [1, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const b = [1, 1, 0, 0, 0, 1, 0, 1, 1, 0];
  const ck = A.cohenKappa(a, b);
  check("Cohen: po=0.8, pe=0.5, κ=0.6 (MODERATE)", ck.ok === true && ck.po === 0.8 && ck.pe === 0.5 && ck.kappa === 0.6 && ck.interpretation === "MODERATE" && ck.n === 10 && ck.agreement === 8);

  // perfect agreement with variability ⇒ κ=1 ALMOST_PERFECT
  check("Cohen: identical ratings (with variability) ⇒ κ=1 ALMOST_PERFECT", (() => { const r = A.cohenKappa(["Y", "N", "Y", "N"], ["Y", "N", "Y", "N"]); return r.kappa === 1 && r.interpretation === "ALMOST_PERFECT"; })());

  // no variability (both all same category) ⇒ pe=1 ⇒ κ UNDEFINED (null), NOT forced
  const nv = A.cohenKappa(["Y", "Y", "Y"], ["Y", "Y", "Y"]);
  check("Cohen: no variability ⇒ κ null UNDEFINED (po=1, pe=1), not forced", nv.ok === true && nv.kappa === null && nv.po === 1 && nv.pe === 1 && nv.interpretation === "UNDEFINED");

  // systematic disagreement ⇒ κ negative POOR
  check("Cohen: total disagreement (balanced) ⇒ κ<0 POOR", (() => { const r = A.cohenKappa(["Y", "N", "Y", "N"], ["N", "Y", "N", "Y"]); return r.kappa < 0 && r.interpretation === "POOR"; })());

  // chance-level agreement ⇒ κ≈0 SLIGHT
  check("Cohen: po==pe ⇒ κ=0", (() => { const r = A.cohenKappa(["Y", "Y", "N", "N"], ["Y", "N", "Y", "N"]); return r.kappa === 0; })());

  // Cohen fail-closed
  check("Cohen: length mismatch ⇒ LENGTH_MISMATCH", A.cohenKappa([1, 2], [1]).code === "LENGTH_MISMATCH");
  check("Cohen: <2 items ⇒ TOO_FEW_ITEMS", A.cohenKappa([1], [1]).code === "TOO_FEW_ITEMS");
  check("Cohen: non-array ⇒ NOT_ARRAYS", A.cohenKappa("x", [1]).code === "NOT_ARRAYS");
  check("Cohen: missing rating (null) ⇒ BAD_RATING (no imputation)", A.cohenKappa([1, null], [1, 0]).code === "BAD_RATING");

  // Fleiss' κ — hand-computed: 3 items × 3 raters, 2 cats.
  // items: all-agree / split / all-agree ⇒ P̄=7/9, P̄e=41/81, κ=22/40=0.55 (MODERATE)
  const fk = A.fleissKappa([["Y", "Y", "Y"], ["Y", "N", "Y"], ["N", "N", "N"]]);
  check("Fleiss: κ=0.55 (MODERATE), pBar=0.7778, pBarE=0.5062, 3 raters/3 items", fk.ok === true && fk.kappa === 0.55 && fk.pBar === 0.7778 && fk.pBarE === 0.5062 && fk.raters === 3 && fk.n === 3 && fk.interpretation === "MODERATE");

  // Fleiss perfect agreement (with variability across items) ⇒ κ=1
  check("Fleiss: perfect agreement per item (variable across items) ⇒ κ=1", (() => { const r = A.fleissKappa([["Y", "Y", "Y"], ["N", "N", "N"], ["Y", "Y", "Y"]]); return r.kappa === 1 && r.interpretation === "ALMOST_PERFECT"; })());

  // Fleiss no variability (all raters all items same cat) ⇒ κ UNDEFINED
  check("Fleiss: no variability ⇒ κ null UNDEFINED", A.fleissKappa([["Y", "Y"], ["Y", "Y"]]).kappa === null);

  // Fleiss fail-closed
  check("Fleiss: ragged rater counts ⇒ RAGGED_RATERS", A.fleissKappa([["Y", "N"], ["Y", "N", "Y"]]).code === "RAGGED_RATERS");
  check("Fleiss: <2 raters ⇒ TOO_FEW_RATERS", A.fleissKappa([["Y"], ["N"]]).code === "TOO_FEW_RATERS");
  check("Fleiss: <2 items ⇒ TOO_FEW_ITEMS", A.fleissKappa([["Y", "N"]]).code === "TOO_FEW_ITEMS");
  check("Fleiss: bad rating ⇒ BAD_RATING", A.fleissKappa([["Y", "N"], ["Y", {}]]).code === "BAD_RATING");

  // interpret bands (Landis & Koch)
  check("interpret bands", A.interpret(null) === "UNDEFINED" && A.interpret(-0.1) === "POOR" && A.interpret(0.2) === "SLIGHT" && A.interpret(0.4) === "FAIR" && A.interpret(0.6) === "MODERATE" && A.interpret(0.8) === "SUBSTANTIAL" && A.interpret(0.9) === "ALMOST_PERFECT");

  // honesty + determinism + frozen + contract
  check("note: beyond chance, NOT accuracy/ground-truth", /beyond CHANCE/i.test(ck.note) && /NOT accuracy/i.test(ck.note));
  check("deterministic", JSON.stringify(A.cohenKappa(a, b)) === JSON.stringify(ck));
  check("frozen", Object.isFrozen(ck) && Object.isFrozen(ck.categories) && Object.isFrozen(fk));
  check("contract: beyond-chance not accuracy, undefined-not-forced, no imputation, label-not-verdict",
    A.INTER_RATER_AGREEMENT_CONTRACT.invariants.some((s: string) => /BEYOND CHANCE/.test(s)) &&
    A.INTER_RATER_AGREEMENT_CONTRACT.invariants.some((s: string) => /UNDEFINED/.test(s)) &&
    A.INTER_RATER_AGREEMENT_CONTRACT.invariants.some((s: string) => /no imputation/.test(s)) &&
    A.INTER_RATER_AGREEMENT_CONTRACT.invariants.some((s: string) => /label, not a verdict/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-inter-rater-agreement (Cohen's κ=0.6 + Fleiss' κ=0.55 hand-verified; perfect⇒1, chance⇒0, disagreement⇒POOR; no-variability⇒UNDEFINED not forced; Landis-Koch labels; beyond-chance NOT accuracy; no imputation fail-closed; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
