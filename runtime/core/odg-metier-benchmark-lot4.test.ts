#!/usr/bin/env node
"use strict";
/* V192 §4 — lot4 benchmark P7/P8/P13 via the radar adapter + construction contracts. Proves: collected THROUGH the
 * adapter (COLLECTED_REAL); métier-specific real refs; contracts prepared + BLOCKED_AWAITING_ISOLATION; 8 remain. */
const L = require("./odg-metier-benchmark-lot4.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const NOW = 1794000000000;

function main() {
  const r = L.report(NOW);
  check("campaign ran THROUGH the adapter: 3 items COLLECTED_REAL", r.radarCampaign.runs.length === 3 && r.radarCampaign.runs.every((x: any) => x.collectState === "COLLECTED_REAL") && r.radarCampaign.callsUsed === 3);
  check("opportunities PROPOSED (not authorized); radar autonomous egress NOT_MEASURED", r.radarCampaign.runs.every((x: any) => x.opportunityVerdict === "PROPOSED") && /NOT_MEASURED/.test(r.radarCampaign.autonomousEgress));

  const byId: any = {}; for (const b of r.benchmark) byId[b.metier] = b;
  check("P7→Google SRE SLO/error-budget/golden-signals", /Google SRE/.test(byId.P7.worldRef) && /error budget/.test(byId.P7.worldRef) && /golden signals/.test(byId.P7.worldRef));
  check("P8→OWASP API Top 10 positive-security + rate-limit", /OWASP API/.test(byId.P8.worldRef) && /positive security/.test(byId.P8.worldRef));
  check("P13→KServe/vLLM serving; provisioning REJECTED (ODG spec-only)", /KServe\/vLLM/.test(byId.P13.worldRef) && /REJECTED\/OWNER_GATED/.test(byId.P13.recommendation));
  check("each row cites real ODG modules + gap + IMPROVE reco", r.benchmark.every((b: any) => b.odgCurrent && b.gap && /IMPROVE/.test(b.recommendation)));

  // construction contracts
  check("3 construction contracts (P7/P8/P13), each with objective + write-set + acceptance", r.constructionContracts.length === 3 && r.constructionContracts.every((c: any) => c.objective && c.writeSet.length && c.acceptance.length));
  check("all construction contracts BLOCKED_AWAITING_ISOLATION (CTO auth granted, isolation OWNER_GATED)", r.constructionContracts.every((c: any) => c.status === "BLOCKED_AWAITING_ISOLATION" && /CTO build auth granted/.test(c.note)));
  check("P13 contract is method-only, no provisioning", /method-only/.test(byId.P13.recommendation) || /NO provisioning/.test(r.constructionContracts.find((c: any) => c.metier === "P13").objective));

  // lot discipline + contract + determinism
  check("8 métiers remain after lot4 (12 studied)", r.remainingMetiers.length === 8 && !r.remainingMetiers.includes("P7") && !r.remainingMetiers.includes("P13"));
  check("contract: through-adapter, real refs, contracts BLOCKED_AWAITING_ISOLATION, no construction", L.BENCHMARK_LOT4_CONTRACT.invariants.some((i: string) => /THROUGH the radar adapter/.test(i)) && L.BENCHMARK_LOT4_CONTRACT.invariants.some((i: string) => /BLOCKED_AWAITING_ISOLATION/.test(i)) && L.BENCHMARK_LOT4_CONTRACT.invariants.some((i: string) => /no construction performed/.test(i)));
  check("deterministic + frozen", JSON.stringify(L.report(NOW).benchmark) === JSON.stringify(r.benchmark) && Object.isFrozen(r));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — metier-benchmark-lot4 (V192 §4: P7/P8/P13 collected THROUGH the radar adapter; P7→Google-SRE, P8→OWASP-API-Top10, P13→KServe/vLLM; 3 construction contracts prepared BLOCKED_AWAITING_ISOLATION [CTO auth granted, isolation OWNER_GATED]; P13 provisioning REJECTED; 8 métiers remain)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
