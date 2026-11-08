#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const R = require("./failures-register");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §105 — FAILURES REGISTER F01-F40");

const v = R.verifyRegister();
check(v.ok === true && v.count === 40 && v.distinct === 40 && v.incomplete.length === 0, "exactly 40 distinct complete failure modes F01-F40");
check(v.byStatus.PROTECTED + v.byStatus.PARTIAL + v.byStatus.TO_AUDIT === 40, "every entry has an honest status (PROTECTED/PARTIAL/TO_AUDIT sum to 40)");
check(v.byStatus.TO_AUDIT >= 0 && v.byStatus.PROTECTED > 0 && v.byStatus.PARTIAL > 0, "statuses are not uniformly inflated (a real mix)");

// each entry carries a risk + protection + ≥1 module.
check(R.FAILURES.every((f: any) => f.risk && f.protection && Array.isArray(f.modules) && f.modules.length > 0), "each failure maps a risk → protection → ≥1 real module");

// KEY cited protection modules physically exist in the repo (checkable, not asserted).
const keyModules = ["root-of-trust", "action-gate", "evidence-provenance", "checkpoint-engine", "meta-intelligence", "frontier-lab", "compounding-loop", "api-contract", "campaign-controller", "frontier-sandbox"];
for (const m of keyModules) check(fs.existsSync(path.join(__dirname, m + ".ts")), `cited protection module present: ${m}.ts`);

// F02 (G0 bypassed) is PROTECTED and cites root-of-trust (proven this programme).
const f02 = R.FAILURES.find((f: any) => f.id === "F02");
check(f02.status === "PROTECTED" && f02.modules.includes("root-of-trust"), "F02 (G0 bypass) PROTECTED via root-of-trust");

// verifyRegister flags unknown modules when given a (partial) present-set — the PROTECTED claim is CHECKABLE.
const partial = R.verifyRegister(["action-gate"]); // only one module 'present'
check(Array.isArray(partial.unknownModules) && partial.unknownModules.length > 0, "verifyRegister flags modules not in the supplied present-set (checkable, not asserted)");

console.log(failures === 0 ? "ALL PASS — V12.4 §105 FAILURES REGISTER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
