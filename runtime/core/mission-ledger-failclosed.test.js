#!/usr/bin/env node
"use strict";

/*
 * V5 — mission-ledger OPT-IN gates FAIL CLOSED on an evaluator error (release-vs-commit consistency).
 *
 * Audit finding (Agent 1): the RELEASE mechanical gate's catch set { controlled:false } (NO-OP ⇒ fail-OPEN)
 * while its comment claimed "fail-closed", diverging from the commit path which refuses on an evaluator
 * error. The underlying fact-gatherer never throws in practice (so the branch was unreachable), but the
 * behaviour/comment contradiction + release-vs-commit divergence were real. Fix: on an evaluator error,
 * FAIL CLOSED for an OPTED-IN mission (controlDeclared / economicEnforced — independent safe reads), while a
 * LEGACY mission still proceeds. This test REPRODUCES the error path by injecting a throwing evaluator
 * through the (now namespaced) acceptance-facts seam and proves the deny-by-default behaviour.
 *
 * Isolated like mission-ledger-controlled.test.js. Run: node runtime/core/mission-ledger-failclosed.test.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = process.cwd();
const { recordMission } = require(path.join(REPO, "runtime", "core", "mission-ledger.js"));
const acceptanceFacts = require(path.join(REPO, "runtime", "core", "acceptance-facts.js"));

const GOV_FILES = [
  path.join("runtime", "constitution", "runtime-constitution.json"),
  path.join("runtime", "policies", "runtime-policies.json"),
  path.join("runtime", "governance", "state-machine.json"),
];

let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-failclosed-"));
  for (const rel of GOV_FILES) { fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true }); fs.copyFileSync(path.join(REPO, rel), path.join(dir, rel)); }
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "missions"), { recursive: true });
  return dir;
}
const G = (dir, n) => path.join(dir, "runtime", "generated", n);
const rep = (dir, m) => fs.writeFileSync(G(dir, "mission-report.json"), JSON.stringify({ mission: m, validated: true, status: "SUCCESS" }));
const con = (dir, m, c) => fs.writeFileSync(path.join(dir, "runtime", "missions", m + ".json"), JSON.stringify(c));
function ledgerCount(dir) { try { return JSON.parse(fs.readFileSync(G(dir, "mission-ledger.json"), "utf8")).count; } catch { return 0; } }
function recordIn(dir, m) { const p = process.cwd(); process.chdir(dir); try { return recordMission(m); } finally { process.chdir(p); } }

// Save originals so each case restores the seam (no cross-test leakage).
const origAcc = acceptanceFacts.evaluateMissionAcceptance;
const origEcon = acceptanceFacts.evaluateMissionEconomics;
const THROW = () => { throw new Error("injected evaluator failure"); };

console.log("V5 — MISSION-LEDGER FAIL-CLOSED ON EVALUATOR ERROR");

// 1 — mechanical evaluator throws + CONTROLLED mission ⇒ FAIL CLOSED (no release, no partial mutation).
try {
  acceptanceFacts.evaluateMissionAcceptance = THROW;
  const dir = sandbox(); const M = "FC_CTRL";
  con(dir, M, { mission: M, status: "AUTHORIZED", control: { required: true } });
  rep(dir, M);
  const r = recordIn(dir, M);
  check(r.skipped === true && r.reason === "ACCEPTANCE_EVALUATION_ERROR", "1. evaluator throws + controlled ⇒ FAIL CLOSED (ACCEPTANCE_EVALUATION_ERROR)");
  check(ledgerCount(dir) === 0, "1b. nothing recorded (deny-by-default)");
  fs.rmSync(dir, { recursive: true, force: true });
} finally { acceptanceFacts.evaluateMissionAcceptance = origAcc; }

// 2 — mechanical evaluator throws + LEGACY mission (no control) ⇒ still records (never break legacy).
try {
  acceptanceFacts.evaluateMissionAcceptance = THROW;
  const dir = sandbox(); const M = "FC_LEGACY";
  con(dir, M, { mission: M, status: "AUTHORIZED" }); // no control block
  rep(dir, M);
  const r = recordIn(dir, M);
  check(r.skipped !== true && r.entry && r.entry.proven === true, "2. evaluator throws + legacy ⇒ still recorded (legacy never broken)");
  check(ledgerCount(dir) === 1, "2b. exactly one proven entry");
  fs.rmSync(dir, { recursive: true, force: true });
} finally { acceptanceFacts.evaluateMissionAcceptance = origAcc; }

// 3 — economic evaluator throws + ECONOMIC-ENFORCED mission ⇒ FAIL CLOSED (no release).
try {
  acceptanceFacts.evaluateMissionEconomics = THROW;
  const dir = sandbox(); const M = "FC_ECON";
  con(dir, M, { mission: M, status: "AUTHORIZED", control: { economic: true } }); // opts into economic only
  rep(dir, M);
  const r = recordIn(dir, M);
  check(r.skipped === true && r.reason === "ECONOMIC_EVALUATION_ERROR", "3. evaluator throws + economically-enforced ⇒ FAIL CLOSED (ECONOMIC_EVALUATION_ERROR)");
  check(ledgerCount(dir) === 0, "3b. nothing recorded (deny-by-default)");
  fs.rmSync(dir, { recursive: true, force: true });
} finally { acceptanceFacts.evaluateMissionEconomics = origEcon; }

// 4 — economic evaluator throws + LEGACY mission ⇒ still records (never break legacy).
try {
  acceptanceFacts.evaluateMissionEconomics = THROW;
  const dir = sandbox(); const M = "FC_ECON_LEGACY";
  con(dir, M, { mission: M, status: "AUTHORIZED" });
  rep(dir, M);
  const r = recordIn(dir, M);
  check(r.skipped !== true && r.entry && r.entry.proven === true, "4. economic evaluator throws + legacy ⇒ still recorded");
  check(ledgerCount(dir) === 1, "4b. exactly one proven entry");
  fs.rmSync(dir, { recursive: true, force: true });
} finally { acceptanceFacts.evaluateMissionEconomics = origEcon; }

// 5 — seam restored: normal (no-throw) controlled mission with valid ACCEPT facts still records (no regression).
{
  const dir = sandbox(); const M = "FC_NORMAL";
  con(dir, M, { mission: M, status: "AUTHORIZED", control: { required: true }, authorized_paths: ["runtime/core"], evidence: ["runtime/generated/mission-report.json"] });
  rep(dir, M);
  fs.writeFileSync(G(dir, "runtime-verify.json"), JSON.stringify({ build: true, typescript: true, gitClean: true }));
  fs.writeFileSync(G(dir, "pipeline-checkpoint.json"), JSON.stringify({ mission: M, status: "COMPLETE", startedAt: "2026-01-01T00:00:00Z", modifiedFiles: ["runtime/core/x.js"], rollback: { head: "base0" } }));
  const r = recordIn(dir, M);
  check(r.skipped !== true && r.entry && r.entry.proven === true, "5. no-throw controlled + ACCEPT facts ⇒ records (no regression from namespacing)");
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? "ALL PASS — V5 MISSION-LEDGER FAIL-CLOSED" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
