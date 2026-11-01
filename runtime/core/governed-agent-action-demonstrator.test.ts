// @ts-nocheck
// governed-agent-action-demonstrator — gate→charter→(resistance) composition. A well-formed authenticated,
// in-scope proposal ⇒ ADMIT chartered; a scope-escape / malformed contract / unauthenticated ⇒ DENY fail-closed;
// a human-gated/consequential tool ⇒ ESCALATE (never auto-admit); execution authority never granted; an optional
// resistance probe reports honestly; determinism holds.
"use strict";
const assert = require("assert");
const D = require("./governed-agent-action-demonstrator.js");
const MCC = require("./misleading-case-corpus.js");

let n = 0; const ok = (name, cond) => { n++; assert.ok(cond, name); };
const contract = { agentId: "a1", allowedTools: ["read"], authorizedScope: ["src"], limits: { maxCalls: 10, maxDurationMs: 1000 } };
const proposal = { agentId: "a1", authToken: "tok", tool: "read", params: {}, targetPaths: ["src/file.ts"] };
const state = { calls: 0, elapsedMs: 0 };

// (1) ADMIT: well-formed authenticated in-scope ⇒ GOVERNED_AGENT_DECISION, chartered, exec NOT authorized.
(() => {
  const r = D.runGovernedAgentAction({ proposal, contract, state });
  ok("admit: verdict DECIDED", r.ok && r.verdict === D.VERDICT.DECIDED);
  ok("admit: gateVerdict ADMIT", r.summary.gateVerdict === "ADMIT");
  ok("admit: chartered true", r.summary.chartered === true);
  // HONEST gate property: a gate verdict alone is NEVER an authenticated/tenant-bound admission — authenticated
  // is always false; the demonstrator surfaces that (and the matching gap) rather than overclaiming.
  ok("admit: authenticated false (gate does not authenticate — honest)", r.summary.authenticated === false);
  ok("admit: a not-authenticated honesty gap is surfaced even on ADMIT", r.gaps.some((g) => /not authenticated/i.test(g)));
  ok("admit: executionAuthorized ALWAYS false (never granted here)", r.summary.executionAuthorized === false);
  // pin the SEALED charter's embedded verdict label (tamper-evident provenance must not be mislabelled).
  ok("admit: chartered verdict.outcome ACCEPT (sealed label pinned)", r.steps.charter.charter.verdict.outcome === "ACCEPT");
})();

// (2) DENY — scope escape (targetPath outside authorizedScope) ⇒ fail-closed.
(() => {
  const r = D.runGovernedAgentAction({ proposal: { ...proposal, targetPaths: ["/etc/passwd"] }, contract, state });
  ok("escape: gateVerdict DENY", r.summary.gateVerdict === "DENY");
  ok("escape: a DENY gap reported", r.gaps.some((g) => /DENIED/i.test(g)));
  ok("escape: chartered verdict.outcome REJECT (sealed label pinned)", r.steps.charter.charter.verdict.outcome === "REJECT");
})();

// (3) DENY — malformed/absent contract ⇒ fail-closed structural DENY.
(() => {
  const r = D.runGovernedAgentAction({ proposal, contract: null, state });
  ok("malformed: gateVerdict DENY (fail-closed)", r.summary.gateVerdict === "DENY");
})();

// (4) DENY — unauthenticated (no authToken) ⇒ fail-closed.
(() => {
  const r = D.runGovernedAgentAction({ proposal: { agentId: "a1", tool: "read", params: {}, targetPaths: ["src/f.ts"] }, contract, state });
  ok("unauth: gateVerdict DENY", r.summary.gateVerdict === "DENY");
})();

// (5) ESCALATE — a human-gated tool ⇒ never auto-admit.
(() => {
  const c = { ...contract, allowedTools: ["read", "deploy"], requireHumanFor: ["deploy"] };
  const r = D.runGovernedAgentAction({ proposal: { ...proposal, tool: "deploy" }, contract: c, state });
  ok("escalate: gateVerdict ESCALATE", r.summary.gateVerdict === "ESCALATE");
  ok("escalate: an escalation gap reported", r.gaps.some((g) => /ESCALATED/i.test(g)));
  ok("escalate: chartered verdict.outcome UNKNOWN (sealed label pinned)", r.steps.charter.charter.verdict.outcome === "UNKNOWN");
})();

// (6) optional resistance probe reports honestly (perfect evaluator ⇒ 0 fooled; blind evaluator ⇒ >0 fooled).
(() => {
  const perfect = (cse) => ({ detected: [...cse.expectedAreas] });
  const blind = () => ({ detected: [] });
  const rp = D.runGovernedAgentAction({ proposal, contract, state, evaluateFn: perfect });
  ok("resistance perfect: falseSuccessRate 0", rp.summary.resistance && rp.summary.resistance.falseSuccessRate === 0);
  const rb = D.runGovernedAgentAction({ proposal, contract, state, evaluateFn: blind });
  ok("resistance blind: fooled > 0 (honest gap surfaced)", rb.summary.resistance && rb.summary.resistance.fooled > 0 && rb.gaps.some((g) => /fooled/i.test(g)));
})();

// (7) HONESTY + bad-input + determinism.
(() => {
  const r = D.runGovernedAgentAction({ proposal, contract, state });
  ok("honesty: basis AGENT_ACTION_GOVERNANCE_NOT_EXECUTION", r.basis === "AGENT_ACTION_GOVERNANCE_NOT_EXECUTION");
  ok("honesty: note says never executes / never grants execution authority", /never executes|never grants execution/i.test(r.note));
  ok("bad-input: non-object ⇒ INVALID_INPUT", D.runGovernedAgentAction(null).code === "INVALID_INPUT");
  const a = D.runGovernedAgentAction({ proposal, contract, state });
  const b = D.runGovernedAgentAction({ proposal, contract, state });
  ok("determinism: identical gateVerdict", a.summary.gateVerdict === b.summary.gateVerdict);
})();

console.log(`governed-agent-action-demonstrator: ${n} checks passed`);
