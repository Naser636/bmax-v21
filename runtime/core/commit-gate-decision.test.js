#!/usr/bin/env node
"use strict";

/*
 * V5 — LIVE COMMIT AUTHORIZATION: the read-only commitGateDecision(mission) that the live commit path
 * (AutonomyRuntimeAdapter.commitAuthorizedDeliverable) consults before committing an authorized deliverable.
 *
 * Proves it composes the EXISTING §7 guards with NO new policy/verdict/source of truth:
 *   - MECHANICAL (control.required): must pass mechanical acceptance (ACCEPT) — reuses evaluateMissionAcceptance
 *     + commitAllowed (identical facts to the mission-ledger controlled gate);
 *   - ECONOMIC (control.economic): must carry a VERIFIED economic verdict — reuses evaluateMissionEconomics
 *     + economicCommitAllowed;
 *   - OPT-IN: a mission that declares neither ⇒ allowed:true (NO-OP, legacy commit behaviour unchanged);
 *   - DENY-BY-DEFAULT: a controlled/enforced mission with a non-ACCEPT / non-VERIFIED / missing / malformed /
 *     inconsistent verdict ⇒ allowed:false, with a precise reason.
 *
 * Pure read-only under a throwaway cwd. No provider, no network. Run: node runtime/core/commit-gate-decision.test.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = process.cwd();
const { commitGateDecision } = require(path.join(REPO, "runtime", "core", "acceptance-facts.js"));

let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "commit-gate-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "missions"), { recursive: true });
  return dir;
}
const G = (dir, n) => path.join(dir, "runtime", "generated", n);
const con = (dir, m, c) => fs.writeFileSync(path.join(dir, "runtime", "missions", m + ".json"), JSON.stringify(c));
const rep = (dir, m, v) => fs.writeFileSync(G(dir, "mission-report.json"), JSON.stringify({ mission: m, validated: v, status: v ? "SUCCESS" : "FAILED" }));
const ver = (dir, v) => fs.writeFileSync(G(dir, "runtime-verify.json"), JSON.stringify(v));
const ck = (dir, c) => fs.writeFileSync(G(dir, "pipeline-checkpoint.json"), JSON.stringify(c));
function econ(dir, m, verdict) {
  const r = { mission: m, verdict, violations: [], gaps: [], proofs: [] };
  if (verdict === "FAILED") r.violations = ["LEDGER_IMBALANCE"];
  else if (verdict === "INCOMPLETE") r.gaps = ["MISSING_PRICE"];
  else if (verdict === "VERIFIED") r.proofs = ["LEDGER_CONSERVED"];
  fs.writeFileSync(G(dir, "economic-verification-report.json"), JSON.stringify(r));
}
function decide(dir, m) { const p = process.cwd(); process.chdir(dir); try { return commitGateDecision(m); } finally { process.chdir(p); } }
// A fully-proven CONTROLLED (mechanical) set-up (mirrors mission-ledger-controlled.stageControlledOk).
function mechOk(dir, m) {
  con(dir, m, { mission: m, status: "AUTHORIZED", control: { required: true }, authorized_paths: ["runtime/core"], evidence: ["runtime/generated/mission-report.json"] });
  rep(dir, m, true);
  ver(dir, { build: true, typescript: true, gitClean: true });
  ck(dir, { mission: m, status: "COMPLETE", startedAt: "2026-01-01T00:00:00Z", modifiedFiles: ["runtime/core/x.js"], rollback: { head: "base0" } });
}

console.log("V5 — LIVE COMMIT AUTHORIZATION (commitGateDecision)");

// 1 — legacy: no control block ⇒ NO-OP allowed.
{ const d = sandbox(); con(d, "M", { mission: "M", status: "AUTHORIZED" }); const r = decide(d, "M");
  check(r.allowed === true && r.reasons.length === 0, "1. legacy (no control) ⇒ allowed (NO-OP, legacy unchanged)"); }

// 2 — economic VERIFIED ⇒ allowed.
{ const d = sandbox(); con(d, "M", { mission: "M", status: "AUTHORIZED", control: { economic: true } }); econ(d, "M", "VERIFIED");
  check(decide(d, "M").allowed === true, "2. economic VERIFIED ⇒ allowed"); }

// 3,4 — economic FAILED / INCOMPLETE ⇒ blocked.
for (const v of ["FAILED", "INCOMPLETE"]) {
  const d = sandbox(); con(d, "M", { mission: "M", status: "AUTHORIZED", control: { economic: true } }); econ(d, "M", v);
  const r = decide(d, "M");
  check(r.allowed === false && r.reasons.some((x) => x.includes(v)), `3/4. economic ${v} ⇒ blocked (reason names ${v})`);
}

// 5 — economic enforced + missing evidence ⇒ blocked (UNKNOWN deny-by-default).
{ const d = sandbox(); con(d, "M", { mission: "M", status: "AUTHORIZED", control: { economic: true } });
  const r = decide(d, "M");
  check(r.allowed === false && r.reasons.some((x) => x.includes("UNKNOWN")), "5. economic enforced + missing evidence ⇒ blocked (UNKNOWN)"); }

// 6 — mechanical controlled + ACCEPT facts ⇒ allowed.
{ const d = sandbox(); mechOk(d, "M");
  check(decide(d, "M").allowed === true, "6. controlled + valid ACCEPT facts ⇒ allowed"); }

// 7 — mechanical controlled + red build ⇒ blocked.
{ const d = sandbox(); mechOk(d, "M"); ver(d, { build: false, typescript: true, gitClean: true });
  const r = decide(d, "M");
  check(r.allowed === false && r.reasons.some((x) => x.toLowerCase().includes("mechanical")), "7. controlled + red build ⇒ blocked (mechanical reason)"); }

// 8 — BOTH opted in, both pass ⇒ allowed.
{ const d = sandbox();
  con(d, "M", { mission: "M", status: "AUTHORIZED", control: { required: true, economic: true }, authorized_paths: ["runtime/core"], evidence: ["runtime/generated/mission-report.json"] });
  rep(d, "M", true); ver(d, { build: true, typescript: true, gitClean: true });
  ck(d, { mission: "M", status: "COMPLETE", startedAt: "2026-01-01T00:00:00Z", modifiedFiles: ["runtime/core/x.js"], rollback: { head: "base0" } });
  econ(d, "M", "VERIFIED");
  check(decide(d, "M").allowed === true, "8. both gates opted + both pass ⇒ allowed"); }

// 9 — BOTH opted in, economic fails ⇒ blocked (economic reason present).
{ const d = sandbox();
  con(d, "M", { mission: "M", status: "AUTHORIZED", control: { required: true, economic: true }, authorized_paths: ["runtime/core"], evidence: ["runtime/generated/mission-report.json"] });
  rep(d, "M", true); ver(d, { build: true, typescript: true, gitClean: true });
  ck(d, { mission: "M", status: "COMPLETE", startedAt: "2026-01-01T00:00:00Z", modifiedFiles: ["runtime/core/x.js"], rollback: { head: "base0" } });
  econ(d, "M", "FAILED");
  const r = decide(d, "M");
  check(r.allowed === false && r.reasons.some((x) => x.includes("economic")), "9. both opted + economic FAILED ⇒ blocked (economic reason)"); }

// 10 — BOTH opted in, mechanical fails ⇒ blocked (mechanical reason present).
{ const d = sandbox();
  con(d, "M", { mission: "M", status: "AUTHORIZED", control: { required: true, economic: true }, authorized_paths: ["runtime/core"], evidence: ["runtime/generated/mission-report.json"] });
  rep(d, "M", true); ver(d, { build: false, typescript: true, gitClean: true }); // red build ⇒ mechanical REJECT
  ck(d, { mission: "M", status: "COMPLETE", startedAt: "2026-01-01T00:00:00Z", modifiedFiles: ["runtime/core/x.js"], rollback: { head: "base0" } });
  econ(d, "M", "VERIFIED");
  const r = decide(d, "M");
  check(r.allowed === false && r.reasons.some((x) => x.toLowerCase().includes("mechanical")), "10. both opted + mechanical REJECT ⇒ blocked (mechanical reason)"); }

console.log(failures === 0 ? "ALL PASS — V5 LIVE COMMIT AUTHORIZATION (commitGateDecision)" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
