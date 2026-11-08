#!/usr/bin/env node
"use strict";

/*
 * WI-P2-20 — reference-agents. Locks: 5 agents built via the real Agent Factory (contract-bound, maturity),
 * permission confinement (over-permissioned spec rejected), ODG's real campaign-loop driving the 5-mission
 * chain to acceptance in ONE run, and the adversarial failure modes (provider error / timeout / missing
 * evidence / builder↔verifier disagreement) halting the chain. SIMULATED provider. Pure.
 * Run: node_modules/.bin/tsx runtime/core/reference-agents.test.ts
 */
const assert = require("assert");
const R = require("./reference-agents");
const AF = require("./agent-factory");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

console.log("WI-P2-20 — P2 REFERENCE AGENTS + ODG-PILOTED CAMPAIGN");

// 5 agents built via the real Agent Factory
{
  const r = R.referenceAgents();
  check(r.ok && Object.keys(r.agents).length === 5, "5 reference agents built via Agent Factory");
  check(r.agents.builder.contractSha.length === 64 && r.agents.builder.maturity === "TESTABLE", "builder is contract-bound (sha) + TESTABLE maturity");
  check(r.providerKind === "SIMULATED", "provider explicitly SIMULATED (no live model claimed)");
  // every agent is permission-confined (writeSet ⊆ its contract.authorizedPaths)
  check(Object.values(r.agents).every((a: any) => a.writeSet.every((p: string) => a.contract.authorizedPaths.some((ap: string) => p === ap || p.startsWith(ap)))), "every agent writeSet ⊆ its contract.authorizedPaths");
}

// permission confinement at build: an over-permissioned spec is REJECTED by the factory
check(AF.defineAgent({ id: "rogue", role: "Builder", contract: { authorizedPaths: ["runtime/core/sandbox/"], allowedTools: ["Edit"] }, writeSet: ["runtime/core/other.ts"], tools: ["Edit"] }).ok === false, "over-permissioned agent (writeSet escapes contract) ⇒ REJECTED");

// ODG's REAL campaign-loop drives the 5-mission chain to ACCEPTED in ONE run
{
  const c = R.runAgentCampaign({});
  check(c.accepted.length === 5 && c.stopped === "COMPLETED", "ODG campaign-loop accepts ALL 5 chained missions in one run (COMPLETED)");
  check(JSON.stringify(c.accepted) === JSON.stringify(["m-researcher", "m-analyst", "m-builder", "m-verifier", "m-qa"]), "missions accepted in dependency order");
}

// Adversarial: each failure mode halts the chain (fail-closed) — chain stops before QA.
check(R.runAgentCampaign({ inject: "provider-error:builder" }).accepted.length === 2, "provider error at builder ⇒ only research+analyze accepted (chain halts)");
check(R.runAgentCampaign({ inject: "timeout:analyst" }).accepted.length === 1, "timeout at analyst ⇒ only research accepted");
check(R.runAgentCampaign({ inject: "no-evidence:researcher" }).accepted.length === 0, "missing evidence at researcher ⇒ nothing accepted (acceptance refused)");
{
  const d = R.runAgentCampaign({ inject: "disagreement" });
  check(d.accepted.length === 3 && !d.accepted.includes("m-qa"), "builder↔verifier disagreement ⇒ verifier mission FAILED, QA never reached");
  check(d.stopped === "IDLE_BLOCKED", "a halted chain stops IDLE_BLOCKED (not a false COMPLETED)");
}

// determinism of the STABLE outcome (the real campaign-loop timestamps its transitions, which is expected;
// the governed OUTCOME — accepted missions + stop reason — is deterministic).
{
  const a = R.runAgentCampaign({}); const b = R.runAgentCampaign({});
  check(JSON.stringify({ acc: a.accepted, stop: a.stopped, reason: a.reason }) === JSON.stringify({ acc: b.accepted, stop: b.stopped, reason: b.reason }), "deterministic governed outcome (accepted + stop reason)");
}

console.log(failures === 0 ? "ALL PASS — WI-P2-20 REFERENCE AGENTS" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
