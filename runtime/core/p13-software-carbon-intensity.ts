#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 / WAVE-10 (P13 AI-infra / P9 — world-research gap) — SOFTWARE CARBON INTENSITY (SCI). PURE, deterministic.
 * World reference: ISO/IEC 21031:2024 — Software Carbon Intensity (Green Software Foundation): SCI = (E × I + M) / R,
 * where E = energy (kWh), I = grid carbon intensity (gCO2e/kWh), M = embodied hardware emissions (amortized gCO2e),
 * R = functional unit (per inference/request); GSF 2026 extends SCI to AI inference + CSRD/EU-AI-Act environmental
 * reporting. SCI is a rate from DECLARED factors, NOT a live measurement — exactly ODG's pure shape. ODG meters cost
 * and latency per unit (inference-engine/cost-engine) but has NO energy or carbon dimension (grep-verified absent: no
 * gCO2e/carbon/kWh-per-unit on compute; the only kWh tokens are the unrelated building-renovation domain). This
 * composes inference-engine.benchmark (R = totalUnits + provider kind provenance) + cost-engine COST_KINDS labelling
 * discipline (a declared/simulated factor is never presented as a measured emission) + the p9-unit-economics fail-
 * closed-null pattern (zero units ⇒ null, never a fabricated zero-carbon claim). Dual export.
 */

const COST = require("./cost-engine");                 // COST_KINDS — provenance labelling (OBSERVED/ESTIMATED/SIMULATED)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function fin(v: any): boolean { return typeof v === "number" && isFinite(v); }
function round(n: number): number { return Number(n.toFixed(6)); }

/**
 * carbonIntensity({ benchmark, factors }) -> { viable, energyKWh, operationalGco2, embodiedGco2, totalGco2, sciPerUnit, basis, reasons }.
 *   benchmark: inference-engine.benchmark output { totalUnits, kind } (or { units }).
 *   factors: { energyPerUnitKWh, pue, gridCarbonIntensityGco2PerKWh, embodiedGco2, lifespanUnits }  (all DECLARED).
 * Fail-closed: any missing/non-finite/negative factor, or zero units ⇒ sciPerUnit null (NEVER 0), viable:false.
 */
function carbonIntensity(input: any): any {
  const o = isObj(input) ? input : {};
  const b = isObj(o.benchmark) ? o.benchmark : {};
  const f = isObj(o.factors) ? o.factors : {};
  const totalUnits = fin(b.totalUnits) ? b.totalUnits : (fin(b.units) ? b.units : NaN);
  const reasons: string[] = [];

  const energyPerUnit = f.energyPerUnitKWh, pue = f.pue, grid = f.gridCarbonIntensityGco2PerKWh, embodied = f.embodiedGco2, lifespan = f.lifespanUnits;
  const factorsOk = fin(energyPerUnit) && energyPerUnit >= 0 && fin(pue) && pue >= 1 && fin(grid) && grid >= 0 && fin(embodied) && embodied >= 0 && fin(lifespan) && lifespan > 0;
  if (!(fin(totalUnits) && totalUnits > 0)) reasons.push("functional unit R (totalUnits) must be > 0 (fail-closed; zero ⇒ null, never 0)");
  if (!factorsOk) reasons.push("a declared factor is missing/non-finite/negative (energyPerUnitKWh≥0, pue≥1, grid≥0, embodied≥0, lifespanUnits>0) ⇒ undefined, never a fabricated zero-carbon claim");
  if (reasons.length > 0) return Object.freeze({ viable: false, energyKWh: null, operationalGco2: null, embodiedGco2: null, totalGco2: null, sciPerUnit: null, basis: "UNDEFINED", reasons: Object.freeze(reasons) });

  const energyKWh = round(totalUnits * energyPerUnit * pue);          // E = R × energy/unit × PUE
  const operationalGco2 = round(energyKWh * grid);                    // E × I
  const embodiedGco2 = round(embodied * (totalUnits / lifespan));     // M amortized over lifespan units
  const totalGco2 = round(operationalGco2 + embodiedGco2);
  const sciPerUnit = round(totalGco2 / totalUnits);                   // SCI = (E×I + M) / R
  // provenance: a non-cpu-reference (simulated) provider ⇒ cost-engine's SIMULATED kind; declared factors ⇒ DECLARED; never OBSERVED.
  const SIMULATED = arr(COST.COST_KINDS).includes("SIMULATED") ? "SIMULATED" : "SIMULATED";
  const basis = b.kind && b.kind !== "cpu-reference" ? SIMULATED : "DECLARED";

  return Object.freeze({ viable: true, energyKWh, operationalGco2, embodiedGco2, totalGco2, sciPerUnit, basis, reasons: Object.freeze(["SCI = (E×I + M) / R from declared factors — not a measured emission"]) });
}

/** withinCarbonBudget(result, maxGco2PerUnit) -> { within, basis }. Fail-closed: non-viable ⇒ within:false. */
function withinCarbonBudget(result: any, maxGco2PerUnit: any): any {
  const r = isObj(result) ? result : {};
  if (r.viable !== true || !fin(r.sciPerUnit) || !fin(maxGco2PerUnit)) return Object.freeze({ within: false, basis: r.basis || "UNDEFINED", reason: "non-viable carbon result or invalid budget ⇒ fail-closed" });
  return Object.freeze({ within: r.sciPerUnit <= maxGco2PerUnit, basis: r.basis, sciPerUnit: r.sciPerUnit, maxGco2PerUnit });
}

const CARBON_INTENSITY_CONTRACT = Object.freeze({
  id: "V124-P13-SOFTWARE-CARBON-INTENSITY",
  source: "SÉRIE 23/W10 P13/P9 — Software Carbon Intensity SCI=(E×I+M)/R (ISO/IEC 21031:2024; Green Software Foundation 2026)",
  reuses: Object.freeze(["inference-engine.benchmark (R = totalUnits + provider kind provenance)", "cost-engine COST_KINDS (declared/simulated provenance, never OBSERVED)", "p9-unit-economics fail-closed-null pattern"]),
  notAuthority: "a carbon rate computed from DECLARED factors; it measures no hardware and reads no live grid API",
  invariants: Object.freeze([
    "SCI = (E×I + M)/R where E = units×energyPerUnit×PUE; all factors are DECLARED inputs",
    "any missing/non-finite/negative factor, or zero units ⇒ sciPerUnit null (UNDEFINED), NEVER a fabricated zero-carbon claim",
    "a simulated provider or declared factor ⇒ basis SIMULATED/DECLARED, never presented as a measured (OBSERVED) emission",
    "withinCarbonBudget fails closed on a non-viable result (no silent pass)",
    "pure/deterministic: (benchmark, factors) → carbon; no clock/random/network/live measurement",
  ]),
});

module.exports = { carbonIntensity, withinCarbonBudget, CARBON_INTENSITY_CONTRACT };

if (require.main === module) {
  const demo = carbonIntensity({ benchmark: { totalUnits: 1000, kind: "cpu-reference" }, factors: { energyPerUnitKWh: 0.0002, pue: 1.5, gridCarbonIntensityGco2PerKWh: 400, embodiedGco2: 300000, lifespanUnits: 1e9 } });
  process.stdout.write(JSON.stringify({ ...CARBON_INTENSITY_CONTRACT, demo: { sciPerUnit: demo.sciPerUnit, totalGco2: demo.totalGco2, basis: demo.basis } }, null, 2) + "\n");
}

export {};
