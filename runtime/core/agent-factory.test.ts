#!/usr/bin/env node
"use strict";

/*
 * WI-AGENT-14 — agent-factory. Locks: permission confinement (writeSet/tools/budget ⊆ contract ⇒ else REJECTED),
 * contract-required, evidence-based maturity (OPERATIONAL only with evidence), supervise stop (revoke/budget),
 * deterministic contractSha, determinism. Pure. Run: node_modules/.bin/tsx runtime/core/agent-factory.test.ts
 */
const assert = require("assert");
const F = require("./agent-factory");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

const contract = { objective: "fix X", authorizedPaths: ["runtime/core/x.ts"], allowedTools: ["Edit", "Bash"], budget: { maxCalls: 10, maxMs: 1000 } };
const base = { id: "a1", role: "Builder", model: "m5", config: { temp: 0 }, contract, writeSet: ["runtime/core/x.ts"], tools: ["Edit"], budget: { maxCalls: 5 }, tests: ["t1"] };

console.log("WI-AGENT-14 — AGENT FACTORY");

// valid agent
{
  const r = F.defineAgent(base);
  check(r.ok && r.agent.id === "a1" && typeof r.agent.contractSha === "string" && r.agent.contractSha.length === 64, "valid spec ⇒ agent built with sha256 contractSha");
  check(r.agent.maturity === "TESTABLE", "maturity TESTABLE (tests defined, no evidence yet)");
}

// permission confinement (§9/§54)
check(F.defineAgent({ ...base, writeSet: ["runtime/core/OTHER.ts"] }).ok === false, "writeSet escaping contract.authorizedPaths ⇒ REJECTED");
check(F.validateAgent({ ...base, writeSet: ["runtime/core/OTHER.ts"] }).violations.some((v: any) => /escapes/.test(v)), "violation names the escalation");
check(F.defineAgent({ ...base, tools: ["Edit", "Write"] }).ok === false, "tool not granted by contract ⇒ REJECTED");
check(F.defineAgent({ ...base, budget: { maxCalls: 999 } }).ok === false, "budget exceeding contract ⇒ REJECTED");
check(F.defineAgent({ id: "a", role: "r" }).ok === false, "no contract ⇒ REJECTED (no permissions without a contract)");
// writeSet defaults to the contract's when omitted, and within-scope passes
check(F.defineAgent({ id: "a", role: "r", contract }).ok === true, "omitted writeSet defaults to contract (within scope) ⇒ ok");

// evidence-based maturity (§54)
check(F.maturityOf({ id: "a", role: "r" }) === "DECLARED", "id+role only ⇒ DECLARED");
check(F.maturityOf({ id: "a", role: "r", model: "m", config: {}, contract }) === "CONFIGURED", "+model+config+contract ⇒ CONFIGURED");
check(F.maturityOf({ id: "a", role: "r", contract, tests: ["t"] }) === "TESTABLE", "+tests ⇒ TESTABLE");
check(F.maturityOf({ id: "a", role: "r", contract, tests: ["t"], evidence: { testsPassed: true, refs: ["ev"] } }) === "OPERATIONAL", "+test evidence ⇒ OPERATIONAL");
check(F.maturityOf({ id: "a", role: "r", contract, tests: ["t"], evidence: { testsPassed: true } }) === "TESTABLE", "testsPassed WITHOUT refs ⇒ still TESTABLE (no unproven OPERATIONAL)");

// supervision / controlled stop (§71)
const agent = F.defineAgent(base).agent;
check(F.supervise(agent, { revoked: true }).action === "STOP", "revoked ⇒ STOP");
check(F.supervise(agent, { calls: 5 }).action === "STOP", "budget maxCalls reached ⇒ STOP");
check(F.supervise(agent, { calls: 1, elapsedMs: 10 }).action === "CONTINUE", "within budget ⇒ CONTINUE");

// contractSha determinism + sensitivity
check(F.contractShaOf(contract) === F.contractShaOf({ ...contract }), "contractSha deterministic");
check(F.contractShaOf(contract) !== F.contractShaOf({ ...contract, objective: "other" }), "different contract ⇒ different sha");
check(JSON.stringify(F.defineAgent(base)) === JSON.stringify(F.defineAgent(base)), "deterministic defineAgent");

console.log(failures === 0 ? "ALL PASS — WI-AGENT-14 AGENT FACTORY" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
