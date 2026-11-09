#!/usr/bin/env node
"use strict";

const B = require("./memory-scenario-battery");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

const r = B.runScenarios();

// the full §5 battery passes over the REAL memory modules (12/12).
check(r.total === 12, "§5 battery covers the 12 mandatory memory scenarios");
check(r.allPass === true && r.passed === 12, "all 12 memory scenarios pass over the real modules");

// spot-check the key fail-closed memory invariants individually.
const g = (n: number) => r.scenarios.find((s: any) => s.n === n);
check(g(1).pass, "1: retrieve a relevant prior decision (cross-mission, goal-keyed)");
check(g(2).pass, "2: reuse a validated repair (patch-memory)");
check(g(4).pass, "4: distinguish old/stale from current (stale excluded)");
check(g(6).pass, "6: a hypothesis is never a fact (classifier)");
check(g(7).pass, "7: context preserved after interruption (deterministic recall)");
check(g(8).pass, "8: context transmitted across métiers (grouped, provenance kept)");
check(g(11).pass, "11: a simulation is never promoted to a real result");
check(g(12).pass, "12: deny-by-default on access (Truth Lock respected)");

// contract invariants.
check(/SIMULATION is never a real result|memorized item is never a current proof/i.test(JSON.stringify(B.MEMORY_SCENARIO_BATTERY_CONTRACT.invariants)), "contract: memorized ≠ current proof, simulation ≠ real");
check(/no new memory system|anti-gas-factory/i.test(JSON.stringify(B.MEMORY_SCENARIO_BATTERY_CONTRACT.invariants)), "contract: composes existing (no new memory system)");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 M-CH1-02 MEMORY SCENARIO BATTERY (§5)\n");
process.exit(failures === 0 ? 0 : 1);

export {};
