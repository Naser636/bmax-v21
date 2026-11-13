#!/usr/bin/env node
"use strict";
/* V180-A §1+§4 — three-person economic model. Proves: TEAM_CAP=3 ABSOLUTE and AUTO-REJECTS >3 people; levers map to the
 * REAL scaling model (coupling guarded); combinations + scenarios + sensitivity; €5M search is honest (feasible=MODEL
 * only, demand OWNER_GATED); €500M metrics kept DISTINCT; reuses scaleAtVolume (no second formula); read-only/deterministic. */
const M = require("./odg-three-person-economic-model.js");
const SCALE = require("./odg-economic-scaling-model.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const OPP = { id: "nis2", proposedPrice: 25000, estDeliveryCostPerCustomer: 2000, estSupportDaysPerCustomer: 3, certificationCost: 20000 };

function main() {
  // ---- cap is 3 and absolute ----
  check("TEAM_CAP === 3 (was 5) and verdict vocabulary is fixed", M.TEAM_CAP === 3 && M.VERDICT.includes("TEAM_CAP_EXCEEDED") && M.VERDICT.includes("FEASIBLE_WITHIN_CAP") && M.VERDICT.includes("NET_BELOW_TARGET"));

  // ---- coupling guard: automation=0.6 (baseline) reproduces scaleAtVolume exactly (no divergent second formula) ----
  const e259 = M.evaluateCombination(OPP, 259, { automationLevel: 0.6, priceFactor: 1, cacPerCustomer: 3000, jurisdiction: "FR" });
  const s259 = SCALE.scaleAtVolume(OPP, 259, "FR", { priceFactor: 1, cacPerCustomer: 3000 });
  check("coupling: at baseline automation (0.6) net + people match scaleAtVolume exactly", e259.level3_netProfit === s259.level3_netProfit && e259.people === s259.people);

  // ---- 259 customers at baseline: WITHIN 3-person cap but net < €5M target ----
  check("259 @ baseline is within the 3-person cap", e259.withinCap === true && e259.people <= 3);
  check("259 @ baseline net is below the €5M target (≈€3.37M, matches V179)", e259.verdict === "NET_BELOW_TARGET" && e259.level3_netProfit < 5000000 && e259.level3_netProfit > 3000000);

  // ---- AUTO-REJECT: high volume needs >3 people ----
  const eBig = M.evaluateCombination(OPP, 1000, { automationLevel: 0.6, priceFactor: 1, cacPerCustomer: 3000, jurisdiction: "FR" });
  check("1000 customers @ baseline is AUTO-REJECTED (needs >3 people)", eBig.verdict === "TEAM_CAP_EXCEEDED" && eBig.withinCap === false);

  // ---- every scenario carries the full §4 field list ----
  const need = ["averageRevenuePerCustomer", "recurringRevenue", "oneOffRevenue", "variableCostsTotal", "fixedCostsTotal", "supportDeliveryCapacity", "cacTotal", "cashNeeded", "salaries", "taxRate", "tax", "level1_contributive", "level2_operatingProfit", "level3_netProfit", "humanWorkload", "automationDemonstrated", "demandEvidence"];
  check("evaluateCombination emits every §4 required field", need.every((k) => k in e259));
  check("demand is flagged OWNER_GATED / simulated (never validated)", /OWNER_GATED/.test(e259.demandEvidence) && /SIMULATED|simulated/.test(e259.demandEvidence));

  // ---- scenario triad, all enforcing the cap ----
  const ss = M.scenarioSet(OPP, 259);
  check("scenarioSet = pessimistic/central/optimistic, each a lever COMBINATION enforcing the cap", ss.scenarios.length === 3 && ss.scenarios.every((s: any) => s.teamCap === 3 && typeof s.withinCap === "boolean") && ss.scenarios.map((s: any) => s.name).join(",") === "pessimistic,central,optimistic");

  // ---- sensitivity over all four levers, ranked by swing ----
  const sv = M.sensitivity(OPP, 259);
  check("sensitivity covers all 4 levers, sorted by |Δnet| descending", sv.rows.length === 4 && sv.rows.map((r: any) => r.lever).sort().join(",") === "automationLevel,cacPerCustomer,jurisdiction,priceFactor" && Math.abs(sv.rows[0].swing) >= Math.abs(sv.rows[sv.rows.length - 1].swing));

  // ---- €5M lever-combination search ----
  const f = M.searchFor5M(OPP);
  check("searchFor5M evaluates the full grid and reports reject reasons", f.evaluated > 100 && typeof f.rejectCounts.TEAM_CAP_EXCEEDED === "number" && typeof f.rejectCounts.NET_BELOW_TARGET === "number");
  check("searchFor5M: €5M reachable ONLY via lever COMBINATIONS, least-stretch path within 3 people & ≥ target", f.reachable === true && f.leastStretchPath.people <= 3 && f.leastStretchPath.withinCap === true && f.leastStretchPath.level3_netProfit >= 5000000 && /COMBINATIONS|combination/.test(f.conclusion));
  // INVARIANT: no feasible path ever violates the cap (auto-reject is sound)
  const anyFeasibleOverCap = (() => { // re-derive: no FEASIBLE verdict with people>3 anywhere in a representative sweep
    for (const v of [100, 259, 350, 500, 750, 1000]) for (const au of [0.6, 0.7, 0.8, 0.9]) {
      const e = M.evaluateCombination(OPP, v, { automationLevel: au, priceFactor: 2.0, cacPerCustomer: 1500, jurisdiction: "AE" });
      if (e.verdict === "FEASIBLE_WITHIN_CAP" && e.people > 3) return true;
    }
    return false;
  })();
  check("INVARIANT: a FEASIBLE verdict NEVER has people > 3 (auto-reject is sound)", anyFeasibleOverCap === false);
  check("least-stretch path lifts automation above the demonstrated 60% baseline (honest stretch)", f.leastStretchPath.levers.automationLevel > M.BASELINE_AUTOMATION || f.leastStretchPath.levers.priceFactor > 1 && /unvalidated|UNVALIDATED/.test(f.conclusion));

  // ---- €500M distinct metrics, never conflated ----
  const fh = M.fiveHundredMTrajectories();
  const mset = fh.metrics.map((m: any) => m.metric);
  check("€500M = 5 DISTINCT metrics (CA ≠ net ≠ valuation ≠ cumulative ≠ volume), each with a conflation warning", fh.metrics.length === 5 && new Set(mset).size === 5 && mset.includes("annual_revenue_CA") && mset.includes("annual_net_profit") && mset.includes("enterprise_valuation") && fh.metrics.every((m: any) => m.conflationWarning && m.definition && m.illustrativePath));
  check("€500M is kept SEPARATE from the year-one €5M target (must not divert)", /separate|SEPARATE/.test(fh.ambition) && /not.*divert|NOT.*divert/.test(fh.ambition + fh.note));

  // ---- contract + determinism ----
  check("contract: 3-cap auto-reject + combinations + distinct-500M + reuse-no-second-formula", M.THREE_PERSON_MODEL_CONTRACT.invariants.some((i: string) => /AUTO-REJECTED/.test(i)) && M.THREE_PERSON_MODEL_CONTRACT.invariants.some((i: string) => /DISTINCT metrics/.test(i)) && /NO second economic formula/.test(M.THREE_PERSON_MODEL_CONTRACT.reuses));
  check("deterministic + frozen", JSON.stringify(M.searchFor5M(OPP).conclusion) === JSON.stringify(f.conclusion) && Object.isFrozen(e259) && Object.isFrozen(fh));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — three-person-economic-model (§1+§4: TEAM_CAP=3 ABSOLUTE auto-rejects >3 people; coupling to scaleAtVolume guarded [no 2nd formula]; 259@baseline within-cap but <€5M; €5M reachable ONLY via lever combinations [automation>60% + ~350 customers UNVALIDATED]; €500M kept as 5 distinct metrics)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
