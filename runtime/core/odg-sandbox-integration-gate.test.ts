#!/usr/bin/env node
"use strict";
/* V232 §8 — sandbox auto-integration decision gate. Proves: deny-by-default (all 12 ⇒ INTEGRATE); any contract/permission/
 * security violation ⇒ REJECT; soft miss ⇒ RETURN_TO_EXPERIMENT; significant change w/o inspection ⇒ RETURN (never
 * INTEGRATE); INTEGRATE ≠ DEPLOY (deploy always owner-gated); missing key = unsatisfied; deterministic + frozen. */
const G = require("./odg-sandbox-integration-gate.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const ALL: any = { linkedToV124: true, needDemonstrated: true, codeAndDepsReviewed: true, isolatedExperiment: true, baselineRecorded: true, functionalTestsPass: true, nonRegressionPass: true, measurableGainOrNewCapability: true, noContractOrPermissionViolation: true, securityValidated: true, independentInspection: true, rollbackAvailable: true };

function main() {
  const ok = G.decide(ALL);
  check("ALL 12 conditions satisfied ⇒ INTEGRATE (merge-eligible), satisfiedCount 12/12", ok.verdict === "INTEGRATE" && ok.satisfiedCount === 12 && ok.total === 12 && ok.hardViolations.length === 0);
  check("INTEGRATE ≠ DEPLOY: deploy stays OWNER_GATED; reason says NOT deployed", ok.deployStillOwnerGated === true && /NOT deployed/.test(ok.reason) && /OWNER_GATED/.test(ok.note));

  // deny-by-default: an empty/missing evidence ⇒ not satisfied
  check("deny-by-default: missing evidence ⇒ conditions unsatisfied ⇒ NOT INTEGRATE", G.decide({}).verdict !== "INTEGRATE" && G.decide(undefined).verdict !== "INTEGRATE");

  // hard violation ⇒ REJECT (not retry)
  check("a contract/permission violation ⇒ REJECT (hard stop, not RETURN)", G.decide({ ...ALL, noContractOrPermissionViolation: false }).verdict === "REJECT" && G.decide({ ...ALL, noContractOrPermissionViolation: false }).hardViolations.includes("noContractOrPermissionViolation"));
  check("a security-validation failure ⇒ REJECT (hard stop)", G.decide({ ...ALL, securityValidated: false }).verdict === "REJECT" && G.decide({ ...ALL, securityValidated: false }).hardViolations.includes("securityValidated"));

  // soft miss ⇒ RETURN_TO_EXPERIMENT (fixable)
  const noBaseline = G.decide({ ...ALL, baselineRecorded: false, functionalTestsPass: false });
  check("a missing baseline / failing test ⇒ RETURN_TO_EXPERIMENT with the unsatisfied conditions listed", noBaseline.verdict === "RETURN_TO_EXPERIMENT" && noBaseline.softMissing.includes("baselineRecorded") && noBaseline.softMissing.includes("functionalTestsPass") && noBaseline.hardViolations.length === 0);

  // significant change without inspection ⇒ RETURN (VALIDATION_PENDING), never INTEGRATE
  const noInspSignificant = G.decide({ ...ALL, independentInspection: false, significant: true });
  check("significant change WITHOUT independent inspection ⇒ RETURN (VALIDATION_PENDING), never INTEGRATE", noInspSignificant.verdict === "RETURN_TO_EXPERIMENT" && /VALIDATION_PENDING/.test(noInspSignificant.reason));
  // a non-significant change may integrate without a separate inspection (inspection auto-satisfied)
  const nonSignificant = G.decide({ ...ALL, independentInspection: false, significant: false });
  check("a NON-significant change does not require a separate inspection (auto-satisfied) ⇒ can INTEGRATE", nonSignificant.verdict === "INTEGRATE" && nonSignificant.significant === false);

  check("both hard + soft failing ⇒ REJECT dominates (a violation is never 'just retry')", G.decide({ ...ALL, securityValidated: false, baselineRecorded: false }).verdict === "REJECT");
  check("contract: deny-by-default, violation⇒REJECT, significant-needs-inspection, INTEGRATE≠DEPLOY", G.SANDBOX_INTEGRATION_GATE_CONTRACT.invariants.some((i: string) => /DENY-BY-DEFAULT/.test(i)) && G.SANDBOX_INTEGRATION_GATE_CONTRACT.invariants.some((i: string) => /REJECT \(hard stop/.test(i)) && G.SANDBOX_INTEGRATION_GATE_CONTRACT.invariants.some((i: string) => /merge-eligible decision ONLY/.test(i)));
  check("deterministic + frozen", JSON.stringify(G.decide(ALL)) === JSON.stringify(ok) && Object.isFrozen(ok) && Object.isFrozen(G.CONDITIONS) && G.CONDITIONS.length === 12);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — sandbox-integration-gate (V232 §8: deny-by-default 12-condition decision; ALL⇒INTEGRATE [merge-eligible, NOT deploy]; contract/permission/security violation⇒REJECT; soft miss⇒RETURN_TO_EXPERIMENT; significant-no-inspection⇒RETURN; deploy always OWNER_GATED)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
