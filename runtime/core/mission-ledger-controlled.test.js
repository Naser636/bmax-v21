#!/usr/bin/env node
"use strict";

/*
 * V5 CONTROLLED EXECUTION — live release-gate regression for the mission-ledger controlled gate.
 *
 * Proves that wiring mechanical acceptance into the universal proven/release choke point
 * (runtime/core/mission-ledger.js recordMission) enforces, for CONTROLLED missions only, that release
 * (= recording the mission proven) requires evaluateAcceptance(facts) === ACCEPT on FACTS, never the
 * worker's textual claim; and that LEGACY missions behave EXACTLY as before.
 *
 * Fully isolated like mission-ledger-proven-gate.test.js: each case runs recordMission in a throwaway
 * cwd with the governance fixtures + staged contract/artifacts, so the real ledger is never touched.
 *
 * Run directly: node runtime/core/mission-ledger-controlled.test.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = process.cwd();
const { recordMission } = require(path.join(REPO, "runtime", "core", "mission-ledger.js"));
const { commitAllowed, VERDICT } = require(path.join(REPO, "runtime", "core", "mechanical-acceptance.js"));

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-controlled-"));
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
function writeVerify(dir, verify) { fs.writeFileSync(G(dir, "runtime-verify.json"), JSON.stringify(verify)); }
function writeCheckpoint(dir, cp) { fs.writeFileSync(G(dir, "pipeline-checkpoint.json"), JSON.stringify(cp)); }
function writeContract(dir, mission, contract) {
  fs.writeFileSync(path.join(dir, "runtime", "missions", mission + ".json"), JSON.stringify(contract));
}
function ledgerCount(dir) {
  try { return JSON.parse(fs.readFileSync(G(dir, "mission-ledger.json"), "utf8")).count; } catch { return 0; }
}
function recordIn(dir, mission) {
  const prev = process.cwd();
  process.chdir(dir);
  try { return recordMission(mission); } finally { process.chdir(prev); }
}

// A fully-proven controlled set-up, minus whatever a given case removes/breaks.
function stageControlledOk(dir, mission) {
  writeContract(dir, mission, {
    mission, status: "AUTHORIZED", control: { required: true },
    authorized_paths: ["runtime/core"],
    evidence: ["runtime/generated/mission-report.json"],
  });
  writeReport(dir, mission, true); // worker CLAIM (also satisfies the pre-existing proven-gate)
  writeVerify(dir, { build: true, typescript: true, gitClean: true });
  writeCheckpoint(dir, { mission, status: "COMPLETE", startedAt: "2026-01-01T00:00:00Z", modifiedFiles: ["runtime/core/x.js"], rollback: { head: "base0" } });
}

console.log("V5 CONTROLLED EXECUTION — LEDGER RELEASE GATE");

// 1 — controlled + valid facts ⇒ ACCEPT ⇒ release allowed (recorded proven).
{
  const dir = sandbox(); const M = "CTRL_OK";
  stageControlledOk(dir, M);
  const r = recordIn(dir, M);
  check(r.skipped !== true && r.entry && r.entry.proven === true, "1. controlled + valid facts ⇒ released (recorded proven)");
  check(ledgerCount(dir) === 1, "1b. exactly one proven entry");
}

// 2 — controlled + missing (declared) evidence ⇒ no release.
{
  const dir = sandbox(); const M = "CTRL_MISSING_EV";
  stageControlledOk(dir, M);
  writeContract(dir, M, { mission: M, status: "AUTHORIZED", control: { required: true }, authorized_paths: ["runtime/core"], evidence: ["runtime/generated/DOES_NOT_EXIST.json"] });
  const r = recordIn(dir, M);
  check(r.skipped === true && r.reason === "NOT_ACCEPTED" && r.verdict === VERDICT.REJECT, "2. controlled + missing evidence ⇒ REJECT, no release");
  check(ledgerCount(dir) === 0, "2b. nothing recorded");
}

// 3 — controlled + failed required check ⇒ no release.
{
  const dir = sandbox(); const M = "CTRL_RED_BUILD";
  stageControlledOk(dir, M);
  writeVerify(dir, { build: false, typescript: true, gitClean: true });
  const r = recordIn(dir, M);
  check(r.skipped === true && r.reason === "NOT_ACCEPTED" && r.verdict === VERDICT.REJECT, "3. controlled + failed required check ⇒ REJECT, no release");
  check(ledgerCount(dir) === 0, "3b. nothing recorded");
}

// 4 — controlled + unauthorized diff (outside write_set) ⇒ no release.
{
  const dir = sandbox(); const M = "CTRL_BAD_DIFF";
  stageControlledOk(dir, M);
  writeCheckpoint(dir, { mission: M, status: "COMPLETE", startedAt: "2026-01-01T00:00:00Z", modifiedFiles: ["src/app/page.tsx"], rollback: { head: "base0" } });
  const r = recordIn(dir, M);
  check(r.skipped === true && r.reason === "NOT_ACCEPTED" && r.verdict === VERDICT.REJECT, "4. controlled + unauthorized diff ⇒ REJECT, no release");
  check(ledgerCount(dir) === 0, "4b. nothing recorded");
}

// 5 — controlled + UNKNOWN (interrupted RUNNING) ⇒ no release.
{
  const dir = sandbox(); const M = "CTRL_RUNNING";
  stageControlledOk(dir, M);
  writeCheckpoint(dir, { mission: M, status: "RUNNING", startedAt: "2026-01-01T00:00:00Z", modifiedFiles: ["runtime/core/x.js"], rollback: { head: "base0" } });
  const r = recordIn(dir, M);
  check(r.skipped === true && r.reason === "NOT_ACCEPTED" && r.verdict === VERDICT.UNKNOWN, "5. controlled + interrupted RUNNING ⇒ UNKNOWN, no release");
  check(ledgerCount(dir) === 0, "5b. nothing recorded");
}

// 6 — controlled + fake PASS declaration (claim only, no facts) ⇒ no release.
{
  const dir = sandbox(); const M = "CTRL_FAKE_PASS";
  // Contract declares control + write_set; the worker writes a loud validated:true / SUCCESS report,
  // but NO verify artifact and NO checkpoint exist — so nothing is mechanically proven.
  writeContract(dir, M, { mission: M, status: "AUTHORIZED", control: { required: true }, authorized_paths: ["runtime/core"] });
  fs.writeFileSync(G(dir, "mission-report.json"), JSON.stringify({ mission: M, validated: true, status: "SUCCESS — ALL GREEN — DONE" }));
  const r = recordIn(dir, M);
  check(r.skipped === true && r.reason === "NOT_ACCEPTED" && r.verdict === VERDICT.UNKNOWN, "6. controlled + fake PASS text (no facts) ⇒ UNKNOWN, no release");
  check(ledgerCount(dir) === 0, "6b. worker's textual claim alone never releases a controlled mission");
}

// 7 — legacy mission ⇒ existing behavior unchanged (no control declared).
{
  const dir = sandbox(); const M = "LEGACY_OK";
  writeReport(dir, M, true); // the ONLY requirement on the legacy path, exactly as before
  const r = recordIn(dir, M);
  check(r.skipped !== true && r.entry && r.entry.proven === true, "7. legacy (no control) + validated report ⇒ recorded (unchanged)");
  check(ledgerCount(dir) === 1, "7b. legacy records exactly as the proven-gate always did");
}
{
  // Legacy mission with facts that WOULD reject a controlled mission (red build) still records — proving
  // no new requirement leaks onto the legacy path.
  const dir = sandbox(); const M = "LEGACY_REDBUILD";
  writeReport(dir, M, true);
  writeVerify(dir, { build: false, typescript: false, gitClean: false });
  writeCheckpoint(dir, { mission: M, status: "RUNNING", startedAt: "2026-01-01T00:00:00Z", modifiedFiles: ["anything/else.ts"] });
  const r = recordIn(dir, M);
  check(r.skipped !== true && r.entry && r.entry.proven === true, "7c. legacy ignores acceptance facts entirely (behavior truly unchanged)");
}

// 8 — commit/push remains impossible before ACCEPT (ledger refusal == no release; and the pure guard agrees).
{
  const dir = sandbox(); const M = "CTRL_NO_RELEASE";
  stageControlledOk(dir, M);
  writeVerify(dir, { build: false, typescript: true, gitClean: true }); // forces REJECT
  const r = recordIn(dir, M);
  check(r.skipped === true && r.verdict === VERDICT.REJECT, "8. not-ACCEPT controlled mission ⇒ ledger refuses (no release)");
  check(commitAllowed(r.verdict).allowed === false, "8b. commit guard also refuses the non-ACCEPT verdict (no commit/push before ACCEPT)");
}

// 9 — no duplicate mutation/release on replay where existing idempotency applies.
{
  const dir = sandbox(); const M = "CTRL_REPLAY";
  stageControlledOk(dir, M);
  const r1 = recordIn(dir, M);
  check(r1.skipped !== true && ledgerCount(dir) === 1, "9. controlled ACCEPT ⇒ first release recorded (count 1)");
  const r2 = recordIn(dir, M); // same (mission, runId=startedAt) ⇒ existing idempotence NO-OP
  check(r2.skipped === true && r2.reason === "DUPLICATE_RUN" && ledgerCount(dir) === 1, "9b. replay ⇒ DUPLICATE_RUN, no second release (idempotence preserved)");
}

console.log(failures === 0 ? "ALL PASS — V5 CONTROLLED EXECUTION LEDGER RELEASE GATE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
