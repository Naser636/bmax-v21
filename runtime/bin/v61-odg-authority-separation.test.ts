#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V61 — ODG-AUTHORITY / PROVIDER-SEPARATION non-regression test. V61 is a PERMANENT governance rule: ODG is
 * the sole authority (decision, validation, closure); the technical provider only executes an explicit ODG-scoped task
 * and NEVER self-authorizes, self-validates, self-promotes, or auto-admits a consequential action. This test does NOT add
 * a new primitive — it proves the EXISTING canonical mechanisms already enforce the separation, and locks it against
 * regression. Fail-closed.
 */

const RT = require("../core/root-of-trust.js");
const EI = require("../core/evaluator-independence.js");
const SI = require("../core/self-improvement.js");
const GATE = require("../core/third-party-agent-gate.js");
const AG = require("../core/action-gate.js");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

async function main(): Promise<void> {
  // (1) The provider cannot GRANT ITSELF authority over a protected/governance change (root-of-trust).
  const self = RT.admitGovernanceChange({ actor: "provider", target: "runtime/policies/p.json", actionClass: "WRITE", elevatedAuthorization: { by: "provider", approved: true } }, {});
  check("provider self-authorization of a protected change ⇒ BLOCKED", self.blocked === true);
  const selfAuthored = RT.admitGovernanceChange({ actor: "provider", target: "runtime/governance/ROADMAP.json", actionClass: "WRITE", elevatedAuthorization: { by: "odg", selfAuthored: true, approved: true } }, {});
  check("selfAuthored elevation ⇒ BLOCKED (no self-grant of authority)", selfAuthored.blocked === true);

  // (2) The provider cannot VALIDATE ITS OWN work (evaluator-independence: builder==verifier ⇒ COMPROMISED).
  const selfCert = EI.auditIndependence({ builder: { id: "provider", model: "m" }, verifier: { id: "provider", model: "m2" } });
  check("provider validating its own work (builder==verifier) ⇒ COMPROMISED", selfCert.verdict === "COMPROMISED" && selfCert.selfCertification === true);
  check("independent validator (ODG controller ≠ provider) ⇒ INDEPENDENT", EI.auditIndependence({ builder: { id: "provider", model: "m1", data: "d1" }, verifier: { id: "odg-controller", model: "m2", data: "d2" } }).verdict === "INDEPENDENT");

  // (3) A capability cannot SELF-PROMOTE into the system (self-improvement: promotion is an external/ODG decision).
  const si = await SI.runSelfImprovement({ id: "provider-capability" }, {});
  check("capability never self-promotes (promotion external / ODG decision)", si.promoted !== true && (si.promotionIsExternal === true || si.ok === false));

  // (4) A provider agent cannot AUTO-ADMIT a consequential/irreversible action (third-party gate ⇒ DENY/ESCALATE).
  const CONTRACT: any = { agentId: "provider-agent", objective: "do scoped task", allowedTools: ["read_file"], authorizedScope: ["reports"], limits: { maxCalls: 5, maxDurationMs: 60000 }, requireHumanFor: ["deploy"] };
  const S0 = { calls: 0, elapsedMs: 0 };
  const offScope = GATE.evaluateAgentAction({ agentId: "provider-agent", authToken: "t", tool: "deploy", params: {}, targetPaths: ["reports/x"] }, CONTRACT, S0);
  check("provider agent off-allowlist/consequential tool ⇒ NOT auto-ADMIT (DENY/ESCALATE)", offScope.verdict !== "ADMIT");

  // (5) deny-by-default admission: a consequential action with no AUTHORITY ⇒ DENY; irreversible ⇒ ESCALATE unless human.
  const noAuth = { principal: "provider", verb: "apply", target: "runtime/x.js", actionClass: "WRITE", contract: { id: "C-1" }, policy: "LOCAL_FIRST" };
  check("consequential action with NO authority ⇒ DENY (deny-by-default)", AG.evaluateAction(noAuth, {}).decision === "DENY");
  const validTransition = { state_before: { v: 1 }, action: { do: "delete" }, observed_effect: { removed: true }, state_after: { v: 2 }, state_version_before: 1, state_version_after: 2, difference: { v: { before: 1, after: 2 } }, evidence_refs: [], verification_status: "RECORDED" };
  const irreversible = { principal: "odg", verb: "apply", target: "runtime/x.js", actionClass: "DELETE", authority: { id: "A" }, contract: { id: "C" }, policy: "LOCAL_FIRST", reversibility: "R0", expectedTransition: validTransition };
  check("fully-admissible irreversible action ⇒ ESCALATE (human authority required; provider cannot self-clear)", AG.evaluateAction(irreversible, {}).decision === "ESCALATE");

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V61 ODG-authority / provider-separation enforced by existing mechanisms (no new primitive)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
