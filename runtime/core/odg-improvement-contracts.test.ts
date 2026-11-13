#!/usr/bin/env node
"use strict";
/* V189-A — prepared improvement contracts. Proves: 5 contracts each with the §3 seven parts; all BLOCKED_AWAITING_
 * ISOLATION (nothing built); write-sets disjoint (parallel-eligible once authorized) but simultaneity NOT_MEASURED;
 * protected paths present; construction gated on ODG authorization + validated isolation. */
const C = require("./odg-improvement-contracts.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const r = C.contracts();
  const byId: any = {}; for (const x of r.contracts) byId[x.id] = x;

  check("exactly 5 contracts for P1/P3/P5/P9/P11", r.count === 5 && r.contracts.map((x: any) => x.metier).sort().join(",") === "P1,P11,P3,P5,P9");
  check("each contract has the §3 seven parts (gap/ref/objective/writeSet/acceptance/deps/evidencePlan)", r.contracts.every((x: any) => x.gap && x.benchmarkRef && x.measurableObjective && x.writeSet.length && x.acceptanceCriteria.length && x.deps.length && x.evidencePlan));
  check("ALL contracts BLOCKED_AWAITING_ISOLATION — nothing built", r.contracts.every((x: any) => x.status === "BLOCKED_AWAITING_ISOLATION") && /construction BLOCKED per V189-A §4/.test(byId["IMP-P1-DORA-VIEW"].note));
  check("benchmark refs trace to the real lots (DORA/SSDF+SLSA/CNCF/FinOps/IDP)", /DORA/.test(byId["IMP-P1-DORA-VIEW"].benchmarkRef) && /SSDF/.test(byId["IMP-P3-SSDF-SLSA"].benchmarkRef) && /CNCF/.test(byId["IMP-P5-CNCF-RATING"].benchmarkRef) && /FinOps/.test(byId["IMP-P9-FINOPS-KPIS"].benchmarkRef) && /IDP/.test(byId["IMP-P11-CONF-CALIB"].benchmarkRef));

  // honesty inside the contracts
  check("P1 keeps deploy-freq NOT_MEASURED until a runtime binding exists", /deploy-frequency stays NOT_MEASURED/.test(byId["IMP-P1-DORA-VIEW"].measurableObjective));
  check("P3 does not claim an unproven SLSA tier", /no unproven tier claim/.test(byId["IMP-P3-SSDF-SLSA"].measurableObjective));
  check("P5 keeps infra provisioning REJECTED/OWNER_GATED (spec-only)", /PROVISIONING stays REJECTED\/OWNER_GATED/i.test(byId["IMP-P5-CNCF-RATING"].measurableObjective));
  check("P11 flags 0.90 STP as a HYPOTHESIS, OCR stays BUILD_CONDITIONAL", /HYPOTHESIS/.test(byId["IMP-P11-CONF-CALIB"].measurableObjective) && /OCR stays a separate BUILD_CONDITIONAL/.test(byId["IMP-P11-CONF-CALIB"].measurableObjective));

  // delegation-ready shape + protected paths
  check("each contract shaped for odg-sovereign-delegation (writeSet/protectedPaths/requiredTests/acceptance/stopConditions)", r.contracts.every((x: any) => x.protectedPaths.includes("runtime/governance/ROADMAP.json") && x.protectedPaths.includes("docs/odg/closure-register.json") && x.requiredTests.length >= 1 && x.stopConditions.length >= 1));

  // parallel-eligibility + simultaneity honesty
  check("write-sets disjoint ⇒ parallel-eligible once authorized", r.allWriteSetsDisjoint === true && C.parallelLot().eligible === true && C.parallelLot().laneCount === 5);
  check("real simultaneity NOT_MEASURED (not simulated)", /NOT_MEASURED/.test(C.parallelLot().simultaneity) && /not simulated/.test(C.parallelLot().simultaneity));

  // construction gate + contract + determinism
  check("CTO build-authorization GRANTED (V192 §3); gate now isolation-only", /GRANTED/.test(r.ctoBuildAuthorization) && /V192 §3/.test(r.ctoBuildAuthorization) && /VALIDATED REAL ISOLATION/.test(r.constructionGate) && /BLOCKED_AWAITING_ISOLATION/.test(r.constructionGate));
  check("contract invariants: preparation-only, nothing built, write-sets disjoint, gated", C.IMPROVEMENT_CONTRACTS_CONTRACT.invariants.some((i: string) => /NO improvement built/.test(i)) && C.IMPROVEMENT_CONTRACTS_CONTRACT.invariants.some((i: string) => /validated isolation required/.test(i)));
  check("deterministic + frozen", JSON.stringify(C.contracts().count) === JSON.stringify(r.count) && Object.isFrozen(r) && Object.isFrozen(C.CONTRACTS));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — improvement-contracts (V189-A: 5 improvement mission-contracts PREPARED [§3 seven parts, delegation-ready]; ALL BLOCKED_AWAITING_ISOLATION — nothing built [§4]; write-sets disjoint ⇒ parallel-eligible once authorized but simultaneity NOT_MEASURED; honesty preserved per contract)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
