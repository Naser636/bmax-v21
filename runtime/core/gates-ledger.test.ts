#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const L = require("./gates-ledger");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §97-§103 — GATES A-G LEDGER");

const v = L.verifyLedger();
check(v.ok === true && v.count === 7 && v.distinct === 7 && v.incomplete.length === 0, "exactly 7 distinct complete gates A-G");
check(L.GATES.map((g: any) => g.gate).join("") === "ABCDEFG", "gates are A,B,C,D,E,F,G in order");
check(L.GATES.every((g: any) => g.criteria && g.mechanism.length > 0 && g.verifier), "each gate has criteria + ≥1 mechanism + an independent verifier");
check(v.byStatus.PASS + v.byStatus.PARTIAL + v.byStatus.TO_AUDIT + v.byStatus.BLOCKED === 7, "every gate has an honest status (no inflated PASS)");
// honesty: no gate is PASS yet (criteria not globally demonstrated) — they are PARTIAL until proven.
check(v.byStatus.PASS === 0, "no gate claims PASS prematurely (DEMONSTRATED-or-not-PASS discipline)");

// key cited mechanisms physically exist (checkable).
const keyMech = ["root-of-trust", "action-gate", "reality-gate", "campaign-controller", "mission-evidence", "primitive-validation"];
for (const m of keyMech) check(fs.existsSync(path.join(__dirname, m + ".ts")), `cited mechanism present: ${m}.ts`);

// verifyLedger flags unknown mechanisms against a partial present-set (checkable, not asserted).
const partial = L.verifyLedger(["action-gate"]);
check(Array.isArray(partial.unknownMechanisms) && partial.unknownMechanisms.length > 0, "verifyLedger flags mechanisms not in the supplied present-set");

console.log(failures === 0 ? "ALL PASS — V12.4 §97-§103 GATES LEDGER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
