#!/usr/bin/env node
"use strict";
/* Tests for odg-eval-statistics-index (consumer/index for the eval measurement-integrity toolkit). PURE. Loads the REAL modules. */
const IX = require("./odg-eval-statistics-index.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  const idx = IX.buildIndex();
  check("ok, 10 modules registered", idx.ok === true && idx.total === 10);

  // EVERY registered module loads AND exposes a frozen *_CONTRACT (resolves the orphan/0-consumer gap)
  check("all 10 modules loaded + contract-bearing", idx.loaded === 10 && idx.modules.every((m: any) => m.loaded === true && m.hasContract === true && typeof m.contractId === "string"));
  check("no load errors", idx.modules.every((m: any) => m.loadError === null));

  // each module exposes its real functions (discoverability)
  check("modules expose functions", idx.modules.every((m: any) => Array.isArray(m.exports) && m.exports.length > 0));

  // categorisation covers the five measurement concerns
  check("categories = AGREEMENT/CLASSIFICATION_QUALITY/CAPABILITY/SIGNIFICANCE/DRIFT", ["AGREEMENT", "CLASSIFICATION_QUALITY", "CAPABILITY", "SIGNIFICANCE", "DRIFT"].every((c) => Array.isArray(idx.byCategory[c]) && idx.byCategory[c].length > 0));
  check("AGREEMENT has κ + rank-corr + bland-altman + scorecard", idx.byCategory.AGREEMENT.length === 4 && idx.byCategory.AGREEMENT.indexOf("odg-inter-rater-agreement") >= 0 && idx.byCategory.AGREEMENT.indexOf("odg-bland-altman") >= 0);
  check("SIGNIFICANCE has eval-significance + multiple-testing", idx.byCategory.SIGNIFICANCE.indexOf("eval-significance") >= 0 && idx.byCategory.SIGNIFICANCE.indexOf("odg-multiple-testing-correction") >= 0);
  check("DRIFT has ks-test + data-drift-view", idx.byCategory.DRIFT.indexOf("odg-ks-test") >= 0 && idx.byCategory.DRIFT.indexOf("odg-data-drift-view") >= 0);

  // real contract IDs surfaced (spot-check a couple)
  const byName = (n: string) => idx.modules.find((m: any) => m.name === n);
  check("contractId surfaced correctly (MCC metrics, pass@k)", byName("odg-binary-classification-metrics").contractId === "P6-BINARY-CLASSIFICATION-METRICS" && byName("odg-passk-estimator").contractId === "P2-PASSK-ESTIMATOR");

  // honesty reminders present (the cluster's cross-cutting disciplines)
  check("honesty reminders: agreement≠accuracy, agreement≠correlation, FWER≠FDR, pass@k≠pass^k", idx.honesty.some((h: string) => /AGREEMENT ≠ ACCURACY/.test(h)) && idx.honesty.some((h: string) => /≠ CORRELATION/.test(h)) && idx.honesty.some((h: string) => /FWER ≠ FDR/.test(h)) && idx.honesty.some((h: string) => /pass@k.*≠.*pass\^k/.test(h)));

  // pickFor routing
  const agr = IX.pickFor("AGREEMENT");
  check("pickFor(AGREEMENT) ⇒ 4 modules with pickWhen + contractId", agr.ok === true && agr.modules.length === 4 && agr.modules.every((m: any) => typeof m.pickWhen === "string" && typeof m.contractId === "string"));
  check("pickFor(DRIFT) ⇒ ks + data-drift-view", (() => { const d = IX.pickFor("DRIFT"); return d.ok && d.modules.map((m: any) => m.name).sort().join(",") === "odg-data-drift-view,odg-ks-test"; })());
  check("pickFor(unknown) ⇒ UNKNOWN_CONCERN", IX.pickFor("NONSENSE").code === "UNKNOWN_CONCERN");

  // READ-ONLY: index exposes no measurement functions of its own (only buildIndex/pickFor) — executes nothing against data
  check("index is read-only (only buildIndex/pickFor exported, no statistic)", typeof IX.buildIndex === "function" && typeof IX.pickFor === "function" && IX.REGISTRY.length === 10);

  // note + determinism + frozen + contract
  check("note: consumer for orphan modules, READ-ONLY, no measurement claim", /missing CONSUMER/.test(idx.note) && /READ-ONLY/.test(idx.note) && /makes no measurement claim/.test(idx.note));
  check("deterministic", JSON.stringify(IX.buildIndex()) === JSON.stringify(idx));
  check("frozen", Object.isFrozen(idx) && Object.isFrozen(idx.modules) && Object.isFrozen(idx.byCategory) && Object.isFrozen(idx.honesty));
  check("contract: index-not-statistic, read-only, routing-aid-not-verdict",
    IX.EVAL_STATISTICS_INDEX_CONTRACT.invariants.some((s: string) => /NOT a new statistic/.test(s)) &&
    IX.EVAL_STATISTICS_INDEX_CONTRACT.invariants.some((s: string) => /READ-ONLY/.test(s)) &&
    IX.EVAL_STATISTICS_INDEX_CONTRACT.invariants.some((s: string) => /routing AID, not a verdict/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-eval-statistics-index (consumer/index for 10 eval measurement-integrity modules: all loaded + contract-bearing [resolves orphan/0-consumer gap]; grouped AGREEMENT/CLASSIFICATION_QUALITY/CAPABILITY/SIGNIFICANCE/DRIFT; pickFor routing; cross-cutting honesty reminders; READ-ONLY executes nothing; deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
