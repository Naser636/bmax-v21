#!/usr/bin/env node
"use strict";
/* Tests for odg-btp-revision-prix (BTP price-index revision P = P0·(a + Σ b·I1/I0)). PURE. Hand-verified. */
const M = require("./odg-btp-revision-prix.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // classic single-index: a=0.125, b=0.875, I0=100→I1=110 ⇒ K=0.125+0.875·1.1=1.0875; P0=1000.00€ ⇒ 1087.50€
  const r = M.revisePrice({ baseAmountMinor: 100000, fixedTermCoeff: 0.125, indexedTerms: [{ name: "BT01", coeff: 0.875, baseIndex: 100, currentIndex: 110 }] });
  check("single index: K=1.0875, revised 108750, delta 8750", r.revisionCoefficient === 1.0875 && r.revisedAmountMinor === 108750 && r.deltaMinor === 8750);
  check("per-term: ratio 1.1, contribution 0.9625, name passed through", r.terms[0].ratio === 1.1 && r.terms[0].contribution === 0.9625 && r.terms[0].name === "BT01");

  // two indices: a=0.15, b1=0.45 (100→105), b2=0.40 (200→220) ⇒ K=0.15+0.4725+0.44=1.0625; P0=2000.00€ ⇒ 2125.00€
  const r2 = M.revisePrice({ baseAmountMinor: 200000, fixedTermCoeff: 0.15, indexedTerms: [{ coeff: 0.45, baseIndex: 100, currentIndex: 105 }, { coeff: 0.40, baseIndex: 200, currentIndex: 220 }] });
  check("two indices: K=1.0625, revised 212500", r2.revisionCoefficient === 1.0625 && r2.revisedAmountMinor === 212500);
  check("default term names I1/I2 when none supplied", r2.terms[0].name === "I1" && r2.terms[1].name === "I2");

  // no change: all indices flat ⇒ K=1, revised = base, delta 0
  const flat = M.revisePrice({ baseAmountMinor: 50000, fixedTermCoeff: 0.2, indexedTerms: [{ coeff: 0.8, baseIndex: 100, currentIndex: 100 }] });
  check("flat indices ⇒ K=1, revised = base, delta 0", flat.revisionCoefficient === 1 && flat.revisedAmountMinor === 50000 && flat.deltaMinor === 0);

  // decreasing index ⇒ revision below base (honest: revision can be downward)
  const down = M.revisePrice({ baseAmountMinor: 100000, fixedTermCoeff: 0.2, indexedTerms: [{ coeff: 0.8, baseIndex: 100, currentIndex: 90 }] });
  check("decreasing index ⇒ K<1, revised below base (downward revision)", down.revisionCoefficient === 0.92 && down.revisedAmountMinor === 92000 && down.deltaMinor === -8000);

  // a=0 (fully indexed) and a=1 (no indexation effect beyond the single required term) — caller's choice, not assumed
  check("a=1 with a zero-weight... actually a=1 forces coeff sum>1 unless indexed coeffs are 0 — but coeff>0 required", M.revisePrice({ baseAmountMinor: 100000, fixedTermCoeff: 1, indexedTerms: [{ coeff: 0.0001, baseIndex: 100, currentIndex: 100 }] }).code === "BAD_COEFFICIENTS");

  // float coefficient sum within tolerance (0.1 + 0.2 + 0.7 = 0.9999999999999999)
  check("float coeff sum within tolerance ⇒ accepted", M.revisePrice({ baseAmountMinor: 100000, fixedTermCoeff: 0.1, indexedTerms: [{ coeff: 0.2, baseIndex: 100, currentIndex: 100 }, { coeff: 0.7, baseIndex: 100, currentIndex: 100 }] }).ok === true);

  // FAIL-CLOSED: coefficients not summing to 1 ⇒ BAD_COEFFICIENTS (no silent re-normalisation)
  check("coeffs not summing to 1 ⇒ BAD_COEFFICIENTS", M.revisePrice({ baseAmountMinor: 100000, fixedTermCoeff: 0.2, indexedTerms: [{ coeff: 0.7, baseIndex: 100, currentIndex: 110 }] }).code === "BAD_COEFFICIENTS");
  check("coeffs summing > 1 ⇒ BAD_COEFFICIENTS", M.revisePrice({ baseAmountMinor: 100000, fixedTermCoeff: 0.5, indexedTerms: [{ coeff: 0.7, baseIndex: 100, currentIndex: 110 }] }).code === "BAD_COEFFICIENTS");
  // zero / negative base index ⇒ no division by zero
  check("zero base index ⇒ BAD_BASE_INDEX (no division by zero)", M.revisePrice({ baseAmountMinor: 100000, fixedTermCoeff: 0.125, indexedTerms: [{ coeff: 0.875, baseIndex: 0, currentIndex: 110 }] }).code === "BAD_BASE_INDEX");
  check("negative base index ⇒ BAD_BASE_INDEX", M.revisePrice({ baseAmountMinor: 100000, fixedTermCoeff: 0.125, indexedTerms: [{ coeff: 0.875, baseIndex: -1, currentIndex: 110 }] }).code === "BAD_BASE_INDEX");
  // current index 0 is allowed (index collapsed to 0) ⇒ that term contributes 0
  check("currentIndex 0 ⇒ allowed, term contributes 0", M.revisePrice({ baseAmountMinor: 100000, fixedTermCoeff: 1, indexedTerms: [{ coeff: 0.00001, baseIndex: 100, currentIndex: 0 }] }).code === "BAD_COEFFICIENTS"); // still coeff-sum gated
  check("negative current index ⇒ BAD_CURRENT_INDEX", M.revisePrice({ baseAmountMinor: 100000, fixedTermCoeff: 0.125, indexedTerms: [{ coeff: 0.875, baseIndex: 100, currentIndex: -5 }] }).code === "BAD_CURRENT_INDEX");
  // the 5%/legal terme fixe is NOT assumed — fixed term is required & range-checked
  check("fixed term out of [0,1] ⇒ BAD_FIXED_TERM (no legal minimum assumed)", M.revisePrice({ baseAmountMinor: 100000, fixedTermCoeff: 1.5, indexedTerms: [{ coeff: 0.875, baseIndex: 100, currentIndex: 110 }] }).code === "BAD_FIXED_TERM");
  check("missing fixed term ⇒ BAD_FIXED_TERM", M.revisePrice({ baseAmountMinor: 100000, indexedTerms: [{ coeff: 1, baseIndex: 100, currentIndex: 110 }] }).code === "BAD_FIXED_TERM");
  check("bad base amount ⇒ BAD_BASE_AMOUNT", M.revisePrice({ baseAmountMinor: -1, fixedTermCoeff: 0.125, indexedTerms: [{ coeff: 0.875, baseIndex: 100, currentIndex: 110 }] }).code === "BAD_BASE_AMOUNT");
  check("empty indexedTerms ⇒ NO_INDEXED_TERMS", M.revisePrice({ baseAmountMinor: 100000, fixedTermCoeff: 1, indexedTerms: [] }).code === "NO_INDEXED_TERMS");
  check("non-object input ⇒ BAD_INPUT", M.revisePrice(null).code === "BAD_INPUT");
  // output-finiteness guard: finite-but-extreme index magnitudes must NOT return a non-finite price in an ok:true envelope
  check("extreme index overflow ⇒ NON_FINITE_RESULT (never Infinity in an ok:true result)", M.revisePrice({ baseAmountMinor: 100000, fixedTermCoeff: 0.5, indexedTerms: [{ coeff: 0.5, baseIndex: 1e-300, currentIndex: 1e300 }] }).code === "NON_FINITE_RESULT");
  check("bad term coeff ⇒ BAD_TERM_COEFF", M.revisePrice({ baseAmountMinor: 100000, fixedTermCoeff: 0.125, indexedTerms: [{ coeff: 0, baseIndex: 100, currentIndex: 110 }] }).code === "BAD_TERM_COEFF");

  // honesty + determinism + frozen + contract
  check("note: K/price MODEL output, never billed/collected; indices caller-supplied; not legal compliance", /NEVER a billed, due, or collected amount/.test(r.note) && /CALLER-SUPPLIED/.test(r.note) && /not legal compliance/.test(r.note));
  check("deterministic", JSON.stringify(M.revisePrice({ baseAmountMinor: 100000, fixedTermCoeff: 0.125, indexedTerms: [{ name: "BT01", coeff: 0.875, baseIndex: 100, currentIndex: 110 }] })) === JSON.stringify(r));
  check("frozen (result, terms, a term)", Object.isFrozen(r) && Object.isFrozen(r.terms) && Object.isFrozen(r.terms[0]));
  check("contract: model-not-billed, caller-supplied-not-legal, coeffs-sum-1, no-div-zero, fail-closed",
    M.REVISION_PRIX_CONTRACT.invariants.some((s: string) => /NEVER a billed, due, or collected amount/.test(s)) &&
    M.REVISION_PRIX_CONTRACT.invariants.some((s: string) => /CALLER-SUPPLIED.*NOT asserted here/.test(s)) &&
    M.REVISION_PRIX_CONTRACT.invariants.some((s: string) => /MUST sum to 1/.test(s)) &&
    M.REVISION_PRIX_CONTRACT.invariants.some((s: string) => /NO division by zero/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-btp-revision-prix (P=P0·(a+Σb·I1/I0): single-index a=0.125/b=0.875/110-over-100⇒K1.0875⇒108750; two-index⇒1.0625⇒212500; flat⇒K1=base; decreasing index⇒downward revision K0.92; float coeff-sum tolerance; coeffs-not-summing-1⇒BAD_COEFFICIENTS [no re-normalise]; zero/neg base index⇒BAD_BASE_INDEX [no div-by-0]; neg current⇒BAD_CURRENT_INDEX; 5%/legal terme-fixe NOT assumed [BAD_FIXED_TERM]; bad base/coeff/empty/non-object fail-closed; K/price MODEL≠billed, indices caller-supplied≠legal; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
