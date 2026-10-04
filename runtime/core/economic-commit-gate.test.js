#!/usr/bin/env node
"use strict";

/*
 * V5 ECONOMIC CORE — OPT-IN economic COMMIT/PUSH gate (extension of the §7 commit/push authorization
 * boundary into the economic dimension).
 *
 * Proves that the commit/action authorization boundary (mechanical-acceptance.economicCommitAllowed /
 * economicPushAllowed) composes the INDEPENDENT economic verdict ALREADY produced by the economic engine
 * (economic-verification.verifyEconomics, surfaced read-only via acceptance-facts.evaluateMissionEconomics)
 * and, for ECONOMICALLY-ENFORCED missions only (contract control.economic === true), authorizes a commit/
 * push ONLY when the economic verdict is VERIFIED. It RECOMPUTES nothing and invents no verdict. For
 * missions that do NOT opt in the guards are a pure NO-OP, so the existing commit/push behaviour is exactly
 * as before. Deny-by-default: INCOMPLETE/UNKNOWN/FAILED and absent/malformed/wrong-mission evidence refuse.
 *
 * No provider, no external call, no I/O beyond throwaway fixture files under a temp cwd.
 *
 * Run directly: node runtime/core/economic-commit-gate.test.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = process.cwd();
const { evaluateMissionEconomics } = require(path.join(REPO, "runtime", "core", "acceptance-facts.js"));
const {
  commitAllowed, pushAllowed, economicCommitAllowed, economicPushAllowed, VERDICT,
} = require(path.join(REPO, "runtime", "core", "mechanical-acceptance.js"));

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "econ-commit-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "missions"), { recursive: true });
  return dir;
}
const G = (dir, name) => path.join(dir, "runtime", "generated", name);
function writeContract(dir, mission, contract) {
  fs.writeFileSync(path.join(dir, "runtime", "missions", mission + ".json"), JSON.stringify(contract));
}
function writeEcon(dir, body) {
  fs.writeFileSync(G(dir, "economic-verification-report.json"), typeof body === "string" ? body : JSON.stringify(body));
}
// Resolve economics for a mission under the fixture cwd (reads the economic report read-only).
function economicsIn(dir, mission) {
  const prev = process.cwd();
  process.chdir(dir);
  try { return evaluateMissionEconomics(mission); } finally { process.chdir(prev); }
}
// Stage an economically-enforced mission (control.economic:true) with a given economic verdict.
function stageEnforced(dir, mission, verdict) {
  writeContract(dir, mission, { mission, status: "AUTHORIZED", control: { economic: true } });
  if (verdict !== undefined) writeEcon(dir, { mission, verdict, violations: [], gaps: [], proofs: [] });
}

console.log("V5 ECONOMIC CORE — ECONOMIC COMMIT/PUSH GATE");

// 1 — enforcement DISABLED ⇒ exact legacy commit behaviour (economic guard is a NO-OP that allows).
{
  const dir = sandbox(); const M = "CG_DISABLED";
  writeContract(dir, M, { mission: M, status: "AUTHORIZED" }); // no control.economic
  writeEcon(dir, { mission: M, verdict: "FAILED", violations: ["LEDGER_IMBALANCE"], gaps: [], proofs: [] }); // present but irrelevant
  const econ = economicsIn(dir, M);
  check(econ.enforced === false, "1. not opted in ⇒ enforced:false");
  check(economicCommitAllowed(econ).allowed === true, "1b. disabled ⇒ economic commit guard allows (legacy unchanged)");
  check(economicPushAllowed(econ, { commitVerified: true }).allowed === true, "1c. disabled ⇒ economic push guard allows (legacy unchanged)");
}

// 2 — enabled + VERIFIED ⇒ commit allowed; push allowed once the commit is verified.
{
  const dir = sandbox(); const M = "CG_VERIFIED";
  stageEnforced(dir, M, "VERIFIED");
  const econ = economicsIn(dir, M);
  check(econ.enforced === true && econ.verdict === "VERIFIED", "2. enabled + VERIFIED ⇒ enforced + VERIFIED");
  check(economicCommitAllowed(econ).allowed === true, "2b. VERIFIED ⇒ commit authorized");
  check(economicPushAllowed(econ, { commitVerified: true }).allowed === true, "2c. VERIFIED + commit verified ⇒ push authorized");
  check(economicPushAllowed(econ, { commitVerified: false }).allowed === false, "2d. VERIFIED but commit NOT verified ⇒ push refused");
}

// 3,4,5 — enabled + INCOMPLETE / UNKNOWN / FAILED ⇒ commit & push denied.
for (const v of ["INCOMPLETE", "UNKNOWN", "FAILED"]) {
  const dir = sandbox(); const M = "CG_" + v;
  stageEnforced(dir, M, v);
  const econ = economicsIn(dir, M);
  check(economicCommitAllowed(econ).allowed === false && economicCommitAllowed(econ).verdict === v, `3/4/5. enabled + ${v} ⇒ commit refused`);
  check(economicPushAllowed(econ, { commitVerified: true }).allowed === false, `3/4/5b. enabled + ${v} ⇒ push refused even with commit verified`);
}

// 6 — missing economic evidence ⇒ deny (UNKNOWN deny-by-default).
{
  const dir = sandbox(); const M = "CG_ABSENT";
  stageEnforced(dir, M); // no economic report
  const econ = economicsIn(dir, M);
  check(econ.enforced === true && econ.verdict === "UNKNOWN", "6. enabled + absent evidence ⇒ UNKNOWN");
  check(economicCommitAllowed(econ).allowed === false, "6b. absent evidence ⇒ commit refused (deny-by-default)");
}

// 7 — malformed economic evidence ⇒ deny.
{
  const dir = sandbox(); const M = "CG_MALFORMED";
  stageEnforced(dir, M);
  writeEcon(dir, "}{ not json");
  const econ = economicsIn(dir, M);
  check(economicCommitAllowed(econ).allowed === false && econ.verdict === "UNKNOWN", "7. malformed evidence ⇒ commit refused (UNKNOWN)");
}

// 8 — wrong-mission economic evidence ⇒ deny (never borrow another mission's verdict).
{
  const dir = sandbox(); const M = "CG_MISMATCH";
  stageEnforced(dir, M);
  writeEcon(dir, { mission: "OTHER", verdict: "VERIFIED", violations: [], gaps: [], proofs: [] });
  const econ = economicsIn(dir, M);
  check(economicCommitAllowed(econ).allowed === false && econ.verdict === "UNKNOWN", "8. VERIFIED-for-another-mission ⇒ commit refused (identity enforced)");
}

// 9 — the EXISTING mechanical commit/push guards are unchanged (ACCEPT ⇒ allowed; non-ACCEPT ⇒ refused).
{
  check(commitAllowed(VERDICT.ACCEPT).allowed === true, "9. mechanical commitAllowed(ACCEPT) still allows");
  check(commitAllowed(VERDICT.REJECT).allowed === false, "9b. mechanical commitAllowed(REJECT) still refuses");
  check(pushAllowed(VERDICT.ACCEPT, { commitVerified: true }).allowed === true, "9c. mechanical pushAllowed(ACCEPT + commit) still allows");
  check(pushAllowed(VERDICT.ACCEPT, { commitVerified: false }).allowed === false, "9d. mechanical pushAllowed without commit still refuses");
}

// 10 — the economic gate does NOT activate merely because economic evidence exists: a mission that did not
//      opt in, but has a VERIFIED economic report present, is still a NO-OP (allowed) — opt-in is required.
{
  const dir = sandbox(); const M = "CG_EVIDENCE_NO_OPTIN";
  writeContract(dir, M, { mission: M, status: "AUTHORIZED" }); // NOT opted in
  writeEcon(dir, { mission: M, verdict: "VERIFIED", violations: [], gaps: [], proofs: [] });
  const econ = economicsIn(dir, M);
  check(econ.enforced === false, "10. economic evidence present but not opted in ⇒ enforced:false (gate dormant)");
  check(economicCommitAllowed(econ).allowed === true, "10b. not opted in ⇒ commit allowed regardless of the present evidence");
}

// 11 — determinism / purity: the pure guard is a function of the economics object alone.
{
  const v = { enforced: true, verdict: "VERIFIED" };
  check(JSON.stringify(economicCommitAllowed(v)) === JSON.stringify(economicCommitAllowed(v)), "11. economicCommitAllowed deterministic (pure, no I/O)");
  check(economicCommitAllowed({ enforced: true, verdict: "VERIFIED" }).allowed === true && economicCommitAllowed({ enforced: true, verdict: "UNKNOWN" }).allowed === false, "11b. pure guard: VERIFIED allow, non-VERIFIED deny");
}

console.log(failures === 0 ? "ALL PASS — V5 ECONOMIC COMMIT/PUSH GATE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
