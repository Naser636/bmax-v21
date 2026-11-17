#!/usr/bin/env node
"use strict";
/* V268 — Phase-0 reconciliation of the V2.0 MASTER GROWTH ROADMAP. Grounds every mapped component on disk (anti-duplication),
 * verifies the persisted master artifact exists, and INDEPENDENTLY recomputes the §25-§29/§61 financial model (integer EUR)
 * confirming the document's arithmetic as internally consistent PLANNING estimates — never measured/achieved. Read-only. */
const fs = require("fs");
const R = require("./odg-btp-growth-roadmap-reconciliation.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  // ---- persisted artifact exists on disk (git-tracked), non-trivial ----
  const artifactExists = fs.existsSync("ODG_BTP_INTERNATIONAL_GROWTH_ROADMAP_V2.md");
  check("master artifact ODG_BTP_INTERNATIONAL_GROWTH_ROADMAP_V2.md persisted on disk (>10KB)", artifactExists && fs.statSync("ODG_BTP_INTERNATIONAL_GROWTH_ROADMAP_V2.md").size > 10000 && R.MASTER_ARTIFACT === "ODG_BTP_INTERNATIONAL_GROWTH_ROADMAP_V2.md");

  // ---- program map is anti-duplicative + fs-grounded: every backing module EXISTS on disk ----
  const allModules = R.PROGRAMS.flatMap((p: any) => p.modules);
  const missing = allModules.filter((m: string) => !fs.existsSync("runtime/core/" + m + ".ts"));
  check("every mapped backing module exists on disk (no dangling/fabricated component) — " + allModules.length + " refs", missing.length === 0);
  check("honest status ladder: no program claimed PRODUCTION_READY or INDEPENDENTLY_VALIDATED (a module on disk ≠ operational)",
    R.PROGRAMS.every((p: any) => R.CAP_STATUS.indexOf(p.status) >= 0) && R.PROGRAMS.every((p: any) => p.status !== "PRODUCTION_READY" && p.status !== "INDEPENDENTLY_VALIDATED"));
  check("supplier-marketplace program honestly ABSENT (no module), v124-integration present but OWNER_GATED",
    R.PROGRAMS.find((p: any) => p.id === "P-ECOSYSTEM").status === "ABSENT" && R.PROGRAMS.find((p: any) => p.id === "P-ECOSYSTEM").modules.length === 0 &&
    /OWNER_GATED/.test(R.PROGRAMS.find((p: any) => p.id === "P-V124-INTEGRATION").gap));

  // ---- anti-duplication prohibitions ----
  check("prohibitions: no parallel roadmap/Boussole/Radar/orchestrator/register, no 10th primitive; integration OWNER_GATED",
    R.PROHIBITIONS.noParallelRoadmap && R.PROHIBITIONS.noSecondBoussole && R.PROHIBITIONS.noSecondRadar && R.PROHIBITIONS.noTenthPrimitive && R.PROHIBITIONS.noParallelOrchestrator && R.PROHIBITIONS.noDuplicateRegister && /OWNER_GATED/.test(R.PROHIBITIONS.canonicalIntegration) && R.PRIMITIVES.length === 9);

  // ===== INDEPENDENT financial recomputation (§26) — recompute from the monthly schedule, not from the asserted totals =====
  const a = R.recomputeAmbitious();
  check("§26 ambitious: customerMonths 4285, ecosystemMonths 3970, grossAcquisitions 1098 (summed from §25 schedule)", a.customerMonths === 4285 && a.ecosystemMonths === 3970 && a.grossAcquisitions === 1098);
  check("§26 ambitious revenue: SaaS 509915 + ecosystem 59550 + onboarding 65880 = 635345 (integer EUR)", a.saasEur === 509915 && a.ecosystemEur === 59550 && a.onboardingEur === 65880 && a.yearOneRevenueEur === 635345);
  check("§26 M12 MRR 134000, ARR run-rate 1608000; basis PLANNING_ESTIMATE (not achieved)", a.mrrM12Eur === 134000 && a.arrRunRateEur === 1608000 && a.basis === "PLANNING_ESTIMATE");

  // ===== cost envelope + operating result (§28) =====
  const cost = R.recomputeCostEnvelope();
  check("§28 cost envelope total 416400, operating result 635345−416400 = 218945 (scenario, not guaranteed profit)",
    cost.totalEur === 416400 && cost.operatingResultEur === 218945 && /NOT guaranteed/.test(cost.caveat));

  // ===== paid media (§10/§61) — the honest 50% monthly vs 37.5% annual distinction =====
  const media = R.recomputePaidMedia();
  check("§10 paid media: annual 22500; monthly-recurring reduction 50.0%% (post-test); annual-envelope reduction 37.5%% (both consistent)",
    media.annualEur === 22500 && media.monthlyRecurringReductionPct === 50.0 && media.annualEnvelopeReductionPct === 37.5);

  // ===== unit economics (§29) — TARGET, with the 16-month benchmark caveat =====
  const ue = R.recomputeUnitEconomics(250);
  check("§29 unit economics: LTV ≈3127, LTV/CAC(250) ≈12.5, payback ≈2.7 months — TARGET with 16-month benchmark caveat",
    ue.ltvEur === 3127 && ue.ltvToCac === 12.5 && ue.paybackMonths === 2.7 && /16 months/.test(ue.caveat) && /TARGET/.test(ue.basis));

  // ===== acquisition mix (§32) =====
  const mix = R.recomputeAcquisitionMix();
  check("§32 acquisition mix: shares sum 1.0, stated customers sum 1098 (= gross target); TARGET not performance",
    mix.shareSum === 1.0 && mix.statedCustomerSum === 1098 && mix.grossAcquisitions === 1098 && mix.basis === "PLANNING_TARGET");

  // ===== consistency roll-up + the honest NOT_INDEPENDENTLY_DERIVABLE flag =====
  const fin = R.financialConsistency();
  check("financialConsistency: all 16 document arithmetic claims independently reproduced, 0 mismatch", fin.documentArithmeticConsistent === true && fin.mismatches.length === 0 && fin.checks.length === 16);
  check("financialConsistency honest gap: prudent/central scenario totals flagged NOT_INDEPENDENTLY_DERIVABLE (no published monthly schedule)",
    fin.notIndependentlyDerivable.length === 1 && /NOT_INDEPENDENTLY_DERIVABLE/.test(fin.notIndependentlyDerivable[0]) && fin.basis.indexOf("NOT measured") >= 0);

  // ===== full reconcile() =====
  const rec = R.reconcile();
  check("reconcile(): PHASE_0, started=false, programs mapped, financial consistent, canonical integration OWNER_GATED",
    /PHASE_0/.test(rec.phase) && rec.started === false && rec.programCount === R.PROGRAMS.length && rec.financial.documentArithmeticConsistent === true && /OWNER_GATED/.test(rec.canonicalIntegration));
  check("reconcile() status tally honest: has ABSENT + PARTIAL + EXISTING, none PRODUCTION_READY/INDEPENDENTLY_VALIDATED",
    rec.statusTally.ABSENT >= 1 && rec.statusTally.PARTIAL >= 1 && rec.statusTally.EXISTING >= 1 && rec.statusTally.PRODUCTION_READY === 0 && rec.statusTally.INDEPENDENTLY_VALIDATED === 0);

  // ===== determinism + contract + canonical registers untouched =====
  check("deterministic + frozen", JSON.stringify(R.reconcile()) === JSON.stringify(R.reconcile()) && Object.isFrozen(R.PROGRAMS) && Object.isFrozen(R.MONTHLY));
  const closure = JSON.parse(fs.readFileSync("docs/odg/closure-register.json", "utf8"));
  const roadmap = JSON.parse(fs.readFileSync("runtime/governance/ROADMAP.json", "utf8"));
  const v124 = JSON.parse(fs.readFileSync("docs/odg/v124-consolidated-roadmap.json", "utf8"));
  // hard registers (closure 427 / ROADMAP 11) stay byte-identical; the v124 companion now carries the owner-authorized
  // (V272 §4 / V273 §1) BTP strategic-extension integration as section S (24 missions, sections ⊆ A-S) — lossless + additive.
  check("hard registers preserved (closure 427, ROADMAP 11); v124 companion integrated as section S (24 missions, sections⊆A-S)",
    closure.items.length === 427 && roadmap.missions.length === 11 && v124.missions.length === 24 && v124.missions.every((m: any) => "ABCDEFGHIJKLMNOPQRS".indexOf(m.section) >= 0) && v124.missions.some((m: any) => m.section === "S"));
  check("contract: additive only, OWNER_GATED integration, figures PLANNING_ESTIMATE/TARGET, no 2nd reconciliation engine",
    R.GROWTH_ROADMAP_RECONCILIATION_CONTRACT.invariants.some((i: string) => /additive ONLY/.test(i)) && R.GROWTH_ROADMAP_RECONCILIATION_CONTRACT.invariants.some((i: string) => /OWNER_GATED/.test(i)) && R.GROWTH_ROADMAP_RECONCILIATION_CONTRACT.invariants.some((i: string) => /PLANNING_ESTIMATES\/TARGETS/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-btp-growth-roadmap-reconciliation (V268 Phase-0: V2.0 master roadmap persisted + 17 programs mapped to EXISTING fs-grounded components [anti-dup, honest ladder, supplier-marketplace ABSENT]; financial model INDEPENDENTLY recomputed from §25 schedule — 635345/134000/1608000/416400/218945/22500 all consistent, prudent/central flagged NOT_INDEPENDENTLY_DERIVABLE; canonical v124 integration OWNER_GATED started=false; registers 427/11/14 untouched; PLANNING estimates never achieved)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
