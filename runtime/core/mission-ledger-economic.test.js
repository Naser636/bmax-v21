#!/usr/bin/env node
"use strict";

/*
 * V5 ECONOMIC CORE — live release-gate regression for the mission-ledger ECONOMIC ENFORCEMENT gate (OPT-IN).
 *
 * Proves that wiring the INDEPENDENT economic verdict (economic-verification.js verifyEconomics, surfaced as
 * runtime/generated/economic-verification-report.json) into the universal proven/release choke point
 * (runtime/core/mission-ledger.js recordMission) enforces, for ECONOMICALLY-ENFORCED missions only
 * (contract control.economic === true), that release (= recording the mission proven) requires an economic
 * verdict of VERIFIED — never INCOMPLETE/UNKNOWN/FAILED, never an absent/mismatched/malformed report (DENY-
 * BY-DEFAULT) — and that missions which do NOT opt in behave EXACTLY as before.
 *
 * The gate is INDEPENDENT of the controlled (mechanical-acceptance) gate: these cases opt into economics
 * ONLY (no control.required), so the mechanical gate is a NO-OP and the economic gate is isolated.
 *
 * Fully isolated like mission-ledger-controlled.test.js: each case runs recordMission in a throwaway cwd
 * with the governance fixtures + staged contract/artifacts, so the real ledger is never touched.
 *
 * Run directly: node runtime/core/mission-ledger-economic.test.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = process.cwd();
const { recordMission } = require(path.join(REPO, "runtime", "core", "mission-ledger.js"));

const GOV_FILES = [
  path.join("runtime", "constitution", "runtime-constitution.json"),
  path.join("runtime", "policies", "runtime-policies.json"),
  path.join("runtime", "governance", "state-machine.json"),
];

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-economic-"));
  for (const rel of GOV_FILES) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.copyFileSync(path.join(REPO, rel), path.join(dir, rel));
  }
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "missions"), { recursive: true });
  return dir;
}
const G = (dir, name) => path.join(dir, "runtime", "generated", name);
function writeReport(dir, mission, validated) {
  fs.writeFileSync(G(dir, "mission-report.json"), JSON.stringify({ mission, validated, status: validated ? "SUCCESS" : "FAILED" }));
}
function writeContract(dir, mission, contract) {
  fs.writeFileSync(path.join(dir, "runtime", "missions", mission + ".json"), JSON.stringify(contract));
}
function writeEcon(dir, body) {
  fs.writeFileSync(G(dir, "economic-verification-report.json"), typeof body === "string" ? body : JSON.stringify(body));
}
function ledgerCount(dir) {
  try { return JSON.parse(fs.readFileSync(G(dir, "mission-ledger.json"), "utf8")).count; } catch { return 0; }
}
function recordIn(dir, mission) {
  const prev = process.cwd();
  process.chdir(dir);
  try { return recordMission(mission); } finally { process.chdir(prev); }
}

// Stage an economically-enforced mission that PASSES the proven-gate (validated report) and opts into
// economics ONLY (no control.required ⇒ the mechanical gate is a NO-OP). The economic verdict is supplied
// separately per case.
// Findings CONSISTENT with the stated verdict (as the real verifyEconomics always emits them): violations
// ⇒ FAILED, gaps ⇒ INCOMPLETE, proofs ⇒ VERIFIED, all-empty ⇒ UNKNOWN. The gate rejects inconsistent
// evidence, so faithful fixtures are required (an internally-contradictory report is a tampering case).
function consistentReport(mission, verdict) {
  const r = { mission, verdict, violations: [], gaps: [], proofs: [] };
  if (verdict === "FAILED") r.violations = ["LEDGER_IMBALANCE"];
  else if (verdict === "INCOMPLETE") r.gaps = ["MISSING_PRICE"];
  else if (verdict === "VERIFIED") r.proofs = ["LEDGER_CONSERVED"];
  return r;
}
function stageEnforced(dir, mission, verdict) {
  writeContract(dir, mission, { mission, status: "AUTHORIZED", control: { economic: true }, authorized_paths: ["runtime/core"] });
  writeReport(dir, mission, true);
  if (verdict !== undefined) writeEcon(dir, consistentReport(mission, verdict));
}

console.log("V5 ECONOMIC CORE — LEDGER ECONOMIC ENFORCEMENT GATE");

// 1 — enforcement DISABLED (legacy, no control.economic) ⇒ exact legacy behavior (records), even with a
//     FAILED economic report present (which would block an enforced mission). Proves no leak onto legacy.
{
  const dir = sandbox(); const M = "ECON_LEGACY";
  writeReport(dir, M, true);
  writeEcon(dir, { mission: M, verdict: "FAILED", violations: ["LEDGER_IMBALANCE"], gaps: [], proofs: [] });
  const r = recordIn(dir, M);
  check(r.skipped !== true && r.entry && r.entry.proven === true, "1. legacy (no control.economic) ⇒ recorded, economic report ignored");
  check(ledgerCount(dir) === 1, "1b. exactly one proven entry (legacy unchanged)");
}

// 2 — enabled + VERIFIED ⇒ allowed (recorded proven).
{
  const dir = sandbox(); const M = "ECON_VERIFIED";
  stageEnforced(dir, M, "VERIFIED");
  const r = recordIn(dir, M);
  check(r.skipped !== true && r.entry && r.entry.proven === true, "2. enabled + VERIFIED ⇒ released (recorded proven)");
  check(ledgerCount(dir) === 1, "2b. exactly one proven entry");
}

// 3 — enabled + INCOMPLETE ⇒ blocked (honest GAP is not a release).
{
  const dir = sandbox(); const M = "ECON_INCOMPLETE";
  stageEnforced(dir, M, "INCOMPLETE");
  const r = recordIn(dir, M);
  check(r.skipped === true && r.reason === "NOT_ECONOMICALLY_VERIFIED" && r.verdict === "INCOMPLETE", "3. enabled + INCOMPLETE ⇒ NOT_ECONOMICALLY_VERIFIED, no release");
  check(ledgerCount(dir) === 0, "3b. nothing recorded");
}

// 4 — enabled + UNKNOWN ⇒ blocked (deny-by-default verdict).
{
  const dir = sandbox(); const M = "ECON_UNKNOWN";
  stageEnforced(dir, M, "UNKNOWN");
  const r = recordIn(dir, M);
  check(r.skipped === true && r.reason === "NOT_ECONOMICALLY_VERIFIED" && r.verdict === "UNKNOWN", "4. enabled + UNKNOWN ⇒ no release");
  check(ledgerCount(dir) === 0, "4b. nothing recorded");
}

// 5 — enabled + FAILED ⇒ blocked (proven economic violation).
{
  const dir = sandbox(); const M = "ECON_FAILED";
  stageEnforced(dir, M, "FAILED");
  const r = recordIn(dir, M);
  check(r.skipped === true && r.reason === "NOT_ECONOMICALLY_VERIFIED" && r.verdict === "FAILED", "5. enabled + FAILED ⇒ no release");
  check(ledgerCount(dir) === 0, "5b. nothing recorded");
}

// 6 — economic evidence ABSENT / MALFORMED / WRONG-MISSION ⇒ safe deny (UNKNOWN), no release.
{
  // 6a — report absent entirely.
  const dir = sandbox(); const M = "ECON_ABSENT";
  stageEnforced(dir, M); // no econ report written
  const r = recordIn(dir, M);
  check(r.skipped === true && r.reason === "NOT_ECONOMICALLY_VERIFIED" && r.verdict === "UNKNOWN", "6a. enabled + absent report ⇒ UNKNOWN (deny-by-default), no release");
  check(ledgerCount(dir) === 0, "6a2. nothing recorded");
}
{
  // 6b — report malformed (not JSON / no verdict field).
  const dir = sandbox(); const M = "ECON_MALFORMED";
  stageEnforced(dir, M);
  writeEcon(dir, "}{ not json");
  const r = recordIn(dir, M);
  check(r.skipped === true && r.verdict === "UNKNOWN", "6b. enabled + malformed report ⇒ UNKNOWN, no release");
  check(ledgerCount(dir) === 0, "6b2. nothing recorded");
}
{
  // 6c — report VERIFIED but for ANOTHER mission ⇒ identity mismatch ⇒ UNKNOWN (never borrow a verdict).
  const dir = sandbox(); const M = "ECON_MISMATCH";
  stageEnforced(dir, M);
  writeEcon(dir, { mission: "SOME_OTHER_MISSION", verdict: "VERIFIED", violations: [], gaps: [], proofs: [] });
  const r = recordIn(dir, M);
  check(r.skipped === true && r.verdict === "UNKNOWN", "6c. enabled + VERIFIED-for-another-mission ⇒ UNKNOWN, no release");
  check(ledgerCount(dir) === 0, "6c2. nothing recorded (identity enforced)");
}

// 7 — no budget / dormant economic verification: a mission that did NOT opt in records regardless of whether
//     an economic report exists — proving the gate is a pure NO-OP when enforcement is disabled.
{
  const dir = sandbox(); const M = "ECON_DORMANT";
  writeContract(dir, M, { mission: M, status: "AUTHORIZED", authorized_paths: ["runtime/core"] }); // no control block at all
  writeReport(dir, M, true);
  // no economic report (dormant, as when no budget was declared)
  const r = recordIn(dir, M);
  check(r.skipped !== true && r.entry && r.entry.proven === true, "7. not-opted-in + no economic report ⇒ recorded (dormant NO-OP)");
  check(ledgerCount(dir) === 1, "7b. legacy behavior unchanged when enforcement disabled");
}

console.log(failures === 0 ? "ALL PASS — V5 ECONOMIC ENFORCEMENT LEDGER RELEASE GATE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
