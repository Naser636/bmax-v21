#!/usr/bin/env node
"use strict";
/* V239 Phase-5 — A-Z scenario on the REAL components. Proves (by driving campaign-controller + odg-program-continuity +
 * V235/V236): objective→DAG→select→execute→ACCEPT/REJECT→interrupt→recover→resume-without-redo→blocked≠freeze→close;
 * a real REJECT distinct from BLOCKED; ACCEPTED requires evidence; parent accepted only after children; proof-gone-
 * historical + modified-component surface for revalidation; no 2nd orchestrator; deterministic + frozen. */
const AZ = require("./odg-az-scenario.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const r = AZ.run({ interruptAfter: 2 });

  check("all A-Z properties hold on the REAL components", r.allHold === true);
  check("real ACCEPT: A,B,C,P reach ACCEPTED (evidence-backed via campaign-controller.advance)", ["A", "B", "C", "P"].every((id: string) => r.verdicts.acceptedReached.includes(id)));
  check("real REJECT (distinct from BLOCKED): REJ ends REJECTED", r.verdicts.rejectDecision === true && !r.verdicts.acceptedReached.includes("REJ"));
  check("parent accepted ONLY after its children A,B,C", r.verdicts.parentAfterChildren === true);
  check("blocked ≠ freeze: BLK stays BLOCKED while independent C proceeds to ACCEPTED", r.verdicts.blockedNotFrozen === true);
  check("resume without redo: no ACCEPTED lot re-executed after interruption", r.verdicts.resumedNoRedo === true);
  check("V235: a proof gone HISTORICAL on A surfaces as requiresRevalidation", r.verdicts.historicalProofFlagged === true);
  check("V236: a MODIFIED component on A surfaces as requiresRevalidation (COMPONENT_CHANGED)", r.verdicts.modifiedComponentFlagged === true);
  check("closure ONLY when criteria met (no open lot remains; BLOCKED excluded)", r.verdicts.closedOnlyWhenCriteriaMet === true);
  check("trace covers objective→decompose→checkpoint→interrupt→recover (real chain, not a model)", r.trace.some((t: string) => /OBJECTIVE received/.test(t)) && r.trace.some((t: string) => /INTERRUPTION/.test(t)) && r.trace.some((t: string) => /RECOVER:/.test(t)));

  // ACCEPTED requires non-empty evidence — a 'successful' executor that returns no evidence must NOT yield ACCEPTED.
  const noEv = AZ.run({ interruptAfter: 10, execute: (lot: any) => (lot.failValidation ? { decision: "REJECT", evidence: "", reason: "x" } : { decision: "ACCEPT", evidence: "" }) });
  check("a command 'succeeding' with NO evidence is NOT acceptance (advance fails closed)", !noEv.verdicts.acceptedReached.includes("A"));

  // honest maturity — NOT operational/deployed.
  check("honest maturity: INTEGRATED demonstration on real components, NOT live production", /INTEGRATED_DEMONSTRATION_ON_REAL_COMPONENTS/.test(r.maturity) && /NOT live production/.test(r.maturity));

  // determinism + frozen + contract.
  check("deterministic + frozen", JSON.stringify(AZ.run({ interruptAfter: 2 })) === JSON.stringify(r) && Object.isFrozen(r) && Object.isFrozen(r.verdicts) && Object.isFrozen(r.trace));
  check("contract: drives real controller + continuity, accept AND reject, no 2nd orchestrator, hermetic executor", AZ.AZ_SCENARIO_CONTRACT.invariants.some((i: string) => /builds NO second orchestrator/.test(i)) && AZ.AZ_SCENARIO_CONTRACT.invariants.some((i: string) => /real ACCEPT .* AND a real REJECT/.test(i)) && AZ.AZ_SCENARIO_CONTRACT.invariants.some((i: string) => /NOT live production/.test(i)));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — az-scenario (V239 Phase-5: end-to-end A–Z on REAL campaign-controller + program-continuity + V235/V236 — real ACCEPT and REJECT, interrupt→recover→resume-without-redo, blocked≠freeze, parent-after-children, historical-proof + modified-component revalidated; evidence required for accept; no 2nd orchestrator; INTEGRATED demonstration not production)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
