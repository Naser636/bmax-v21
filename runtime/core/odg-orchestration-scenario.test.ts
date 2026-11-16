#!/usr/bin/env node
"use strict";
/* V240 Phase-1 — multi-executor orchestration on the REAL components. Proves (by driving odg-mission-orchestrator +
 * campaign-controller + odg-program-continuity): least-privilege permissions (overreach/undeclared/self-authorizing
 * DENIED), scope isolation (out-of-scope write REFUSED), INDEPENDENT evaluation (self-cert / shared-critical-dep / no-
 * evidence REJECTED), parent-closes-only-when-children-admit, blocked child ≠ freeze, resume-without-redo, obsolete-proof
 * revalidation; no 2nd orchestrator; deterministic + frozen. */
const OS = require("./odg-orchestration-scenario.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const r = OS.run({});
  const v = r.verdicts;

  check("all orchestration properties hold on the REAL components", r.allHold === true);
  check("least-privilege permissions: authorized ALLOW; overreach / undeclared-capability / self-authorizing DENIED", v.permissionLeastPrivilege === true);
  check("scope isolation: in-scope write admitted, out-of-scope write REFUSED (delegate-isolation)", v.isolationEnforced === true);
  check("INDEPENDENT evaluation: self-certification + shared-critical-dep + no-evidence all REJECTED; independent ADMIT", v.independentEvalNoSelfCert === true);
  check("parent closes ONLY when every mandatory child is ADMITted (one reject ⇒ parent not closed)", v.parentClosesOnlyWhenChildrenAdmit === true);
  check("a BLOCKED child never freezes independent children (C1,C2 proceed)", v.blockedChildNotFreeze === true);
  check("parent closes after its own deps; a child depending on a blocked child stays OPEN (inadmissible)", v.parentClosedAfterDeps === true && v.dependentChildBlockedStaysOpen === true);
  check("resume without redo: no ACCEPTED child re-executed after interruption", v.resumeNoRedo === true);
  check("obsolete proof (component changed) ⇒ requiresRevalidation via program-continuity", v.obsoleteProofRevalidated === true);

  // V240 hardening guard: whitespace-only evidence is NOT evidence (independentQualityGate must REJECT, not ADMIT).
  const ORCH = require("./odg-mission-orchestrator.js");
  const wsGate = ORCH.independentQualityGate({ evidence: ["   \t\n "] }, { builder: { id: "b", model: "m1" }, verifier: { id: "v", model: "m2" } });
  check("evidence discipline hardened: whitespace-only evidence ⇒ REJECT (not ADMIT)", wsGate.decision === "REJECT" && wsGate.evidenceComplete === false);

  check("honest maturity: INTEGRATED demonstration on real components, NOT live production", /INTEGRATED_DEMONSTRATION_ON_REAL_COMPONENTS/.test(r.maturity) && /NOT live production/.test(r.maturity));
  check("deterministic + frozen", JSON.stringify(OS.run({})) === JSON.stringify(r) && Object.isFrozen(r) && Object.isFrozen(r.verdicts));
  check("contract: drives real orchestrator, least-privilege + isolation + independent eval, no 2nd orchestrator", OS.ORCHESTRATION_SCENARIO_CONTRACT.invariants.some((i: string) => /builds NO second orchestrator/.test(i)) && OS.ORCHESTRATION_SCENARIO_CONTRACT.invariants.some((i: string) => /producer ≠ validator/.test(i)) && OS.ORCHESTRATION_SCENARIO_CONTRACT.invariants.some((i: string) => /NOT live production/.test(i)));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — orchestration-scenario (V240 Phase-1: parent→children on REAL odg-mission-orchestrator + campaign-controller + program-continuity — least-privilege permissions, scope isolation, independent evaluation [no self-cert/shared-critical], parent-closes-only-when-children-admit, blocked≠freeze, resume-no-redo, obsolete-proof revalidation; no 2nd orchestrator; INTEGRATED demo not production)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
