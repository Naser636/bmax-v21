#!/usr/bin/env node
"use strict";
/*
 * odg reconcile <MISSION> [<MISSION> ...]  — ODG runs PRESENT-STATE RECONCILIATION (CTO §2) for one or
 * more completed missions: verify each against the ACTUAL tree (declared sources exist + declared
 * acceptance tests pass present-state) and record the result DISTINCTLY from pipeline execution into
 * runtime/generated/present-state-reconciliation.json. Exits 0 only when EVERY requested mission is PROVEN.
 *
 * Thin orchestration over runtime/core/present-state-reconciliation.js — no new logic, no protected path,
 * never fabricates a mission-report, never weakens the mission-ledger proven-gate.
 */
const path = require("path");
const ROOT = process.cwd();
const { reconcileAndRecord } = require(path.join(ROOT, "runtime", "core", "present-state-reconciliation.js"));

const missions = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (missions.length === 0) {
  process.stderr.write("usage: odg reconcile <MISSION> [<MISSION> ...]\n");
  process.exit(2);
}

console.log("======================================");
console.log("ODG PRESENT-STATE RECONCILIATION");
console.log("======================================");
let allProven = true;
for (const m of missions) {
  const r = reconcileAndRecord(m, { repoRoot: ROOT });
  if (!r.proven) allProven = false;
  console.log(`${r.proven ? "PROVEN    " : "NOT-PROVEN"} ${m}`);
  console.log(`  verdict : ${r.verdict}`);
  console.log(`  reason  : ${r.reason}`);
  if (r.evidence) {
    for (const s of r.evidence.sources || []) console.log(`  source  : ${s.exists ? "present" : "MISSING"} ${s.path}${s.sha256 ? " (" + s.sha256.slice(0, 12) + ")" : ""}`);
    for (const t of r.evidence.tests || []) console.log(`  test    : exit=${t.exit === null ? "absent/not-run" : t.exit} ${t.path}`);
  }
}
console.log("--------------------------------------");
console.log("Record  :", path.join("runtime", "generated", "present-state-reconciliation.json"));
console.log("Provenance: present-state-reconciliation (DISTINCT from pipeline execution)");
console.log("======================================");
process.exit(allProven ? 0 : 1);
