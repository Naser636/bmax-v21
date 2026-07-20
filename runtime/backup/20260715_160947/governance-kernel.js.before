#!/usr/bin/env node

const fs = require("fs");

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function authorizeMission(mission, currentState = "CREATED") {
  const constitution = loadJson("runtime/constitution/runtime-constitution.json");
  const policies = loadJson("runtime/policies/runtime-policies.json");
  const stateMachine = loadJson("runtime/governance/state-machine.json");

  const allowed =
    (stateMachine.transitions[currentState] || []).length > 0;

  return {
    mission,
    currentState,
    authorized: allowed,
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
