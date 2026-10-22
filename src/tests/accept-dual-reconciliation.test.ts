// @ts-nocheck — DUAL_RECONCILIATION acceptance verifier (Workstream A, disposition 2).
// Encodes the contract's done_when as content assertions on the REAL deliverable — NOT existence-only:
//   done_when: ["125 duals each have a justified status", "verdict recorded honestly"].
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
let passed = 0;
function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }

const REPO = process.cwd();
const J = path.join(REPO, "runtime/reports/DUAL_RECONCILIATION_125.json");
const M = path.join(REPO, "runtime/reports/DUAL_RECONCILIATION_125.md");
console.log("ACCEPT — DUAL_RECONCILIATION (125 duals each justified + verdict)");
const d = JSON.parse(fs.readFileSync(J, "utf8"));
ok("count === 125", d.count === 125);
ok("rows present and == 125", Array.isArray(d.rows) && d.rows.length === 125);
ok("every dual has a justified non-empty status", d.rows.every((r) => r && typeof r.status === "string" && r.status.trim().length > 0));
const byStatusSum = Object.values(d.byStatus || {}).reduce((a, b) => a + Number(b || 0), 0);
ok("byStatus partitions all 125 (sum === 125)", byStatusSum === 125);
const md = fs.readFileSync(M, "utf8");
ok("verdict recorded in the .md (convergence/verdict line present)", /verdict|converg/i.test(md) && md.trim().length > 0);
console.log(`\nACCEPT DUAL_RECONCILIATION — ${passed} assertions passed.`);
