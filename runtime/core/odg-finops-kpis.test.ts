#!/usr/bin/env node
"use strict";
/* IMP-P9-FINOPS-KPIS — KPIs from supplied data; estimated≠realized; fail-closed; maturity self-rating with method. */
const F = require("./odg-finops-kpis.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const m = F.finopsKpis({ spend: 1000, allocatedSpend: 900, forecastSpend: 1100, actualSpend: 1000, wasteSpend: 100, commitmentCoveredSpend: 700, taggedResources: 80, totalResources: 100 });
  check("allocation/tagging/waste/commitment coverage measured from data", m.kpis.allocationCoverage.value === 0.9 && m.kpis.taggingCoverage.value === 0.8 && m.kpis.wasteRatio.value === 0.1 && m.kpis.commitmentCoverage.value === 0.7);
  check("forecast accuracy from DECLARED forecast + actual (estimated≠realized)", m.kpis.forecastAccuracy.status === "MEASURED" && m.kpis.forecastAccuracy.value === 0.9 && /estimated.*realized|never conflated/.test(m.kpis.forecastAccuracy.basis));
  check("maturity self-rating with explicit method (5 measured ⇒ level 4)", m.maturity.level === 4 && m.maturity.measuredKpis === 5 && /self-rating/.test(m.maturity.method));

  // fail-closed: no data ⇒ NOT_MEASURED + low maturity
  const empty = F.finopsKpis({});
  check("no data ⇒ all KPIs NOT_MEASURED, maturity level 1 (crawl)", empty.measuredKpiCount === 0 && empty.maturity.level === 1 && Object.values(empty.kpis).every((k: any) => k.status === "NOT_MEASURED"));
  check("forecast WITHOUT actual ⇒ NOT_MEASURED (a forecast alone is not accuracy)", F.finopsKpis({ forecastSpend: 1100 }).kpis.forecastAccuracy.status === "NOT_MEASURED");

  check("contract + honesty (estimated≠realized, self-rating not certification)", F.FINOPS_KPIS_CONTRACT.invariants.some((i: string) => /estimated≠realized preserved/.test(i)) && /not an external certification/i.test(m.honesty));
  check("deterministic", JSON.stringify(F.finopsKpis({}).maturity) === JSON.stringify(empty.maturity));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — finops-kpis (IMP-P9: KPI set from supplied data; forecast accuracy keeps estimated≠realized; no-data ⇒ NOT_MEASURED; maturity self-rating with method)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
