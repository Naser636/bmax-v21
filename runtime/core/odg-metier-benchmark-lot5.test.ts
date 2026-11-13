#!/usr/bin/env node
"use strict";
/* V193 §4 — lot5 benchmark M1/P6/P12 via the radar adapter + contracts. Proves: through-adapter COLLECTED_REAL; real
 * métier refs; M1 regulatory validated; contracts BLOCKED_AWAITING_ISOLATION; P12 streaming runtime REJECTED; 5 remain. */
const L = require("./odg-metier-benchmark-lot5.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const NOW = 1794000000000;
function main() {
  const r = L.report(NOW);
  check("campaign THROUGH adapter: 3 COLLECTED_REAL, all PROPOSED, 0 writes", r.radarCampaign.runs.every((x: any) => x.collectState === "COLLECTED_REAL" && x.opportunityVerdict === "PROPOSED") && /NOT_MEASURED/.test(r.radarCampaign.autonomousEgress));
  check("M1 reliability VALIDATED_MARKET_SIGNAL (CRA regulatory deadline)", r.radarCampaign.runs.find((x: any) => x.metier === "M1").reliability === "VALIDATED_MARKET_SIGNAL");

  const byId: any = {}; for (const b of r.benchmark) byId[b.metier] = b;
  check("M1→EU CRA deadlines + penalties (sourced, nothing certified)", /EU CRA/.test(byId.M1.worldRef) && /€15M\/2.5%/.test(byId.M1.worldRef) && /no cert claimed/.test(byId.M1.recommendation));
  check("P6→HELM + contamination-resistance; eval full-run BLOCKED on owner corpus", /HELM/.test(byId.P6.worldRef) && /BLOCKED on an owner corpus/.test(byId.P6.gap));
  check("P12→Kafka/Flink exactly-once; streaming runtime REJECTED (ODG not a stream processor)", /Kafka\+Flink/.test(byId.P12.worldRef) && /REJECTED\/OWNER_GATED/.test(byId.P12.recommendation));
  check("each row: real ODG modules + gap + IMPROVE reco", r.benchmark.every((b: any) => b.odgCurrent && b.gap && /IMPROVE/.test(b.recommendation)));

  check("3 construction contracts BLOCKED_AWAITING_ISOLATION (CTO auth granted)", r.constructionContracts.length === 3 && r.constructionContracts.every((c: any) => c.status === "BLOCKED_AWAITING_ISOLATION" && c.writeSet.length === 2 && /CTO build auth granted/.test(c.note)));
  check("5 métiers remain after lot5 (15 studied)", r.remainingMetiers.length === 5 && !r.remainingMetiers.includes("M1") && !r.remainingMetiers.includes("P6") && !r.remainingMetiers.includes("P12"));
  check("contract + determinism", L.BENCHMARK_LOT5_CONTRACT.invariants.some((i: string) => /THROUGH the radar adapter/.test(i)) && L.BENCHMARK_LOT5_CONTRACT.invariants.some((i: string) => /5 métiers remain/.test(i)) && JSON.stringify(L.report(NOW).benchmark) === JSON.stringify(r.benchmark) && Object.isFrozen(r));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — metier-benchmark-lot5 (V193 §4: M1→EU-CRA / P6→HELM-eval / P12→Kafka-Flink THROUGH the adapter; M1 nothing certified, P6 full-run BLOCKED on corpus, P12 runtime REJECTED; 3 contracts BLOCKED_AWAITING_ISOLATION; 5 métiers remain)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
