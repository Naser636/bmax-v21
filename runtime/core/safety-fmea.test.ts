#!/usr/bin/env node
"use strict";
const F = require("./safety-fmea");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
// (1) RPN = S×O×D; a severe, frequent, undetectable failure ⇒ CRITICAL.
const fm = F.analyzeFailureMode({ mode: "silent data loss", severity: 9, occurrence: 6, detection: 9 });
check(fm.rpn === 9 * 6 * 9 && fm.risk === "CRITICAL", "RPN = S×O×D; severe+frequent+undetectable ⇒ CRITICAL");
// (2) FAIL-CLOSED: a missing factor is assumed WORST-CASE (10), never a flattering default.
const miss = F.analyzeFailureMode({ mode: "x", severity: 9 });   // occurrence/detection absent ⇒ 10 each
check(miss.occurrence === 10 && miss.detection === 10 && miss.risk === "CRITICAL", "missing factors ⇒ worst-case (10) ⇒ risk not under-stated");
// (3) a declared mitigation reduces the RESIDUAL risk; no mitigation ⇒ no reduction.
const mit = F.analyzeFailureMode({ mode: "x", severity: 9, occurrence: 6, detection: 2, mitigation: "independent verifier", mitigationEffect: 0.8 });
check(mit.mitigated === true && mit.residualRpn < mit.rpn, "a declared mitigation reduces the residual RPN");
const noMit = F.analyzeFailureMode({ mode: "x", severity: 9, occurrence: 6, detection: 2 });
check(noMit.residualRpn === noMit.rpn, "no mitigation ⇒ residual == raw (fail-closed, no silent reduction)");
// (4) a HIGH/CRITICAL failure with NO mitigation is flagged for owner acceptance.
check(/must be mitigated or accepted|add a detection/i.test(noMit.note), "unmitigated HIGH/CRITICAL is flagged");
// (5) the residual register lists every CRITICAL/HIGH residual (never silently cleared).
const reg = F.buildRiskRegister([{ id: "c1", failureModes: [{ mode: "m1", severity: 9, occurrence: 6, detection: 9 }, { mode: "m2", severity: 2, occurrence: 2, detection: 2 }] }]);
check(reg.residualRegister.length === 1 && reg.residualRegister[0].component === "c1" && reg.summary.criticalResidual >= 1, "residual register lists the CRITICAL residual, not the LOW one");
check(/never silently cleared/i.test(reg.summary.note), "residual risks never silently cleared");
// (6) contract invariants.
check(/assumed WORST-CASE|never under-stated/i.test(JSON.stringify(F.SAFETY_FMEA_CONTRACT.invariants)), "contract: worst-case on missing factors");
if (failures === 0) process.stdout.write("ALL PASS — V12.4 SAFETY FMEA\n");
process.exit(failures === 0 ? 0 : 1);
export {};
