#!/usr/bin/env node
"use strict";
/* Tests for odg-native-escalation (V327 §4 native→provider escalation). Proves escalation is EVIDENCE-GATED (only on a
 * CALIBRATED-LOW policy + a real local failure), honestly attributed CLAUDE_CODE_PROVIDER, and hands off via the EXISTING
 * sovereign-delegation chain. Composes the real policy + sovereign-delegation. Deterministic (synthetic histories). */
const M = require("./odg-native-escalation.js");
const POLICY = require("./odg-local-model-execution-policy.js");
const SD = require("./odg-sovereign-delegation.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const h = (s: number, f: number): any[] => [...Array(s).fill(0).map(() => ({ missionType: "t", verified: true })), ...Array(f).fill(0).map(() => ({ missionType: "t", verified: false }))];
const task = { id: "topo", type: "t" };

function main(): void {
  const lowPol = POLICY.chooseExecutionPolicy("t", h(4, 16));   // CALIBRATED low ⇒ escalateIfStillFails true
  const thinPol = POLICY.chooseExecutionPolicy("t", h(2, 1));   // thin ⇒ PROBE, no escalate flag
  const highPol = POLICY.chooseExecutionPolicy("t", h(18, 2));  // CALIBRATED high ⇒ cheap, no escalate flag

  // local accepted ⇒ never escalate (regardless of policy)
  check("local attempt ACCEPTED ⇒ no escalation", M.decideEscalation({ task, policyResult: lowPol, localAttemptAccepted: true }).escalate === false);

  // CALIBRATED-low + local failed ⇒ ESCALATE via sovereign-delegation, attributed to the provider
  const esc = M.decideEscalation({ task, policyResult: lowPol, localAttemptAccepted: false });
  check("CALIBRATED-low + local failure ⇒ escalate=true, attribution CLAUDE_CODE_PROVIDER (honest fallback)", esc.escalate === true && esc.attribution === "CLAUDE_CODE_PROVIDER");
  check("escalation hands off a sovereign-delegation mission (CREATED, authority ODG) — reuses the deny-by-default chain", esc.delegation && esc.delegation.state === "CREATED" && esc.delegation.authority === "ODG" && esc.delegation.missionId === "topo");
  check("the handoff is a REAL sovereign mission (its state is in the chain's STATES)", SD.STATES.includes(esc.delegation.state));

  // EVIDENCE GATE: thin/unknown ⇒ NO escalation (keep probing; never premature)
  const thin = M.decideEscalation({ task, policyResult: thinPol, localAttemptAccepted: false });
  check("thin/UNKNOWN policy + local failure ⇒ NO escalation (evidence-gated, keep probing)", thin.escalate === false && thin.delegation === null && /evidence-gated/.test(thin.reason));

  // CALIBRATED-high fluke failure ⇒ NO escalation (retry locally, not escalate)
  const high = M.decideEscalation({ task, policyResult: highPol, localAttemptAccepted: false });
  check("CALIBRATED-high + a fluke local failure ⇒ NO escalation (policy did not flag it)", high.escalate === false && high.delegation === null);

  // honesty: escalation is never a native success; attribution is the provider
  check("escalation note: result NEVER attributed to ODG-native autonomy", /NEVER attributed to ODG-native autonomy/.test(esc.note));
  check("no-escalation path attributes ODG_LOCAL_MODEL_EXECUTION (the local attempt), not the provider", thin.attribution === "ODG_LOCAL_MODEL_EXECUTION");

  // fail-closed + frozen + contract
  check("fail-closed: empty input ⇒ no escalation (no policy flag)", M.decideEscalation({}).escalate === false && M.decideEscalation(null).escalate === false);
  check("frozen + deterministic", Object.isFrozen(esc) && JSON.stringify(M.decideEscalation({ task, policyResult: lowPol, localAttemptAccepted: false })) === JSON.stringify(M.decideEscalation({ task, policyResult: lowPol, localAttemptAccepted: false })));
  check("contract: evidence-gated, provider-attributed, reuses sovereign-delegation, no engine",
    M.NATIVE_ESCALATION_CONTRACT.invariants.some((s: string) => /escalation is evidence-gated, never premature/.test(s)) &&
    M.NATIVE_ESCALATION_CONTRACT.invariants.some((s: string) => /NEVER a fabricated ODG-native success/.test(s)) &&
    M.NATIVE_ESCALATION_CONTRACT.reuses.some((s: string) => /sovereign-delegation.createMission/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-native-escalation (V327 §4: evidence-gated native→provider escalation; escalate ONLY on CALIBRATED-low + real local failure [thin⇒keep probing, high-fluke⇒retry local, accepted⇒never]; honest CLAUDE_CODE_PROVIDER attribution [never a fabricated native success]; hands off a REAL sovereign-delegation mission [CREATED, authority ODG, deny-by-default chain]; composes policy + sovereign-delegation; fail-closed/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
