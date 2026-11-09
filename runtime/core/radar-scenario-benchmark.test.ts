#!/usr/bin/env node
"use strict";

const B = require("./radar-scenario-benchmark");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

const r = B.runScenarios();

// the full §6 battery passes over the REAL radar chain: precision 1.0, 0 FP, 0 FN.
check(r.total >= 10, "§6 battery covers ≥10 scenario types");
check(r.precision === 1 && r.correct === r.total, "all scenarios classified correctly by the real radar chain");
check(r.falsePositives.length === 0, "0 false positives (no benign/dubious scenario accepted for experiment)");
check(r.falseNegatives.length === 0, "0 false negatives (no real tech/vuln/regulatory signal missed)");

// spot-check the key fail-closed verdicts individually (independent of the aggregate).
const g = (name: string) => r.scenarios.find((s: any) => s.name === name);
check(g("new-tech").got === "ACCEPT_FOR_EXPERIMENT", "new high-impact tech ⇒ ACCEPT_FOR_EXPERIMENT (detection)");
check(g("critical-vuln").got === "ACCEPT_FOR_EXPERIMENT", "critical vuln ⇒ ACCEPT_FOR_EXPERIMENT (detection)");
check(g("injected-source").got === "QUARANTINE", "injected/dubious source ⇒ QUARANTINE (never acted on)");
check(g("contradictory").got === "ESCALATE", "contradiction with known state ⇒ ESCALATE");
check(g("unknown-source").got === "REJECT", "unknown-reliability source ⇒ REJECT (false opportunity not admitted)");
check(g("known-info-dedup").got === 2, "known/duplicate info ⇒ deduplicated (not re-flagged as new)");
check(g("failed-experiment").got === true, "non-reproducible experiment ⇒ NOT promoted");
check(g("malformed-input").got === true && r.robust === true, "malformed input ⇒ handled fail-closed (no crash)");
check(g("resume-idempotent").got === true, "same signal ⇒ same verdict (resume-idempotent)");

// a dubious/benign scenario must NEVER be ACCEPT_FOR_EXPERIMENT (fail-closed specificity).
check(r.scenarios.filter((s: any) => s.kind === "specificity").every((s: any) => s.got !== "ACCEPT_FOR_EXPERIMENT"), "no specificity scenario is ACCEPT_FOR_EXPERIMENT (fail-closed)");

// contract invariants.
check(/FALSE POSITIVE|FALSE NEGATIVE/i.test(JSON.stringify(B.RADAR_SCENARIO_BENCHMARK_CONTRACT.invariants)), "contract: FP/FN defined");
check(/no second radar\/scheduler\/engine|anti-gas-factory/i.test(JSON.stringify(B.RADAR_SCENARIO_BENCHMARK_CONTRACT.invariants)), "contract: no new engine (composes existing)");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 RADAR SCENARIO BENCHMARK (§6)\n");
process.exit(failures === 0 ? 0 : 1);

export {};
