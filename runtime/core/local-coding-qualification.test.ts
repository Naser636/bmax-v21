#!/usr/bin/env node
"use strict";

const Q = require("./local-coding-qualification");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

// scoreGeneration: exploitable only if compiled AND tested (fail-closed).
check(Q.scoreGeneration({ hasCode: true, compiled: true, testPassed: true }).exploitable === true, "code compiled + tested ⇒ exploitable");
check(Q.scoreGeneration({ hasCode: true, compiled: true, testPassed: false }).exploitable === false, "compiled but test failed ⇒ NOT exploitable");
check(Q.scoreGeneration({ hasCode: true, compiled: false, testPassed: true }).exploitable === false, "does not compile ⇒ NOT exploitable");
check(Q.scoreGeneration({ hasCode: false }).exploitable === false, "explanation-only (no code) ⇒ NOT exploitable");
check(Q.scoreGeneration(null).exploitable === false, "junk ⇒ NOT exploitable (fail-closed)");

// assessLevel: a level is never declared without its proof.
check(Q.assessLevel({ modelOperational: false }).level === "NONE", "model not operational ⇒ below L0");
check(Q.assessLevel({ modelOperational: true, generations: [] }).level === "L0", "operational but no exploitable gen ⇒ L0");
check(Q.assessLevel({ modelOperational: true, generations: [{ hasCode: true, compiled: true, testPassed: true }] }).level === "L1", "≥1 exploitable generation ⇒ L1");
check(Q.assessLevel({ modelOperational: true, generations: [{ hasCode: true, compiled: true, testPassed: true }], realFileApplied: true }).level === "L2", "real file modified+tested ⇒ L2");
check(Q.assessLevel({ modelOperational: true, generations: [{ hasCode: true, compiled: true, testPassed: true }], realFileApplied: true, fullMissionVerified: true }).level === "L3", "full mission verified ⇒ L3");
check(Q.assessLevel({ modelOperational: true, generations: [{ hasCode: true, compiled: true, testPassed: true }], realFileApplied: true, fullMissionVerified: true, longCampaign: true }).level === "L4", "long campaign + recovery ⇒ L4");

// a non-exploitable generation does not lift the level past L0.
check(Q.assessLevel({ modelOperational: true, generations: [{ hasCode: true, compiled: false }] }).level === "L0", "non-compiling generation does not reach L1");
// claiming L2 without L1's exploitable generation is refused (realFileApplied alone doesn't skip).
check(Q.assessLevel({ modelOperational: true, generations: [], realFileApplied: true }).level === "L0", "realFileApplied without an exploitable generation ⇒ stays L0 (no level skipping)");

// contract invariants.
check(/EXPLOITABLE only if it COMPILED and PASSED/i.test(JSON.stringify(Q.LOCAL_CODING_QUALIFICATION_CONTRACT.invariants)), "contract: exploitable = compiled AND tested");
check(/never declared without its measured proof/i.test(JSON.stringify(Q.LOCAL_CODING_QUALIFICATION_CONTRACT.invariants)), "contract: no level without proof");
check(/no silent cloud fallback|OUT of the gate/i.test(JSON.stringify(Q.LOCAL_CODING_QUALIFICATION_CONTRACT.invariants)), "contract: live call out of gate, no cloud fallback");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 LOCAL CODING QUALIFICATION (Phase 0)\n");
process.exit(failures === 0 ? 0 : 1);

export {};
