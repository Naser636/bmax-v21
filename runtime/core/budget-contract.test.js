#!/usr/bin/env node
"use strict";

/*
 * V5 budget contract source (increment B). Locks: ABSENT vs DECLARED vs MALFORMED (no fabricated
 * default); allocation validation (bucket/unit/kind/amount/scale); extensible unit; and the real
 * mission-loader transport (plan.budget present iff well-formed, absent otherwise — backward compatible).
 *
 * Run directly: node runtime/core/budget-contract.test.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const B = require("./budget-contract");

const REPO = process.cwd();
let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

console.log("V5 — BUDGET CONTRACT SOURCE");

// ABSENT vs DECLARED vs MALFORMED (no fabricated default).
check(B.resolveBudget({}).present === false, "no budget ⇒ ABSENT { present:false } (no default fabricated)");
check(B.resolveBudget({ budget: 42 }).ok === false, "budget not an object ⇒ MALFORMED");
check(B.resolveBudget({ budget: { allocations: [] } }).ok === false, "empty allocations ⇒ MALFORMED");
{
  const r = B.resolveBudget({ budget: { allocations: [{ bucket: "token", unit: "token", kind: "COST_UNIT", amount: 100000 }] } });
  check(r.present && r.ok && r.budget.allocations[0].amount === 100000 && r.budget.allocations[0].scale === 0, "well-formed token allocation ⇒ DECLARED + normalized (scale defaults 0)");
}
{
  const r = B.resolveBudget({ budget: { allocations: [{ bucket: "provider", unit: "EUR", kind: "ASSET", amount: 5000, scale: 2 }] } });
  check(r.ok && r.budget.allocations[0].unit === "EUR" && r.budget.allocations[0].scale === 2, "ASSET allocation (EUR, scale 2) accepted (extensible unit, no hardcoded check)");
}
check(B.resolveBudget({ budget: { allocations: [{ bucket: "bogus", unit: "x", kind: "COST_UNIT", amount: 1 }] } }).ok === false, "invalid bucket ⇒ MALFORMED");
check(B.resolveBudget({ budget: { allocations: [{ bucket: "token", unit: "token", kind: "COST_UNIT", amount: -1 }] } }).ok === false, "negative amount ⇒ MALFORMED");
check(B.resolveBudget({ budget: { allocations: [{ bucket: "token", unit: "token", kind: "MONEY", amount: 1 }] } }).ok === false, "invalid kind ⇒ MALFORMED");

// End-to-end: the REAL runtime/core/mission-loader.js transports plan.budget iff well-formed.
function loadPlan(spec) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-loader-"));
  try {
    fs.mkdirSync(path.join(dir, "runtime", "missions"), { recursive: true });
    fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
    fs.mkdirSync(path.join(dir, "runtime", "brain"), { recursive: true });
    fs.writeFileSync(path.join(dir, "runtime", "brain", "MASTER_PLAN.md"), "# plan\n");
    fs.writeFileSync(path.join(dir, "runtime", "missions", "M.json"), JSON.stringify(spec));
    const r = spawnSync("node", [path.join(REPO, "runtime", "core", "mission-loader.js"), "M"], { cwd: dir, encoding: "utf8" });
    let plan = null;
    try { plan = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "mission-plan.json"), "utf8")); } catch { /* */ }
    return { plan, code: r.status };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
{
  const spec = { mission: "M", objectives: [{ id: "O1", goal: "g", done_when: ["d"] }], budget: { allocations: [{ bucket: "token", unit: "token", kind: "COST_UNIT", amount: 100000 }] } };
  const { plan } = loadPlan(spec);
  check(plan && plan.budget && plan.budget.allocations[0].amount === 100000, "loader transports a well-formed plan.budget end-to-end");
}
{
  const spec = { mission: "M", objectives: [{ id: "O1", goal: "g", done_when: ["d"] }] };
  const { plan } = loadPlan(spec);
  check(plan && plan.budget === undefined, "no budget declared ⇒ plan has NO budget key (backward compatible)");
}
{
  const spec = { mission: "M", objectives: [{ id: "O1", goal: "g", done_when: ["d"] }], budget: { allocations: [{ bucket: "bogus" }] } };
  const { plan } = loadPlan(spec);
  check(plan && plan.budget === undefined, "malformed budget ⇒ dropped (no plan.budget; not coerced to a default)");
}

console.log(failures === 0 ? "ALL PASS — V5 BUDGET CONTRACT SOURCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
