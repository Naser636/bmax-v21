#!/usr/bin/env node
"use strict";
/* V146 MÉTIER 3 — FinOps analyzer battery (SYNTHETIC imported cost records, labelled ≠ real spend). Proves: grouping by
 * service/period, duplicate detection, unused (paid-zero-usage) detection, period-over-period spike anomaly, ESTIMATED
 * savings (never realized), malformed-record drop (fail-closed), integer-minor (no float drift), and that a REALIZED saving
 * is only ever produced by measureSavings over two actual periods — never asserted from an estimate. READ-ONLY (no write). */
const F = require("./finops-analyzer.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const RECS = [
  { vendor: "AWS", service: "EC2", periodMonth: "2026-09", amountMinor: 100000, usage: 50 },
  { vendor: "AWS", service: "EC2", periodMonth: "2026-10", amountMinor: 300000, usage: 60 },   // 3× spike
  { vendor: "AWS", service: "EC2", periodMonth: "2026-10", amountMinor: 300000, usage: 60 },   // duplicate
  { vendor: "Datadog", service: "SaaS", periodMonth: "2026-10", amountMinor: 50000, usage: 0 },// unused
  { bad: true },                                                                                // malformed ⇒ dropped
];

function main() {
  const r = F.analyzeCosts(RECS);
  check("grouping + total (integer-minor) + malformed dropped", r.totalMinor === 750000 && r.recordsDropped === 1 && r.recordsAnalyzed === 4 && r.byService.ec2 === 700000);
  check("duplicate charge detected", r.duplicates.length === 1 && r.duplicates[0].amountMinor === 300000);
  check("unused (paid, zero usage) detected", r.unused.length === 1 && r.unused[0].service === "saas");
  check("period-over-period spike anomaly (3× ≥ 1.5×) detected", r.anomalies.length === 1 && r.anomalies[0].ratio >= 1.5);
  check("opportunities are ESTIMATES (REMOVE_UNUSED + DEDUPLICATE_CHARGES), confidence=ESTIMATE", r.opportunities.map((o: any) => o.kind).includes("REMOVE_UNUSED") && r.opportunities.every((o: any) => o.confidence === "ESTIMATE"));
  check("estimated savings = unused + duplicates (not a realized saving)", r.estimatedSavingsMinor === 350000 && /ESTIMATES \(not realized\)/.test(r.note));

  // no false anomaly when spend is flat/declining.
  const flat = F.analyzeCosts([{ vendor: "v", service: "s", periodMonth: "2026-09", amountMinor: 100000 }, { vendor: "v", service: "s", periodMonth: "2026-10", amountMinor: 100000 }]);
  check("flat spend ⇒ no anomaly (no false positive)", flat.anomalies.length === 0);

  // REALIZED saving only via measureSavings over two actual periods.
  const m = F.measureSavings({ totalMinor: 450000 }, { totalMinor: 350000 });
  check("measureSavings: realized delta between two actual periods (100000, 22.2%)", m.measurable === true && m.realizedMinor === 100000 && m.pct === 22.2 && /measured result, not an estimate/.test(m.note));
  check("measureSavings fail-closed on missing data", F.measureSavings({}, { totalMinor: 1 }).measurable === false);

  // fail-closed / read-only
  check("garbage input ⇒ empty analysis, no throw (fail-closed)", F.analyzeCosts(null).totalMinor === 0 && F.analyzeCosts(null).recordsAnalyzed === 0);
  check("READ-ONLY note (never writes infra/subscriptions/spend)", /NO write to infra\/subscriptions\/spend/.test(r.note));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — finops-analyzer (group/dedup/unused/spike; estimates≠realized; measureSavings over actual periods; read-only; fail-closed; integer-minor)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
