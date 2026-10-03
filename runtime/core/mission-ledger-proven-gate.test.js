#!/usr/bin/env node
"use strict";

/*
 * Mission Ledger proven-gate — DEFAULT-DENY regression.
 *
 * Locks the fix for the residual false-PROVEN bypass: recordMission used to record `proven: true`
 * whenever the mission-report was ABSENT or belonged to ANOTHER mission (it refused only an
 * explicit mission-matched validated !== true). Callers that never ran the Validation Engine first
 * (fleet-dispatcher at request-dispatch time, fleet-collector on a governance-only "VALIDATED"
 * exchange, any out-of-band `node mission-ledger.js <mission>`) thereby stamped missions proven
 * with no evidence. The gate is now DEFAULT-DENY: it records proven ONLY on a mission-matched
 * report with validated === true.
 *
 * This suite proves the OLD default-allow condition would have appended the no-evidence cases, and
 * the NEW gate refuses them, while every legitimate caller (which writes a matching validated
 * report first) still records. Fully isolated: each case runs recordMission in a throwaway cwd with
 * the governance fixtures copied in, so the real ledger under runtime/generated/ is never touched.
 *
 * Run directly: node runtime/core/mission-ledger-proven-gate.test.js
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-proven-gate-"));
  for (const rel of GOV_FILES) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.copyFileSync(path.join(REPO, rel), path.join(dir, rel));
  }
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  return dir;
}
const G = (dir, name) => path.join(dir, "runtime", "generated", name);
function writeReport(dir, mission, validated) {
  fs.writeFileSync(G(dir, "mission-report.json"), JSON.stringify({ mission, validated, status: validated ? "SUCCESS" : "FAILED" }));
}
function ledgerCount(dir) {
  try { return JSON.parse(fs.readFileSync(G(dir, "mission-ledger.json"), "utf8")).count; } catch { return 0; }
}
function recordIn(dir, mission) {
  const prev = process.cwd();
  process.chdir(dir);
  try { return recordMission(mission); } finally { process.chdir(prev); }
}

// The OLD default-allow gate, reproduced verbatim: it refused ONLY a mission-matched not-validated
// report, so an absent/mismatched report fell through and was recorded proven.
function oldGateWouldRefuse(report, mission) {
  return !!(report && report.mission === mission && report.validated !== true);
}

console.log("MISSION LEDGER PROVEN-GATE — DEFAULT-DENY");

// 0 — the defect exists on the OLD gate: no report / mismatched report ⇒ old gate did NOT refuse.
{
  check(oldGateWouldRefuse(null, "M") === false,
    "OLD gate did NOT refuse an absent report (reproduces the bypass)");
  check(oldGateWouldRefuse({ mission: "OTHER", validated: true }, "M") === false,
    "OLD gate did NOT refuse a mismatched report (reproduces the bypass)");
}

// 1 — FIX: no mission-report ⇒ UNPROVEN refuse, nothing recorded (fleet-dispatch / out-of-band case).
{
  const dir = sandbox();
  const r = recordIn(dir, "FLEET_DISPATCH_MISSION");
  check(r.skipped === true && r.reason === "UNPROVEN", "absent report ⇒ UNPROVEN refuse");
  check(ledgerCount(dir) === 0, "absent report ⇒ no proven entry written");
}

// 2 — FIX: report for a DIFFERENT mission ⇒ UNPROVEN refuse, nothing recorded.
{
  const dir = sandbox();
  writeReport(dir, "OTHER_MISSION", true);
  const r = recordIn(dir, "MISMATCH_MISSION");
  check(r.skipped === true && r.reason === "UNPROVEN", "mismatched report ⇒ UNPROVEN refuse");
  check(ledgerCount(dir) === 0, "mismatched report ⇒ no proven entry written");
}

// 3 — PRESERVED: a mission-matched validated report ⇒ records proven:true (legitimate pipeline/LOCAL/archive).
{
  const dir = sandbox();
  writeReport(dir, "GOOD_MISSION", true);
  const r = recordIn(dir, "GOOD_MISSION");
  check(r.skipped !== true && r.entry && r.entry.proven === true && r.entry.validated === true,
    "matched validated report ⇒ proven entry recorded (legitimate flow preserved)");
  check(ledgerCount(dir) === 1, "exactly one proven entry for the genuinely-validated mission");
}

// 4 — PRESERVED: a mission-matched validated:false report ⇒ UNPROVEN refuse (original behaviour intact).
{
  const dir = sandbox();
  writeReport(dir, "BAD_MISSION", false);
  const r = recordIn(dir, "BAD_MISSION");
  check(r.skipped === true && r.reason === "UNPROVEN", "matched validated:false ⇒ UNPROVEN refuse");
  check(ledgerCount(dir) === 0, "no entry for an explicitly-unvalidated mission");
}

console.log(failures === 0 ? "ALL PASS — MISSION LEDGER PROVEN-GATE (DEFAULT-DENY)" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
