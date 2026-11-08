#!/usr/bin/env node
"use strict";

/*
 * WI-P2-20 — P2 REFERENCE AGENTS + ODG-PILOTED CAMPAIGN (§54/§5). Builds 5 reference agents via the REAL
 * Agent Factory (researcher/analyst/builder/verifier/qa) — each contract-bound and permission-confined — and
 * runs a reference campaign DRIVEN BY ODG'S REAL campaign-loop (runCampaignLoop): ODG selects the next mission,
 * the agent pipeline executes it under a SIMULATED provider (EXPLICITLY labelled — no live model is claimed),
 * and ODG accepts/refuses via its evidence discipline, chaining mission→mission in ONE run. Pure/deterministic
 * (no real model, no clock/random). Dual export.
 */

const AF = require("./agent-factory");
const LOOP = require("./campaign-loop");

// Per-role contracts (authorizedPaths/allowedTools/budget) — each agent is confined to its own write-set.
const ROLE_SPECS = Object.freeze([
  { id: "researcher", role: "Researcher", model: "sim", config: {}, contract: { objective: "collect local info", authorizedPaths: ["runtime/generated/research/"], allowedTools: ["Read", "Grep"], budget: { maxCalls: 20 } }, tools: ["Read"], tests: ["t-research"] },
  { id: "analyst", role: "Analyst", model: "sim", config: {}, contract: { objective: "analyse + detect anomalies", authorizedPaths: ["runtime/generated/analysis/"], allowedTools: ["Read"], budget: { maxCalls: 20 } }, tools: ["Read"], tests: ["t-analyze"] },
  { id: "builder", role: "Builder", model: "sim", config: {}, contract: { objective: "build within write-set", authorizedPaths: ["runtime/core/sandbox/"], allowedTools: ["Edit", "Bash"], budget: { maxCalls: 30 } }, tools: ["Edit"], tests: ["t-build"] },
  { id: "verifier", role: "Verifier", model: "sim", config: {}, contract: { objective: "independent verification", authorizedPaths: ["runtime/generated/verify/"], allowedTools: ["Read", "Bash"], budget: { maxCalls: 20 } }, tools: ["Read"], tests: ["t-verify"] },
  { id: "qa", role: "QA", model: "sim", config: {}, contract: { objective: "quality + regression", authorizedPaths: ["runtime/generated/qa/"], allowedTools: ["Read", "Bash"], budget: { maxCalls: 20 } }, tools: ["Read"], tests: ["t-qa"] },
]);

/** referenceAgents() -> { ok, agents } the 5 contract-bound agents (via the real Agent Factory). */
function referenceAgents(): any {
  const agents: any = {}; const errors: any[] = [];
  for (const spec of ROLE_SPECS) { const r = AF.defineAgent(spec); if (r.ok) agents[spec.id] = r.agent; else errors.push({ id: spec.id, violations: r.violations }); }
  return Object.freeze({ ok: errors.length === 0, agents: Object.freeze(agents), errors: Object.freeze(errors), providerKind: "SIMULATED" });
}

// A SIMULATED provider step per role (deterministic; NO live model). Returns a result + evidence.
function agentStep(role: any, input: any, inject: any): any {
  if (inject === ("provider-error:" + role)) return { ok: false, reason: "PROVIDER_ERROR" };
  if (inject === ("timeout:" + role)) return { ok: false, reason: "TIMEOUT" };
  if (role === "verifier" && inject === "disagreement") return { ok: true, output: { verified: false }, evidence: [] }; // Verifier disagrees with Builder
  if (inject === ("no-evidence:" + role)) return { ok: true, output: { done: true }, evidence: [] };
  return { ok: true, output: { role, handled: true }, evidence: ["ev-" + role] };
}

/**
 * runAgentCampaign(opts) -> { stopped, accepted, missions, loop }. Drives ODG's REAL campaign-loop over a
 * synthetic, dependency-chained register (research→analyze→build→verify→qa). opts.inject injects one failure.
 */
function runAgentCampaign(opts?: any): any {
  const o = opts && typeof opts === "object" ? opts : {};
  const inject = o.inject || null;
  const chain = ["researcher", "analyst", "builder", "verifier", "qa"];
  const items = chain.map((id, i) => ({ id: "m-" + id, title: "reference mission " + id, status: "READY", program: "P2", priority: 5, deps: i === 0 ? [] : ["m-" + chain[i - 1]], evidence: "" }));
  const register: any = { version: "ref-campaign/1", items };

  const execute = (lot: any): any => {
    const role = String(lot.id).replace(/^m-/, "");
    const step = agentStep(role, o.input, inject);
    if (!step.ok) return { status: "FAILED", reason: step.reason, retryable: false };
    if (role === "verifier" && step.output && step.output.verified === false) return { status: "FAILED", reason: "verifier disagrees with builder (independent check failed)", retryable: false };
    if (!Array.isArray(step.evidence) || step.evidence.length === 0) return { status: "FAILED", reason: "missing evidence (acceptance refused)", retryable: false };
    return { status: "ACCEPTED", evidence: step.evidence.join(";") };
  };

  const res = LOOP.runCampaignLoop({ register, execute, maxIterations: 50, onPersist: () => {} });
  const accepted = (register.items || []).filter((it: any) => it.status === "ACCEPTED").map((it: any) => it.id);
  return Object.freeze({ stopped: res.stopped, reason: res.reason, accepted: Object.freeze(accepted), missions: items.length, providerKind: "SIMULATED", loop: res });
}

const REFERENCE_AGENTS_CONTRACT = Object.freeze({
  id: "WI-P2-20-REFERENCE-AGENTS",
  source: "P2 — 5 reference agents via Agent Factory, driven by ODG's real campaign-loop; SIMULATED providers (no live model)",
  roles: Object.freeze(ROLE_SPECS.map((s: any) => s.role)),
  notAuthority: "agents are DEFINED/configured/tested here and run under a SIMULATED provider; none is claimed to have executed a real consequential mission (D4 owner-gated)",
  invariants: Object.freeze([
    "agents are built by the real Agent Factory (contract-bound, permission-confined)",
    "the campaign is driven by ODG's real campaign-loop (select→execute→accept→checkpoint→next) — Claude Code only supplies the execute delegate",
    "provider is SIMULATED and explicitly labelled; no live model is claimed",
    "adversarial outcomes (provider error / timeout / missing evidence / builder↔verifier disagreement) ⇒ mission FAILED, chain halts (fail-closed)",
    "pure/deterministic; D4 consequential execution is NOT performed",
  ]),
});

module.exports = { ROLE_SPECS, REFERENCE_AGENTS_CONTRACT, referenceAgents, agentStep, runAgentCampaign };

if (require.main === module) {
  process.stdout.write(JSON.stringify(REFERENCE_AGENTS_CONTRACT, null, 2) + "\n");
}

export {};
