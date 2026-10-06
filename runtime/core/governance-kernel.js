#!/usr/bin/env node

const fs = require("fs");

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function authorizeMission(mission, currentState = "CREATED") {
  const constitution = loadJson("runtime/constitution/runtime-constitution.json");
  const policies = loadJson("runtime/policies/runtime-policies.json");
  const stateMachine = loadJson("runtime/governance/state-machine.json");

  // TRUTH REPAIR (FIX_GOVERNANCE_AUTHORIZATION_TAUTOLOGY_V1): this value is ONLY a lifecycle-state
  // fact — "does `currentState` have an outgoing edge in state-machine.json?". It does NOT inspect the
  // mission identity, its contract authority, policy authorization, or any authority source (none is
  // consulted here, and none is invented by this repair). It is therefore surfaced under its honest
  // name `transitionPossible`, not as an authority decision.
  const transitionPossible =
    (stateMachine.transitions[currentState] || []).length > 0;

  return {
    mission,
    currentState,
    // Honest primary: a lifecycle-transition possibility, not an authority grant.
    transitionPossible,
    // Explicit, honest disclosure that NO real authority decision is made here. This declares the
    // ABSENCE of an authority source (it invents no allowlist, permission, or policy rule); callers
    // must not read `authorized` below as evidence that a mission's authority was actually checked.
    authorityEnforced: false,
    // Backward-compatibility alias (unchanged VALUE) for existing callers (mission-ledger entry
    // fields; mission-lifecycle / nl-objective-gateway / fleet-collector / odg-run transition gates).
    // Equal to `transitionPossible` — it means a transition exists, NOT that authority was granted.
    authorized: transitionPossible,
    nextStates: stateMachine.transitions[currentState] || [],
    constitutionVersion: constitution.version,
    policyVersion: policies.version,
    strategy: policies.governance.strategy
  };
}

module.exports = {
  authorizeMission
};

if (require.main === module) {
  const result = authorizeMission(process.argv[2] || "TEST");
  console.log("======================================");
  console.log("GOVERNANCE KERNEL v1");
  console.log("======================================");
  console.log(JSON.stringify(result, null, 2));
}
