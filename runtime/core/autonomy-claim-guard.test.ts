#!/usr/bin/env node
"use strict";
const G = require("./autonomy-claim-guard");
const AP = require("./actor-provenance.js");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
// (1) ODG-attributed work ⇒ NATIVE_AUTONOMOUS admitted.
check(G.evaluateAutonomyClaim({ claimed: "NATIVE_AUTONOMOUS", actor: AP.EXECUTOR.ODG }).admitted === true, "ODG-attributed ⇒ NATIVE_AUTONOMOUS admitted");
// (2) FALSIFICATION — provider-authored work claimed native ⇒ REFUSED + downgraded to PROVIDER_ASSISTED.
{
  const r = G.evaluateAutonomyClaim({ claimed: "NATIVE_AUTONOMOUS", actor: AP.EXECUTOR.TECHNICAL_PROVIDER });
  check(r.admitted === false && r.downgraded === true && r.effectiveClaim === "PROVIDER_ASSISTED", "provider-authored work claimed native ⇒ REFUSED, downgraded to PROVIDER_ASSISTED");
}
// (3) FALSIFICATION — no confident actor (null) claimed native ⇒ REFUSED, downgraded to UNATTRIBUTED.
{
  const r = G.evaluateAutonomyClaim({ claimed: "NATIVE_AUTONOMOUS", actor: null });
  check(r.admitted === false && r.effectiveClaim === "UNATTRIBUTED", "no confident actor ⇒ NATIVE_AUTONOMOUS refused (UNATTRIBUTED)");
}
// (4) provenance from EXECUTION EVIDENCE, not Git author: a report whose provenance resolves to provider ⇒ not native.
{
  // actor-provenance resolves provider-authored-applied-by-provider ⇒ TECHNICAL_PROVIDER
  const report = { executed: [{ authoredBy: "PROVIDER", appliedBy: "technical-provider" }] };
  const resolved = AP.resolveMissionActor(report);
  const r = G.evaluateAutonomyClaim({ claimed: "NATIVE_AUTONOMOUS", report });
  check(r.effectiveClaim !== "NATIVE_AUTONOMOUS", "a mission whose EXECUTION EVIDENCE resolves to non-ODG cannot be declared native (Git author is irrelevant)");
}
// (5) a modest claim is never upgraded; an honest claim matching the actor is admitted.
check(G.evaluateAutonomyClaim({ claimed: "PROVIDER_ASSISTED", actor: AP.EXECUTOR.TECHNICAL_PROVIDER }).admitted === true, "PROVIDER_ASSISTED on provider work ⇒ admitted");
check(G.evaluateAutonomyClaim({ claimed: "PROVIDER_ASSISTED", actor: AP.EXECUTOR.ODG }).admitted === true, "a modest claim under ODG work is admitted (never forced up)");
// (6) contract invariants.
check(/delegated or unattributed realization can never be declared native autonomy/i.test(JSON.stringify(G.AUTONOMY_CLAIM_GUARD_CONTRACT.invariants)), "contract: delegated ≠ native autonomy");
check(/Git author alone is NOT evidence/i.test(JSON.stringify(G.AUTONOMY_CLAIM_GUARD_CONTRACT.invariants)), "contract: Git author insufficient");
if (failures === 0) process.stdout.write("ALL PASS — V12.4 AUTONOMY-CLAIM GUARD\n");
process.exit(failures === 0 ? 0 : 1);
export {};
