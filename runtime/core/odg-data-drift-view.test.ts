#!/usr/bin/env node
"use strict";
/* Tests for odg-data-drift-view (composes PSI + KS). PURE. Composes the REAL detectors (no mocks). */
const V = require("./odg-data-drift-view.js");
const PSI = require("./p4-distribution-drift.js");
const KS = require("./odg-ks-test.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // NO_DRIFT: identical ⇒ PSI NONE + KS NOT_DIFFERENT
  const same = V.assessDrift([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], {});
  check("identical ⇒ consensus NO_DRIFT (PSI NONE + KS NOT_DIFFERENT)", same.ok === true && same.consensus === "NO_DRIFT" && same.psi.drift === "NONE" && same.ks.verdict === "NOT_DIFFERENT");

  // CONFIRMED_DRIFT: disjoint large samples ⇒ PSI SIGNIFICANT + KS DIFFERENT
  const ref = Array.from({ length: 20 }, (_, i) => i + 1);
  const cur = Array.from({ length: 20 }, (_, i) => i + 21);
  const conf = V.assessDrift(ref, cur, {});
  check("disjoint ⇒ CONFIRMED_DRIFT (both detect)", conf.consensus === "CONFIRMED_DRIFT" && conf.drift === "DRIFT_DETECTED" && conf.detectedBy.psi === true && conf.detectedBy.ks === true);

  // fidelity: the view's sub-results equal the standalone detectors
  check("PSI fidelity vs standalone", conf.psi.drift === PSI.psi(ref, cur).drift);
  check("KS fidelity vs standalone", conf.ks.verdict === KS.ksTwoSample(ref, cur, { alpha: 0.05 }).verdict);

  // DISAGREEMENT (real + surfaced): small sample where PSI flags but KS is underpowered
  // ref=[1,1,2,2,3] cur=[1,2,3,3,3]: PSI≈0.72 SIGNIFICANT; KS D=0.4 p>0.05 NOT_DIFFERENT (n=5)
  const dis = V.assessDrift([1, 1, 2, 2, 3], [1, 2, 3, 3, 3], {});
  check("small-sample shift ⇒ DISAGREEMENT (PSI drift, KS not), drift null (inconclusive)", dis.consensus === "DISAGREEMENT" && dis.drift === null && dis.detectedBy.psi === true && dis.detectedBy.ks === false);
  check("DISAGREEMENT surfaces both sub-results (PSI SIGNIFICANT, KS NOT_DIFFERENT smallSample)", dis.psi.drift === "SIGNIFICANT" && dis.ks.verdict === "NOT_DIFFERENT" && dis.ks.smallSample === true);

  // PSI_ONLY: non-numeric (categorical) data ⇒ KS NOT_MEASURED, PSI still runs
  const cat = V.assessDrift(["a", "a", "b"], ["a", "b", "b"], {});
  check("categorical data ⇒ consensus PSI_ONLY, KS NOT_MEASURED", cat.consensus === "PSI_ONLY" && cat.ks.measured === false && cat.detectedBy.ks === null);
  check("PSI_ONLY still reports a PSI drift class", ["NONE", "MODERATE", "SIGNIFICANT"].indexOf(cat.psi.drift) >= 0);

  // alpha override flows to KS
  check("alpha override reaches KS (0.5 ⇒ easier to call DIFFERENT than 0.001)", (() => {
    const strict = V.assessDrift([1, 1, 2, 2, 3], [1, 2, 3, 3, 3], { alpha: 0.001 });
    const loose = V.assessDrift([1, 1, 2, 2, 3], [1, 2, 3, 3, 3], { alpha: 0.9 });
    return loose.ks.verdict === "DIFFERENT" && strict.ks.verdict === "NOT_DIFFERENT";
  })());

  // fail-closed
  check("empty reference ⇒ NO_DATA", V.assessDrift([], [1, 2], {}).code === "NO_DATA");
  check("non-array ⇒ NO_DATA", V.assessDrift("x", [1, 2], {}).code === "NO_DATA");

  // honesty + determinism + frozen + contract
  check("note: complementary, disagreement surfaced, detection not verdict", /COMPLEMENTARY/.test(conf.note) && /DISAGREE/.test(conf.note) && /NOT a verdict/.test(conf.note));
  check("deterministic", JSON.stringify(V.assessDrift(ref, cur, {})) === JSON.stringify(conf));
  check("frozen", Object.isFrozen(conf) && Object.isFrozen(conf.psi) && Object.isFrozen(conf.ks) && Object.isFrozen(conf.detectedBy));
  check("contract: composes-modifies-neither, disagreement-not-resolved, psi-only-fallback, detection-not-verdict",
    V.DATA_DRIFT_VIEW_CONTRACT.invariants.some((s: string) => /MODIFIES NEITHER/.test(s)) &&
    V.DATA_DRIFT_VIEW_CONTRACT.invariants.some((s: string) => /never resolved by fiat/.test(s)) &&
    V.DATA_DRIFT_VIEW_CONTRACT.invariants.some((s: string) => /PSI_ONLY/.test(s)) &&
    V.DATA_DRIFT_VIEW_CONTRACT.invariants.some((s: string) => /NOT a verdict/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-data-drift-view (composes REAL PSI + KS, modifies neither; identical⇒NO_DRIFT, disjoint⇒CONFIRMED_DRIFT, small-sample shift⇒DISAGREEMENT [drift null, surfaced], categorical⇒PSI_ONLY [KS NOT_MEASURED]; fidelity vs standalone; alpha flows through; empty⇒NO_DATA; deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
