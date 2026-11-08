#!/usr/bin/env node
"use strict";
const assert = require("assert");
const C = require("./p13-software-carbon-intensity");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23/W10 — SOFTWARE CARBON INTENSITY");
const factors = { energyPerUnitKWh: 0.0002, pue: 1.5, gridCarbonIntensityGco2PerKWh: 400, embodiedGco2: 300000, lifespanUnits: 1e9 };
// SCI = (E×I + M)/R computed from declared factors.
{
  const r = C.carbonIntensity({ benchmark: { totalUnits: 1000, kind: "cpu-reference" }, factors });
  // E = 1000*0.0002*1.5 = 0.3 kWh; operational = 0.3*400 = 120 gCO2e; M = 300000*(1000/1e9)=0.3; total=120.3; sci=0.1203
  check(r.viable === true && r.energyKWh === 0.3 && r.operationalGco2 === 120, "E and operational gCO2e computed correctly");
  check(Math.abs(r.sciPerUnit - 0.1203) < 1e-6, `sciPerUnit ≈ 0.1203 (got ${r.sciPerUnit})`);
  check(r.basis === "DECLARED", "cpu-reference + declared factors ⇒ basis DECLARED");
}
// simulated provider ⇒ basis SIMULATED (never OBSERVED).
check(C.carbonIntensity({ benchmark: { totalUnits: 1000, kind: "gpu-simulated" }, factors }).basis === "SIMULATED", "gpu-simulated ⇒ basis SIMULATED");
// fail-closed: missing factor ⇒ sciPerUnit null (never 0).
check(C.carbonIntensity({ benchmark: { totalUnits: 1000 }, factors: { energyPerUnitKWh: 0.0002 } }).sciPerUnit === null, "missing factors ⇒ sciPerUnit null (never 0)");
// fail-closed: zero units ⇒ null.
check(C.carbonIntensity({ benchmark: { totalUnits: 0 }, factors }).viable === false, "zero units ⇒ not viable (null, never 0)");
// negative factor ⇒ null.
check(C.carbonIntensity({ benchmark: { totalUnits: 10 }, factors: { ...factors, gridCarbonIntensityGco2PerKWh: -5 } }).sciPerUnit === null, "negative grid intensity ⇒ null");
// withinCarbonBudget fail-closed on non-viable.
check(C.withinCarbonBudget(C.carbonIntensity({ benchmark: {}, factors: {} }), 1).within === false, "non-viable ⇒ withinCarbonBudget false (fail-closed)");
{
  const r = C.carbonIntensity({ benchmark: { totalUnits: 1000, kind: "cpu-reference" }, factors });
  check(C.withinCarbonBudget(r, 0.2).within === true && C.withinCarbonBudget(r, 0.1).within === false, "withinCarbonBudget compares sciPerUnit to budget");
}
check(C.CARBON_INTENSITY_CONTRACT.invariants.some((i: any) => /NEVER a fabricated zero-carbon claim/.test(i)), "contract: never fabricated zero-carbon");
console.log(failures === 0 ? "ALL PASS — SÉRIE 23/W10 SOFTWARE CARBON INTENSITY" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
