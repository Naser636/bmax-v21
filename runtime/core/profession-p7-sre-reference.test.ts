#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P7 = require("./profession-p7-sre-reference");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §43 P7 — SRE REFERENCE (E2/E3)");

// percentiles.
{
  const p = P7.percentiles([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  check(p.count === 10 && p.p50 === 50 && p.p99 === 100 && p.max === 100, "percentiles: p50/p95/p99/max computed (nearest-rank)");
  check(P7.percentiles([]).p99 === null, "empty series ⇒ null percentiles (fail-closed)");
}

// SLO compliance: within targets ⇒ compliant; p99 breach ⇒ not.
{
  const good = P7.evaluateSLO([10, 10, 10, 10, 10, 10, 10, 10, 10, 10], { targetP99Ms: 100, observedAvailability: 0.999, availabilityTarget: 0.99 });
  check(good.compliant === true && good.p99 <= 100, "SLO: within latency + availability targets ⇒ compliant");
  const slow = P7.evaluateSLO([500, 500, 500], { targetP99Ms: 100, observedAvailability: 0.999, availabilityTarget: 0.99 });
  check(slow.compliant === false && slow.latencyOk === false, "SLO: p99 breach ⇒ NOT compliant");
  const down = P7.evaluateSLO([10], { targetP99Ms: 100, observedAvailability: 0.90, availabilityTarget: 0.99 });
  check(down.compliant === false && down.availabilityOk === false && down.errorBudgetBurn > 1, "SLO: availability below target ⇒ error-budget burn > 1");
}

// E3 chaos/recovery: RTO/RPO within targets ⇒ ok; slow recovery ⇒ flagged.
{
  const ok = P7.chaosRecovery({ failedAt: 1000, recoveredAt: 1200, lastCheckpointAt: 950, rtoTargetMs: 500, rpoTargetMs: 100 });
  check(ok.rto === 200 && ok.rpo === 50 && ok.withinRto === true && ok.withinRpo === true && ok.recovered === true, "chaos: recovery within RTO/RPO ⇒ ok");
  const slow = P7.chaosRecovery({ failedAt: 1000, recoveredAt: 5000, lastCheckpointAt: 500, rtoTargetMs: 500, rpoTargetMs: 100 });
  check(slow.withinRto === false && slow.withinRpo === false, "chaos: slow recovery / stale checkpoint ⇒ RTO/RPO breached");
}

// E2 reference project (no incident) ⇒ level E2; E3 with incident.
{
  const e2 = P7.runReferenceProject({});
  check(e2.synthetic === true && e2.profession === "P7" && e2.level === "E2" && e2.slo.compliant === true, "E2: reference project ⇒ compliant SLO, level E2");
  const e3 = P7.runReferenceProject({ incident: { failedAt: 1000, recoveredAt: 5000, lastCheckpointAt: 500, rtoTargetMs: 500, rpoTargetMs: 100 } });
  check(e3.level === "E3" && e3.degraded === true, "E3: chaos incident with slow recovery ⇒ degradation flagged");
}
check(P7.P7_SRE_REFERENCE_CONTRACT.invariants.some((i: any) => /E5.*owner-gated NOT_RUN/.test(i)), "honesty: SYNTHETIC only, E5 owner-gated NOT_RUN");

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P7 SRE REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
