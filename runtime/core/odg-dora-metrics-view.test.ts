#!/usr/bin/env node
"use strict";
/* IMP-P1-DORA-VIEW — DORA metrics from real events; fail-closed NOT_MEASURED; no fabrication. */
const D = require("./odg-dora-metrics-view.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const m = D.doraMetrics({
    deployments: [{ at: 1 }, { at: 2 }, { at: 3 }, { at: 4 }], windowDays: 2,
    changes: [{ committedAt: 100, deployedAt: 300 }, { committedAt: 100, deployedAt: 500 }],
    incidents: [{ detectedAt: 10, resolvedAt: 40, causedByChange: true }, { detectedAt: 10, resolvedAt: 20, causedByChange: false }],
  });
  check("deployment frequency measured (4 deploys / 2 days = 2/day)", m.deploymentFrequency.status === "MEASURED" && m.deploymentFrequency.value === 2);
  check("lead time median measured from committed→deployed pairs", m.leadTimeForChanges.status === "MEASURED" && m.leadTimeForChanges.value === 300 && m.leadTimeForChanges.samples === 2);
  check("change failure rate = failures/deployments (1/4)", m.changeFailureRate.status === "MEASURED" && m.changeFailureRate.value === 0.25 && m.changeFailureRate.failures === 1);
  check("MTTR median measured from resolved incidents (median[30,10]=20)", m.meanTimeToRestore.status === "MEASURED" && m.meanTimeToRestore.value === 20);

  // fail-closed: no events ⇒ NOT_MEASURED (never fabricated 0)
  const empty = D.doraMetrics({});
  check("no deployment events ⇒ deploy-freq NOT_MEASURED (flagged, not 0)", empty.deploymentFrequency.status === "NOT_MEASURED" && empty.deploymentFrequency.value === null && /no deployment events/.test(empty.deploymentFrequency.reason));
  check("no change/incident events ⇒ lead-time + CFR + MTTR NOT_MEASURED", empty.leadTimeForChanges.status === "NOT_MEASURED" && empty.changeFailureRate.status === "NOT_MEASURED" && empty.meanTimeToRestore.status === "NOT_MEASURED" && empty.measuredCount === 0);
  check("deploys but no window ⇒ NOT_MEASURED (no fabricated rate)", D.doraMetrics({ deployments: [{ at: 1 }] }).deploymentFrequency.status === "NOT_MEASURED");

  check("contract + honesty (only real events, no fabrication)", /no fabricated numbers/.test(D.DORA_METRICS_VIEW_CONTRACT.invariants[0]) && /never fabricated 0/.test(m.honesty));
  check("deterministic", JSON.stringify(D.doraMetrics({}).measuredCount) === JSON.stringify(empty.measuredCount));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — dora-metrics-view (IMP-P1: 4 DORA metrics from REAL events; no-events ⇒ NOT_MEASURED not fabricated 0; deploy-freq flagged)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
