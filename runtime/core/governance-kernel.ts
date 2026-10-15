#!/usr/bin/env node

/*
 * Governance Kernel (TypeScript port; behavioural parity with runtime/core/governance-kernel.js).
 *
 * Strict TS port: the public export (authorizeMission), its signature, default argument, return shape,
 * FIELD ORDER, relative config-file paths (resolved against process.cwd(), unchanged), error behaviour
 * and the CLI banner are preserved EXACTLY. The historical .js remains the behavioural reference.
 *
 * TRUTH REPAIR invariant preserved verbatim: `authorized` is a backward-compat ALIAS of
 * `transitionPossible` (a lifecycle-transition fact), NOT an authority grant; `authorityEnforced:false`
 * honestly discloses that no authority source is consulted here.
 */

import * as fs from "fs";

// Untyped JSON config boundary (constitution / policies / state-machine) — `any` matches the sibling
// convention (mission-lifecycle.ts, mission-ledger.ts treat this kernel's JS deps as `any`).
function loadJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export interface AuthorizeMissionResult {
  mission: string;
  currentState: string;
  transitionPossible: boolean;
  authorityEnforced: false;
  authorized: boolean;
  nextStates: string[];
  constitutionVersion: unknown;
  policyVersion: unknown;
  strategy: unknown;
}

export function authorizeMission(mission: string, currentState: string = "CREATED"): AuthorizeMissionResult {
  const constitution = loadJson("runtime/constitution/runtime-constitution.json");
  const policies = loadJson("runtime/policies/runtime-policies.json");
  const stateMachine = loadJson("runtime/governance/state-machine.json");

  // Lifecycle-state fact ONLY: "does `currentState` have an outgoing edge in state-machine.json?".
  // It inspects no mission identity, contract authority or policy rule (none is consulted or invented).
  const transitionPossible =
    (stateMachine.transitions[currentState] || []).length > 0;

  return {
    mission,
    currentState,
    transitionPossible,
    authorityEnforced: false,
    authorized: transitionPossible,
    nextStates: stateMachine.transitions[currentState] || [],
    constitutionVersion: constitution.version,
    policyVersion: policies.version,
    strategy: policies.governance.strategy,
  };
}

if (require.main === module) {
  const result = authorizeMission(process.argv[2] || "TEST");
  console.log("======================================");
  console.log("GOVERNANCE KERNEL v1");
  console.log("======================================");
  console.log(JSON.stringify(result, null, 2));
}
