#!/usr/bin/env node
"use strict";
const assert = require("assert");
const G = require("./gate-instrumentation");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5-E / GATE INSTRUMENTATION (E-MEASURE)");
// percentile deterministic.
check(G.percentile([1, 2, 3, 4, 5], 50) === 3 && G.percentile([1, 2, 3, 4, 5], 95) === 5, "percentile nearest-rank");
check(G.percentile([], 50) === null, "empty ⇒ null");
// stats.
{
  const s = G.statsOf([6.40, 6.27, 6.18]);
  check(s.status === "MEASURED" && s.n === 3 && s.p50 === 6.27, "statsOf p50");
}
check(G.statsOf([]).status === "NOT_MEASURED", "no samples ⇒ NOT_MEASURED (fail-closed)");
// decompose: weighted per-suite cost dominates ⇒ bottleneck = perSuiteTsx.
{
  const d = G.decompose({ steps: { tsc: [6.3], campaign: [1.7], perSuiteTsx: [2.0] }, weights: { perSuiteTsx: 367 } });
  check(d.bottleneck.step === "perSuiteTsx", `bottleneck is the weighted per-suite cost (got ${d.bottleneck.step})`);
  check(d.bottleneck.gateContributionP50 === 734 && d.bottleneckShare > 0.9, "per-suite × 367 dominates total P50");
}
// NOT_MEASURED step excluded from ranking.
{
  const d = G.decompose({ steps: { a: [1], b: [] } });
  check(d.measuredSteps === 1 && d.reasons.some((r: any) => /NOT_MEASURED/.test(r)), "unmeasured step excluded + surfaced");
}
// speedupTarget honest before/after.
{
  const r = G.speedupTarget(200, 45);
  check(r.reductionPct === 77.5 && r.met75 === true && r.met80 === false, `200->45s = 77.5% reduction (met75, not met80)`);
}
check(G.speedupTarget(0, 10).reductionPct === null, "invalid before ⇒ null (fail-closed)");
check(G.GATE_INSTRUMENTATION_CONTRACT.invariants.some((i: any) => /fabricates no timing/i.test(i)), "contract: fabricates no timing");
console.log(failures === 0 ? "ALL PASS — V5-E GATE INSTRUMENTATION" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
