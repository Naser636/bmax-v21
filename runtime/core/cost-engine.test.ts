#!/usr/bin/env node
"use strict";

/*
 * WI-P9-25 — cost-engine. Locks: estimate+kind, attribution (mission/métier/resource/unit), budget check,
 * alerts (over-budget sorted), anomaly detection, scenario comparison, kind discipline, determinism. Pure.
 * Run: node_modules/.bin/tsx runtime/core/cost-engine.test.ts
 */
const assert = require("assert");
const C = require("./cost-engine");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

const rates = { cpu: 0.001, inference: 0.002 };
console.log("WI-P9-25 — COST ENGINE");

// estimate + kind
check(C.estimate({ units: 100, resource: "cpu", kind: "ESTIMATED" }, rates).cost === 0.1, "estimate: 100 cpu units * 0.001 = 0.1");
check(C.estimate({ units: 10, resource: "cpu", kind: "DECLARED" }, rates).kind === "ESTIMATED", "unknown kind defaults to ESTIMATED (never OBSERVED)");

// attribution
{
  const entries = [
    { missionId: "m1", metier: "P13", unit: "inference", units: 1000, resource: "inference", kind: "SIMULATED" },
    { missionId: "m1", metier: "P13", unit: "inference", units: 500, resource: "cpu", kind: "SIMULATED" },
    { missionId: "m2", metier: "P6", unit: "test", units: 200, resource: "cpu", kind: "ESTIMATED" },
  ];
  const a = C.attribute(entries, rates);
  check(a.total === 2.7 && a.byMission.m1 === 2.5 && a.byMission.m2 === 0.2, "attribute: total + per-mission");
  check(a.byMetier.P13 === 2.5 && a.byUnit.inference === 2.5 && a.byResource.cpu === 0.7, "attribute: per-métier / per-unit / per-resource");
  check(a.kinds.SIMULATED === 2.5 && a.kinds.ESTIMATED === 0.2, "attribute: cost grouped by kind (no OBSERVED invented)");
}

// budgets + alerts
check(C.checkBudget(1.5, 1.0).withinBudget === false && C.checkBudget(1.5, 1.0).overBy === 0.5, "checkBudget: over by 0.5");
{
  const al = C.alerts({ m1: 2.5, m2: 0.2 }, { m1: 1.0, m2: 1.0 });
  check(al.length === 1 && al[0].id === "m1" && al[0].overBy === 1.5, "alerts: only m1 over budget");
}

// anomaly detection
check(JSON.stringify(C.detectAnomalies([1, 1, 1, 1, 10], 1)) === JSON.stringify([4]), "anomaly (k=1): outlier at index 4");
check(C.detectAnomalies([2, 2, 2]).length === 0, "no variance ⇒ no anomaly");

// scenario comparison (cost asc, then cost-per-unit)
{
  const cmp = C.compareScenarios([{ name: "gpu-sim", cost: 2, throughput: 1000 }, { name: "cpu", cost: 1, throughput: 100 }]);
  check(cmp[0].name === "cpu" && cmp[0].cost === 1 && cmp[0].costPerUnit === 0.01, "compare: cheapest first + costPerUnit");
}

// determinism
check(JSON.stringify(C.attribute([{ missionId: "m", units: 1, resource: "cpu" }], rates)) === JSON.stringify(C.attribute([{ missionId: "m", units: 1, resource: "cpu" }], rates)), "deterministic attribution");

console.log(failures === 0 ? "ALL PASS — WI-P9-25 COST ENGINE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
