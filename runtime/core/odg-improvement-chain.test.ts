#!/usr/bin/env node
"use strict";
/* V233 §5 — improvement chain. Proves: the chain CONSUMES the V232 gate's three verdicts end-to-end (INTEGRATE⇒
 * MERGE_ELIGIBLE not deploy; REJECT⇒REJECTED; RETURN⇒RETURNED); real V231 cycle ⇒ INTEGRATE; idempotent (no re-integration);
 * INTEGRATE never deploys; deterministic + frozen. */
const C = require("./odg-improvement-chain.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const d = C.demonstrate();

  check("all THREE gate verdicts are consumed end-to-end (INTEGRATE / REJECT / RETURN)", d.integrateDemonstrated === true && d.rejectDemonstrated === true && d.returnDemonstrated === true);
  const real = d.traces.find((t: any) => t.id === "V231-jidoka-completeness");
  check("REAL past cycle (V231 jidoka, merged #599, gate 672/672, inspection PASS) ⇒ INTEGRATE / MERGE_ELIGIBLE", real.verdict === "INTEGRATE" && real.action === "MERGE_ELIGIBLE" && real.satisfied === "12/12" && /REAL past cycle/.test(real.label));
  check("INTEGRATE never deploys: deployed false, deploy still OWNER_GATED", real.deployed === false && real.deployStillOwnerGated === true && /NOT deployed/.test(real.note) && /OWNER_GATED/.test(real.note));

  const rej = d.traces.find((t: any) => t.id === "demo-security-violation");
  check("a security-validation failure ⇒ REJECTED (hard stop), not integrated", rej.verdict === "REJECT" && rej.action === "REJECTED" && rej.integratedEligible === false && rej.hardViolations.includes("securityValidated"));
  const ret = d.traces.find((t: any) => t.id === "demo-incomplete");
  check("an incomplete experiment (no baseline / failing non-regression) ⇒ RETURNED to experiment", ret.verdict === "RETURN_TO_EXPERIMENT" && ret.action === "RETURNED" && ret.softMissing.includes("baselineRecorded") && ret.integratedEligible === false);

  check("idempotent: re-running an already-integrated experiment ⇒ ALREADY_INTEGRATED_SKIPPED (no repeated integration)", d.idempotent === true);
  check("real cycle is a GENUINE completed improvement, not a synthetic pass; honest consumption framing", /genuine completed improvement, not a synthetic pass/.test(d.realCycle) && /all three gate verdicts are CONSUMED/.test(d.honesty) && /executes no git\/deploy\/network/.test(d.honesty));

  // run() directly: deny-by-default (empty evidence ⇒ not MERGE_ELIGIBLE), and significant-no-inspection ⇒ RETURNED
  check("run() deny-by-default: empty evidence ⇒ not merge-eligible", C.run({ id: "e", evidence: {} }).integratedEligible === false);
  check("contract: consumes the gate (no duplicate), all 3 verdicts, INTEGRATE≠DEPLOY, idempotent", C.IMPROVEMENT_CHAIN_CONTRACT.invariants.some((i: string) => /does NOT re-implement the gate/.test(i)) && C.IMPROVEMENT_CHAIN_CONTRACT.invariants.some((i: string) => /all three verdicts are consumed/.test(i)) && C.IMPROVEMENT_CHAIN_CONTRACT.invariants.some((i: string) => /idempotent/.test(i)));
  check("deterministic + frozen", JSON.stringify(C.demonstrate()) === JSON.stringify(d) && Object.isFrozen(d) && Object.isFrozen(d.traces));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — improvement-chain (V233 §5: consumes the V232 gate's 3 verdicts end-to-end; REAL V231 cycle⇒INTEGRATE/MERGE_ELIGIBLE [not deploy]; security-violation⇒REJECTED; incomplete⇒RETURNED; idempotent; ODG authority; no re-implemented gate)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
