#!/usr/bin/env node
"use strict";
/* V187 LOT 3 — P2/P4/P10 benchmark via a real radar-adapter campaign + honest status. Proves: campaign runs THROUGH the
 * adapter (COLLECTED_REAL, radar owns path); métier-specific real refs; prepared improvements NOT built; parallelism
 * NOT_MEASURED; independent review NOT_AVAILABLE; 11 métiers remain. */
const L = require("./odg-metier-benchmark-lot3.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const NOW = 1794000000000;

function main() {
  const r = L.report(NOW);

  // campaign THROUGH the adapter
  check("campaign ran THROUGH the adapter: 3 items COLLECTED_REAL", r.radarCampaign.itemCount === 3 && r.radarCampaign.runs.every((x: any) => x.collectState === "COLLECTED_REAL") && r.radarCampaign.callsUsed === 3);
  check("P10 reliability VALIDATED_MARKET_SIGNAL; P2/P4 INSUFFICIENTLY_VALIDATED (honest)", r.radarCampaign.runs.find((x: any) => x.metier === "P10").reliability === "VALIDATED_MARKET_SIGNAL" && r.radarCampaign.runs.find((x: any) => x.metier === "P2").reliability === "INSUFFICIENTLY_VALIDATED");
  check("opportunities PROPOSED (not authorized); radar owns path; autonomous egress NOT_MEASURED", r.radarCampaign.runs.every((x: any) => x.opportunityVerdict === "PROPOSED") && /NOT_MEASURED/.test(r.radarCampaign.autonomousEgress));

  // métier-specific real references
  const byId: any = {}; for (const b of r.benchmark) byId[b.metier] = b;
  check("P2→ISO 42001 + NIST AI RMF", /ISO\/IEC 42001/.test(byId.P2.worldRef) && /NIST AI RMF/.test(byId.P2.worldRef));
  check("P4→DAMA-DMBOK + data contracts", /DAMA-DMBOK/.test(byId.P4.worldRef) && /data contracts/.test(byId.P4.worldRef));
  check("P10→EU AI Act deadlines + penalties", /AI Act/.test(byId.P10.worldRef) && /€35M\/7%/.test(byId.P10.worldRef));
  check("each row: real ODG module + gap + IMPROVE recommendation (no cert claimed)", r.benchmark.every((b: any) => b.odgCurrent && b.gap && /IMPROVE/.test(b.recommendation)) && !/CERTIFIED/.test(JSON.stringify(r.benchmark)));

  // §13 prepared improvements NOT built
  check("the 5 prepared improvements (P1/P3/P5/P9/P11) are PREPARED, NOT built this lot", ["P1", "P3", "P5", "P9", "P11"].every((p) => /PREPARED/.test(r.preparedImprovements[p]) && /NOT built/.test(r.preparedImprovements[p])));

  // §9/§11 honest status
  check("native 5-way parallel execution NOT_MEASURED (not simulated)", /NOT_MEASURED/.test(r.orchestration.nativeParallelExecution) && /not simulated/.test(r.orchestration.nativeParallelExecution));
  check("independent model-reviewer NOT_AVAILABLE (evaluator-independence exists for deterministic checks)", /NOT_AVAILABLE/.test(r.orchestration.independentExpert) && /evaluator-independence/.test(r.orchestration.independentExpert));
  check("orchestration components audited (real modules)", r.orchestration.componentsAudited.some((c: string) => /mission-orchestrator/.test(c)) && r.orchestration.componentsAudited.some((c: string) => /evaluator-independence/.test(c)));

  // lot discipline + contract + determinism
  check("11 métiers remain (lots 1-3 covered 9)", r.remainingMetiers.length === 11 && !r.remainingMetiers.includes("P2") && !r.remainingMetiers.includes("P10"));
  check("contract: collected-through-adapter, prepared-not-built, parallelism NOT_MEASURED, review NOT_AVAILABLE", L.BENCHMARK_LOT3_CONTRACT.invariants.some((i: string) => /THROUGH the radar adapter/.test(i)) && L.BENCHMARK_LOT3_CONTRACT.invariants.some((i: string) => /PREPARED not built/.test(i)) && L.BENCHMARK_LOT3_CONTRACT.invariants.some((i: string) => /NOT_AVAILABLE/.test(i)));
  check("deterministic + frozen", JSON.stringify(L.report(NOW).radarCampaign.byVerdict) === JSON.stringify(r.radarCampaign.byVerdict) && Object.isFrozen(r));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — metier-benchmark-lot3 (V187: P2/P4/P10 collected THROUGH the radar adapter [COLLECTED_REAL, radar owns path, autonomous egress NOT_MEASURED]; P2→ISO42001/NIST-RMF, P4→DAMA-DMBOK, P10→EU-AI-Act; 5 prepared improvements NOT built; 5-way parallelism NOT_MEASURED; independent review NOT_AVAILABLE; 11 métiers remain)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
