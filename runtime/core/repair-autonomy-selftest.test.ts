#!/usr/bin/env node
"use strict";

const S = require("./repair-autonomy-selftest");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

// the full battery: 3 deterministic defects REPAIRED (independently verified), 1 unknown ESCALATED, honest.
const r = S.runSelfTest();
check(r.total === 4 && r.repaired === 3 && r.escalated === 1, "self-test: 3 REPAIRED + 1 ESCALATED");
check(r.honest === true, "self-test: honest (every REPAIRED independently verified AND the no-fixer case escalated)");
check(r.cycles.filter((c: any) => c.outcome === "REPAIRED").every((c: any) => c.verified === true), "every REPAIRED cycle passed INDEPENDENT verification (not the fixer's self-report)");
check(r.cycles.find((c: any) => c.defectClass === "unknown-semantic").outcome === "ESCALATED", "unknown-semantic (no fixer) ⇒ ESCALATED, never a fabricated fix");

// each deterministic class is individually a full REPAIRED cycle.
const json = S.runRepairCycle({ defectClass: "json-trailing-comma", broken: '{"a":1,}', ctx: {} });
check(json.outcome === "REPAIRED" && json.verified === true, "json-trailing-comma ⇒ REPAIRED + verified (JSON.parse succeeds)");
const exp = S.runRepairCycle({ defectClass: "missing-export", broken: "function foo(){return 1}\n", ctx: { symbol: "foo" } });
check(exp.outcome === "REPAIRED" && exp.verified === true, "missing-export ⇒ REPAIRED + verified (export present)");
const req = S.runRepairCycle({ defectClass: "wrong-require", broken: 'const h=require("./wrong");\n', ctx: { from: "./wrong", to: "./helper" } });
check(req.outcome === "REPAIRED" && req.verified === true, "wrong-require ⇒ REPAIRED + verified (specifier rewritten)");

// fail-closed: a defect with no fixer ⇒ ESCALATED (not faked).
const esc = S.runRepairCycle({ defectClass: "unknown-x", broken: "whatever", ctx: {} });
check(esc.outcome === "ESCALATED" && esc.fixed === false, "no-fixer defect ⇒ ESCALATED (chain hands off, does not pretend)");

// fail-closed: a fixer whose output does NOT independently verify must ESCALATE, not claim REPAIRED.
// (missing-export for a symbol that is NOT defined ⇒ generateExportFix cannot produce a valid export of it.)
const notDef = S.runRepairCycle({ defectClass: "missing-export", broken: "const x = 1;\n", ctx: { symbol: "nonexistent" } });
check(notDef.outcome === "ESCALATED" || notDef.verified === true, "a fix that does not independently verify is ESCALATED, never claimed REPAIRED");

// the repair is planned through the root-cause-gated, write-set-confined planner.
check(json.planned === true, "the repair cycle plans via repair-planner (root-cause-gated + write-set-confined)");

// contract invariants.
check(/no file on disk is read or mutated|isolated \+ reversible/i.test(JSON.stringify(S.REPAIR_AUTONOMY_SELFTEST_CONTRACT.invariants)), "contract: isolated + reversible (in-memory)");
check(/never a fabricated fix|INDEPENDENT predicate/i.test(JSON.stringify(S.REPAIR_AUTONOMY_SELFTEST_CONTRACT.invariants)), "contract: independent verify + never fabricated fix");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 REPAIR-AUTONOMY SELF-TEST\n");
process.exit(failures === 0 ? 0 : 1);

export {};
