#!/usr/bin/env node
"use strict";
/* Tests for odg-bland-altman (continuous-method agreement). PURE. Values hand-computed from the definitions. */
const BA = require("./odg-bland-altman.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // hand-computed: A=[10,20,30,40,50], B=[12,18,33,37,52] ⇒ d=[-2,2,-3,3,-2]; bias=-0.4; SD(n-1)=√7.3=2.701851;
  // loaUpper=-0.4+Z95·√7.3=4.895531; loaLower=-5.695531 (Z95=1.959963984540054); biasSE=2.701851/√5=1.208305
  const r = BA.blandAltman([10, 20, 30, 40, 50], [12, 18, 33, 37, 52], {});
  check("bias = -0.4 (mean of A−B)", r.bias === -0.4);
  check("sdDiff = 2.701851 (sample SD, n−1)", r.sdDiff === 2.701851);
  check("loaUpper = 4.895531 (bias + Z95·SD)", r.loaUpper === 4.895531);
  check("loaLower = -5.695531 (bias − Z95·SD)", r.loaLower === -5.695531);
  check("biasSE = 1.208305 (SD/√n)", r.biasSE === 1.208305);
  check("z = 1.96 default, n = 5", r.z === 1.959964 && r.n === 5);
  check("withinLoa: all 5 diffs within limits (proportion 1)", r.withinLoa.count === 5 && r.withinLoa.proportion === 1);

  // identical methods ⇒ bias 0, SD 0, limits both 0
  check("identical methods ⇒ bias 0, sdDiff 0, loa both 0", (() => { const x = BA.blandAltman([1, 2, 3, 4], [1, 2, 3, 4], {}); return x.bias === 0 && x.sdDiff === 0 && x.loaUpper === 0 && x.loaLower === 0; })());

  // SYSTEMATIC bias with perfect correlation: A = B+2 everywhere ⇒ correlation would be 1.0 but bias=2, SD=0 (the whole point)
  const sys = BA.blandAltman([12, 22, 32, 42], [10, 20, 30, 40], {});
  check("systematic +2 offset ⇒ bias 2, sdDiff 0 (correlation would miss this)", sys.bias === 2 && sys.sdDiff === 0 && sys.loaUpper === 2 && sys.loaLower === 2);

  // asymmetry: bias sign flips when methods swapped; SD identical
  const swapped = BA.blandAltman([12, 18, 33, 37, 52], [10, 20, 30, 40, 50], {});
  check("swapping A/B flips bias sign, SD unchanged", swapped.bias === 0.4 && swapped.sdDiff === r.sdDiff);

  // custom z (e.g. 90% ⇒ z≈1.645) narrows the limits vs 95%
  const z90 = BA.blandAltman([10, 20, 30, 40, 50], [12, 18, 33, 37, 52], { z: 1.645 });
  check("smaller z ⇒ narrower limits", z90.loaUpper < r.loaUpper && z90.loaLower > r.loaLower);

  // fail-closed
  check("length mismatch ⇒ LENGTH_MISMATCH", BA.blandAltman([1, 2, 3], [1, 2]).code === "LENGTH_MISMATCH");
  check("n<2 ⇒ TOO_FEW (SD undefined)", BA.blandAltman([1], [1]).code === "TOO_FEW");
  check("non-numeric ⇒ NOT_NUMERIC_ARRAYS", BA.blandAltman([1, "x"], [1, 2]).code === "NOT_NUMERIC_ARRAYS");
  check("NaN ⇒ NOT_NUMERIC_ARRAYS (no imputation)", BA.blandAltman([1, NaN], [1, 2]).code === "NOT_NUMERIC_ARRAYS");

  // honesty + determinism + frozen + contract
  check("note: agreement NOT correlation, descriptive not interchangeability, proportional bias not assessed", /NOT correlation/.test(r.note) && /not a verdict of interchangeability/.test(r.note) && /proportional bias NOT assessed/.test(r.note));
  check("deterministic", JSON.stringify(BA.blandAltman([10, 20, 30, 40, 50], [12, 18, 33, 37, 52], {})) === JSON.stringify(r));
  check("frozen", Object.isFrozen(r) && Object.isFrozen(r.withinLoa));
  check("contract: agreement-not-correlation, bias±z·SD, descriptive-not-interchangeable, proportional-bias-flagged, fail-closed",
    BA.BLAND_ALTMAN_CONTRACT.invariants.some((s: string) => /NOT correlation/.test(s)) &&
    BA.BLAND_ALTMAN_CONTRACT.invariants.some((s: string) => /bias ± z·SD/.test(s)) &&
    BA.BLAND_ALTMAN_CONTRACT.invariants.some((s: string) => /NOT a verdict of interchangeability/.test(s)) &&
    BA.BLAND_ALTMAN_CONTRACT.invariants.some((s: string) => /PROPORTIONAL bias is NOT assessed/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-bland-altman (continuous-method agreement, hand-verified: A/B⇒bias-0.4/SD2.701851/LoA[-5.695531,4.895531]; identical⇒0; systematic +2 offset⇒bias2/SD0 [correlation would miss]; swap flips bias sign; custom z narrows; mismatch/n<2/non-finite fail-closed; agreement≠correlation, descriptive-not-interchangeability; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
