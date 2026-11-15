#!/usr/bin/env node
"use strict";
/* V199 — lot6 benchmark P14/P15/M3/M4/M5 via the radar adapter + contracts. Proves: through-adapter COLLECTED_REAL;
 * real métier refs; M5 regulatory signal; contracts BLOCKED_AWAITING_ISOLATION; runtimes REJECTED; 20/20 studied. */
const L = require("./odg-metier-benchmark-lot6.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const NOW = 1794800000000;
function main() {
  const r = L.report(NOW);
  check("campaign THROUGH adapter: 5 COLLECTED_REAL, all PROPOSED, autonomous egress NOT_MEASURED", r.radarCampaign.runs.length === 5 && r.radarCampaign.runs.every((x: any) => x.collectState === "COLLECTED_REAL" && x.opportunityVerdict === "PROPOSED") && /NOT_MEASURED/.test(r.radarCampaign.autonomousEgress));
  check("M5 reliability VALIDATED_MARKET_SIGNAL (EAA regulatory deadline)", r.radarCampaign.runs.find((x: any) => x.metier === "M5").reliability === "VALIDATED_MARKET_SIGNAL");

  const byId: any = {}; for (const b of r.benchmark) byId[b.metier] = b;
  check("P14→golden paths + Backstage framework-not-product; DORA/SPACE", /golden path/i.test(byId.P14.worldRef) && /Backstage=framework not product/.test(byId.P14.worldRef) && /DevEx metric view/.test(byId.P14.recommendation));
  check("P15→Temporal durable/saga; durable-execution runtime REJECTED", /exactly-once = workflow logic only/.test(byId.P15.worldRef) && /REJECTED\/OWNER_GATED/.test(byId.P15.recommendation));
  check("M3→FinOps FOCUS; no cloud-billing integration", /FOCUS/.test(byId.M3.worldRef) && /NO cloud-billing integration/.test(byId.M3.recommendation) && /COST SSOT/.test(byId.M3.odgCurrent));
  check("M4→lakehouse/dbt data contracts/medallion; NO external data platform", /medallion/i.test(byId.M4.worldRef) && /NO external data platform/.test(byId.M4.recommendation));
  check("M5→WCAG 2.2/EAA EN 301 549; nothing declared conformant; ~30% honesty", /WCAG 2\.2/.test(byId.M5.worldRef) && /EN 301 549/.test(byId.M5.worldRef) && /nothing declared conformant/.test(byId.M5.recommendation) && /30%/.test(byId.M5.recommendation));
  check("each row: real ODG modules + gap + IMPROVE reco", r.benchmark.length === 5 && r.benchmark.every((b: any) => b.odgCurrent && b.gap && /IMPROVE/.test(b.recommendation)));

  check("5 construction contracts BLOCKED_AWAITING_ISOLATION (CTO auth granted)", r.constructionContracts.length === 5 && r.constructionContracts.every((c: any) => c.status === "BLOCKED_AWAITING_ISOLATION" && c.writeSet.length === 2 && /CTO build auth granted/.test(c.note)));
  check("20/20 studied — 0 métiers remain after lot6", r.remainingMetiers.length === 0 && /ALL 20 métiers studied/.test(r.note));
  check("contract + determinism", L.BENCHMARK_LOT6_CONTRACT.invariants.some((i: string) => /THROUGH the radar adapter/.test(i)) && L.BENCHMARK_LOT6_CONTRACT.invariants.some((i: string) => /20\/20 studied/.test(i)) && JSON.stringify(L.report(NOW).benchmark) === JSON.stringify(r.benchmark) && Object.isFrozen(r));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — metier-benchmark-lot6 (V199 §3/§12: P14 DevEx / P15 orchestration / M3 FinOps / M4 Data-Eng / M5 Accessibility THROUGH the adapter; M5 EAA signal, nothing conformant; P15 runtime + M4 platform REJECTED; 5 contracts BLOCKED_AWAITING_ISOLATION; 20/20 métiers studied, 0 remain)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
