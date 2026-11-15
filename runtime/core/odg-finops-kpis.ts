#!/usr/bin/env node
"use strict";
/*
 * IMP-P9-FINOPS-KPIS (V189-A contract, owner-authorized block) — P9 FinOps: a KPI set + maturity self-rating computed
 * ONLY from supplied cost data. PURE, deterministic. Fail-closed: a KPI with no underlying data is NOT_MEASURED.
 * estimated ≠ realized is preserved: forecast accuracy compares a declared forecast to a declared actual (both supplied).
 *
 * Acceptance (contract): KPIs computed from supplied data only; estimated≠realized preserved; maturity self-rating with method.
 */

function num(v: any): number | null { return typeof v === "number" && isFinite(v) ? v : null; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/* finopsKpis(data) -> KPI set + maturity. data = { spend, allocatedSpend, forecastSpend, actualSpend, wasteSpend,
 *   commitmentCoveredSpend, taggedResources, totalResources }. */
function finopsKpis(data: any): any {
  const d = data && typeof data === "object" ? data : {};
  const spend = num(d.spend), allocated = num(d.allocatedSpend), forecast = num(d.forecastSpend), actual = num(d.actualSpend), waste = num(d.wasteSpend), covered = num(d.commitmentCoveredSpend), tagged = num(d.taggedResources), totalRes = num(d.totalResources);

  const kpi = (value: number | null, reason: string, extra: any = {}) => value === null ? Object.freeze({ status: "NOT_MEASURED", reason, ...extra }) : Object.freeze({ status: "MEASURED", value: Number(value.toFixed(4)), ...extra });

  const allocationCoverage = (allocated !== null && spend !== null && spend > 0) ? kpi(allocated / spend, "") : kpi(null, "spend/allocatedSpend not supplied");
  const taggingCoverage = (tagged !== null && totalRes !== null && totalRes > 0) ? kpi(tagged / totalRes, "") : kpi(null, "taggedResources/totalResources not supplied");
  const wasteRatio = (waste !== null && spend !== null && spend > 0) ? kpi(waste / spend, "") : kpi(null, "wasteSpend/spend not supplied");
  const commitmentCoverage = (covered !== null && spend !== null && spend > 0) ? kpi(covered / spend, "") : kpi(null, "commitmentCoveredSpend/spend not supplied");
  // forecast accuracy = 1 - |forecast-actual|/actual. estimated≠realized: both must be supplied (a forecast alone is NOT accuracy).
  const forecastAccuracy = (forecast !== null && actual !== null && actual > 0)
    ? Object.freeze({ status: "MEASURED", value: Number((1 - Math.abs(forecast - actual) / actual).toFixed(4)), basis: "compares a DECLARED forecast (estimated) to a DECLARED actual (realized) — never conflated" })
    : kpi(null, "forecastSpend AND actualSpend both required (estimated≠realized)");

  const kpis = { allocationCoverage, taggingCoverage, wasteRatio, commitmentCoverage, forecastAccuracy };
  const measured = Object.values(kpis).filter((k: any) => k.status === "MEASURED").length;

  // maturity self-rating (CROUD-style 1..4) with an EXPLICIT method: rated on how many KPIs are actually measured.
  const maturity = Object.freeze({
    level: measured >= 5 ? 4 : measured >= 3 ? 3 : measured >= 1 ? 2 : 1,
    method: "self-rating = f(number of KPIs actually MEASURED from supplied data); 1=crawl(no data) → 4=run(all 5 measured). A self-rating is NOT an external assessment.",
    measuredKpis: measured,
  });

  return Object.freeze({
    metier: "P9", kpis: Object.freeze(kpis), measuredKpiCount: measured, maturity,
    honesty: "every KPI is computed ONLY from supplied cost data; absent data ⇒ NOT_MEASURED; forecast accuracy keeps estimated (forecast) and realized (actual) DISTINCT; the maturity level is a self-rating with a stated method, not an external certification.",
  });
}

const FINOPS_KPIS_CONTRACT = Object.freeze({
  id: "IMP-P9-FINOPS-KPIS",
  purpose: "P9 — FinOps KPI set + maturity self-rating from supplied data; estimated≠realized; fail-closed",
  invariants: Object.freeze([
    "every KPI computed ONLY from supplied data — no fabricated numbers; absent data ⇒ NOT_MEASURED",
    "forecast accuracy requires BOTH forecast (estimated) and actual (realized) — estimated≠realized preserved, never conflated",
    "maturity is a self-rating with an explicit stated method — NOT an external assessment/certification",
    "deterministic; read-only; no new engine",
  ]),
});

module.exports = { finopsKpis, FINOPS_KPIS_CONTRACT };
export {};
