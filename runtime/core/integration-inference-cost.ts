#!/usr/bin/env node
"use strict";

/*
 * WI-INT-24 — MULTI-PROFESSION INTEGRATION P13 → P9 → P6. PURE, deterministic. Composes by contract:
 * P13 inference-engine (benchmark CPU reference + simulated providers) → P9 cost-engine (cost attribution,
 * budgets/alerts, cost/perf scenario comparison, anomaly) → P6 quality-harness (fail-closed verdict over the
 * benchmark). Costs are ESTIMATED/SIMULATED (never a real spend); no physical GPU or paid provider is invented.
 * Produces a verifiable cost/performance report. Dual export.
 */

const IE = require("./inference-engine");
const CE = require("./cost-engine");
const QH = require("./quality-harness");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** runInferenceCost(input) -> report. input: { providers:[{name,kind,latencyPerUnit,costPerUnit,maxUnits}], requests, budgets? }. */
function runInferenceCost(input: any): any {
  const i = isObj(input) ? input : {};
  const reqs = Array.isArray(i.requests) ? i.requests : [];
  const defaultFn = (x: any) => String(x).length; // deterministic reference "model"
  // --- P13: define + benchmark each provider ---
  const benches: any[] = []; const costEntries: any[] = []; const scenarios: any[] = []; const testResults: any = {};
  for (const ps of (Array.isArray(i.providers) ? i.providers : [])) {
    if (!isObj(ps)) continue;
    let provider;
    try { provider = IE.defineProvider({ name: ps.name, kind: ps.kind, fn: defaultFn, latencyPerUnit: ps.latencyPerUnit, costPerUnit: ps.costPerUnit, maxUnits: ps.maxUnits }); }
    catch (e: any) { testResults["define:" + (ps.name || "?")] = "fail"; continue; }
    const b = IE.benchmark(provider, reqs);
    benches.push(b);
    testResults["bench:" + b.provider] = b.failures === 0 ? "pass" : "fail";
    // --- P9: one cost entry per provider (kind SIMULATED unless cpu-reference) ---
    costEntries.push({ missionId: "inference", metier: "P13", unit: "inference", units: b.totalUnits, resource: "inference", kind: b.kind === "cpu-reference" ? "ESTIMATED" : "SIMULATED", costOverride: b.estCost });
    scenarios.push({ name: b.provider, cost: b.estCost, throughput: b.totalUnits, kind: b.kind === "cpu-reference" ? "ESTIMATED" : "SIMULATED" });
  }
  // --- P9: attribution (use the benchmark estCost directly as the cost figure) + alerts + comparison ---
  const byProvider: any = {}; for (const b of benches) byProvider[b.provider] = b.estCost;
  const alerts = CE.alerts(byProvider, isObj(i.budgets) ? i.budgets : {});
  const ranking = CE.compareScenarios(scenarios);
  const latencyAnomalies = CE.detectAnomalies(benches.map((b: any) => b.estLatencyMs), 1);
  // --- P6: quality over the benchmark ---
  const keys = Object.keys(testResults);
  const p6 = QH.qualityReport({ testResults, requiredTests: keys, ranTests: keys });

  return Object.freeze({
    verdict: p6.verdict,
    note: "costs are ESTIMATED/SIMULATED — never a real spend; no physical GPU or paid provider invented",
    availability: IE.availability(),
    p13: Object.freeze({ benchmarks: Object.freeze(benches) }),
    p9: Object.freeze({ byProvider: Object.freeze(byProvider), alerts: Object.freeze(alerts), ranking: Object.freeze(ranking), latencyAnomalies: Object.freeze(latencyAnomalies) }),
    p6: Object.freeze({ verdict: p6.verdict }),
  });
}

const INTEGRATION_INFERENCE_COST_CONTRACT = Object.freeze({
  id: "WI-INT-24-INFERENCE-COST",
  source: "Integration P13 (inference-engine) → P9 (cost-engine) → P6 (quality-harness)",
  notAuthority: "pure cross-métier composition; costs ESTIMATED/SIMULATED (never real spend); no physical GPU/paid provider",
  invariants: Object.freeze([
    "pure/deterministic: providers + requests in → cost/perf report out",
    "P13 benchmarks (CPU real / gpu-sim labelled) → P9 cost attribution + cost/perf ranking + alerts → P6 quality verdict",
    "costs carry ESTIMATED/SIMULATED kind; a synthetic cost is never a real spend",
    "fail-closed: provider errors/failures ⇒ quality verdict not PASS",
  ]),
});

module.exports = { INTEGRATION_INFERENCE_COST_CONTRACT, runInferenceCost };

if (require.main === module) {
  process.stdout.write(JSON.stringify(INTEGRATION_INFERENCE_COST_CONTRACT, null, 2) + "\n");
}

export {};
