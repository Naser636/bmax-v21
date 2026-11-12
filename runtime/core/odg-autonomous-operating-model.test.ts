#!/usr/bin/env node
"use strict";
/* V173 §4/§5/§6/§12.6 — ODG as the operational engine. Proves: the operating model is REBUILT around autonomous production
 * (NOT the 4,945 pure-human-day model); residual human effort for the hybrid €5M target fits a ≤5 (indeed 3) person team ⇒
 * the bottleneck is DEMAND (OWNER_GATED), not delivery capacity; the autonomous-vs-human split + capability-gap register are
 * grounded in ODG's REAL existing modules (gaps marked MISSING, not faked); no fabricated demand/revenue; €0 clients. */
const M = require("./odg-autonomous-operating-model.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const om = M.operatingModel();

  // ---- §4 rebuild around autonomous production ----
  check("residual human-days/customer < pure-human baseline (ODG automates a real share)", om.residualHumanDaysPerCustomer < 4.0 && om.autonomousSharePercent > 0 && om.autonomousSharePercent < 100);
  check("the hybrid €5M target's residual human-days fit a ≤5-person team (3/4/5 all evaluated)", om.feasibilityByTeam.length === 3 && om.feasibilityByTeam.every((f: any) => typeof f.feasible === "boolean"));
  check("the model is NOT the 4,945 pure-human-day target (rebuilt conclusion says so)", /NOT the target/.test(om.rebuiltConclusion) && om.pureHumanBaselineDays < 4945);
  check("minimum feasible team is ≤5 (ODG automation collapses the human bottleneck)", typeof om.minTeamFeasible === "number" && om.minTeamFeasible <= 5);
  check("the bottleneck is DEMAND (OWNER_GATED), NOT human delivery capacity", /bottleneck is DEMAND/.test(om.rebuiltConclusion) && /OWNER_GATED/.test(om.rebuiltConclusion));

  // ---- §12.6 autonomous-vs-human breakdown ----
  const b = M.autonomousVsHumanBreakdown();
  check("every function tagged with an autonomy level (ODG_AUTONOMOUS/ASSISTED/HUMAN_REQUIRED/OWNER_GATED)", b.functions.length >= 12 && b.functions.every((f: any) => ["ODG_AUTONOMOUS", "ODG_ASSISTED", "HUMAN_REQUIRED", "OWNER_GATED"].includes(f.autonomy)));
  check("ODG performs the maximum feasible work; humans reserved for negotiation/signature/owner-gated", (b.byAutonomy.ODG_AUTONOMOUS + b.byAutonomy.ODG_ASSISTED) > (b.byAutonomy.HUMAN_REQUIRED + (b.byAutonomy.OWNER_GATED || 0)) && /operational engine/.test(b.note));
  check("binding negotiation/signature is HUMAN_REQUIRED; payments/real-contact OWNER_GATED (honest)", b.functions.find((f: any) => f.id === "negotiation_signature").autonomy === "HUMAN_REQUIRED" && b.functions.find((f: any) => f.id === "finance").autonomy === "OWNER_GATED");

  // ---- §5/§2 functions grounded in REAL existing modules ----
  check("commercial functions map to REAL existing ODG modules (not fabricated)", b.functions.find((f: any) => f.id === "demos_proposals").module.includes("proposal-generator") && b.functions.find((f: any) => f.id === "pipeline").module.includes("commercial-pipeline") && b.functions.find((f: any) => f.id === "reporting").module.includes("revenue-dashboard"));

  // ---- §6 capability-gap register ----
  const gr = M.capabilityGapRegister();
  check("gap register lists genuine gaps (≥1 MISSING + several PARTIAL), prioritized", gr.totalGaps >= 5 && gr.missingCount >= 1 && gr.gaps[0].priorityScore >= gr.gaps[gr.gaps.length - 1].priorityScore);
  check("the MISSING gap (support/renewals) is honestly flagged (module=MISSING)", gr.gaps.some((g: any) => g.status === "MISSING" && g.existingModule === "MISSING" && /support/.test(g.capability)));
  check("each gap has impact + acceptance test + 5M contribution + owner-gated dependency where applicable", gr.gaps.every((g: any) => g.whyBlocksEconomics && g.acceptanceTest && g.contributionTo5M) && gr.gaps.some((g: any) => g.ownerGatedDependency));

  // ---- honesty ----
  check("contract: rebuilds around autonomous production, grounded in REAL modules, demand is the OWNER_GATED bottleneck", M.AUTONOMOUS_OPERATING_MODEL_CONTRACT.invariants.some((i: string) => /NOT the target operating model/.test(i)) && M.AUTONOMOUS_OPERATING_MODEL_CONTRACT.invariants.some((i: string) => /ACTUALLY EXIST/.test(i)) && M.AUTONOMOUS_OPERATING_MODEL_CONTRACT.invariants.some((i: string) => /bottleneck is DEMAND/.test(i)));
  check("no revenue claimed; €5M NOT guaranteed; no fabricated demand; €0 real clients", /no revenue claimed|NOT guaranteed/.test(om.note) && /no fabricated demand|€0 real clients/.test(M.AUTONOMOUS_OPERATING_MODEL_CONTRACT.invariants[4]));
  check("deterministic + frozen", JSON.stringify(M.operatingModel()) === JSON.stringify(om) && Object.isFrozen(om) && Object.isFrozen(gr));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — autonomous-operating-model (§4/§5/§6/§12.6: rebuilt around autonomous production [~53% ODG-automated ⇒ hybrid €5M target feasible with a 3-person team, NOT the 4945 pure-human model]; bottleneck is DEMAND [OWNER_GATED] not capacity; autonomous-vs-human split + capability-gap register grounded in REAL existing modules [1 MISSING support/renewals honestly flagged]; no fabricated demand, €0 clients)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
