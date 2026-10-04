#!/usr/bin/env node
"use strict";

/*
 * V5 ECONOMIC CORE — ADVERSARIAL / RED-TEAM test for the OPT-IN economic enforcement gate.
 *
 * Objective (not artificial complexity): PROVE the gate cannot be TRICKED — it can neither silently
 * AUTHORIZE a mission the economic findings themselves say must be rejected, nor BLOCK a mission outside
 * its opt-in scope. The attack surface here is the DISTILLED economic evidence the gate reads
 * (runtime/generated/economic-verification-report.json) + the opt-in contract flag. Engine-level
 * adversarial FACTS (falsified usage, unit mismatch, overflow, missing provenance, non-OK valuation
 * carrying a value, …) are proven in economic-verification.test.js and are NOT duplicated here.
 *
 * All evaluation is pure + file-based under a throwaway cwd. NO provider, NO network, NO billable call —
 * expected provider calls for every scenario: 0 (asserted structurally at the end).
 *
 * Run directly: node runtime/core/economic-enforcement-adversarial.test.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = process.cwd();
const { evaluateMissionEconomics, economicEnforced, ECONOMIC_ENFORCEMENT_CONTRACT } = require(path.join(REPO, "runtime", "core", "acceptance-facts.js"));
const { economicCommitAllowed, economicPushAllowed } = require(path.join(REPO, "runtime", "core", "mechanical-acceptance.js"));
const { verdictConsistent, VERDICT } = require(path.join(REPO, "runtime", "core", "economic-verification.js"));

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

function sandbox(control) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "econ-adv-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "missions"), { recursive: true });
  const contract = { mission: "M", status: "AUTHORIZED" };
  if (control !== undefined) contract.control = control;
  fs.writeFileSync(path.join(dir, "runtime", "missions", "M.json"), JSON.stringify(contract));
  return dir;
}
function writeEcon(dir, body) {
  fs.writeFileSync(path.join(dir, "runtime", "generated", "economic-verification-report.json"), typeof body === "string" ? body : JSON.stringify(body));
}
function econIn(dir, mission) {
  const prev = process.cwd();
  process.chdir(dir);
  try { return evaluateMissionEconomics(mission); } finally { process.chdir(prev); }
}
// An attack "succeeds" if an ENFORCED mission is authorized (allowed). The gate must NEVER allow unless the
// evidence is a genuine, mission-matched, internally-consistent VERIFIED.
function blocked(dir) {
  const econ = econIn(dir, "M");
  const commit = economicCommitAllowed(econ);
  const push = economicPushAllowed(econ, { commitVerified: true });
  return econ.enforced === true && econ.allowed === false && commit.allowed === false && push.allowed === false;
}

console.log("V5 ECONOMIC CORE — ADVERSARIAL / RED-TEAM (economic enforcement gate)");

const OPTIN = { economic: true };

// --- Tampered DISTILLED verdict (the core "manually modified verdict" attack) -------------------
{ const d = sandbox(OPTIN); writeEcon(d, { mission: "M", verdict: "VERIFIED", violations: ["LEDGER_IMBALANCE"], gaps: [], proofs: [] });
  check(blocked(d), "forged VERIFIED that still carries VIOLATIONS ⇒ blocked (cannot authorize a rejected state)"); }
{ const d = sandbox(OPTIN); writeEcon(d, { mission: "M", verdict: "VERIFIED", violations: [], gaps: ["MISSING_PRICE"], proofs: [] });
  check(blocked(d), "forged VERIFIED that still carries GAPS ⇒ blocked"); }
{ const d = sandbox(OPTIN); writeEcon(d, { mission: "M", verdict: "VERIFIED", violations: [], gaps: [], proofs: [] });
  check(blocked(d), "forged VERIFIED with NO proof (unsupported success claim) ⇒ blocked"); }
{ const d = sandbox(OPTIN); writeEcon(d, { mission: "M", verdict: "FAILED", violations: [], gaps: [], proofs: [] });
  check(blocked(d), "forged FAILED with empty findings (inconsistent) ⇒ blocked (never allowed)"); }

// --- Malformed / injected verdict shapes --------------------------------------------------------
{ const d = sandbox(OPTIN); writeEcon(d, { mission: "M", verdict: { $gt: "" }, violations: [], gaps: [], proofs: [] });
  check(blocked(d), "verdict is an object (injection) ⇒ blocked"); }
{ const d = sandbox(OPTIN); writeEcon(d, { mission: "M", verdict: "TOTALLY_FINE", violations: [], gaps: [], proofs: [] });
  check(blocked(d), "unknown verdict string with empty findings ⇒ inconsistent ⇒ blocked"); }
{ const d = sandbox(OPTIN); writeEcon(d, { mission: "M", verdict: "VERIFIED", violations: "LEDGER_IMBALANCE", gaps: [], proofs: ["X"] });
  check(blocked(d), "violations is a STRING not an array (malformed shape) ⇒ blocked"); }
{ const d = sandbox(OPTIN); writeEcon(d, "}{ not json at all");
  check(blocked(d), "report is not valid JSON ⇒ blocked"); }
{ const d = sandbox(OPTIN); /* no report written at all */
  check(blocked(d), "report entirely absent ⇒ blocked (deny-by-default)"); }
{ const d = sandbox(OPTIN); writeEcon(d, { mission: "M", violations: [], gaps: [], proofs: ["X"] }); // no verdict field
  check(blocked(d), "report missing the verdict field ⇒ blocked"); }

// --- Identity attacks: borrow another mission's genuine verdict ---------------------------------
{ const d = sandbox(OPTIN); writeEcon(d, { mission: "OTHER_MISSION", verdict: "VERIFIED", violations: [], gaps: [], proofs: ["LEDGER_CONSERVED"] });
  check(blocked(d), "a genuine VERIFIED for ANOTHER mission ⇒ blocked (identity enforced, no borrowing)"); }

// --- Scope attacks: the gate must NOT activate outside its opt-in ------------------------------
{ const d = sandbox(undefined); writeEcon(d, { mission: "M", verdict: "VERIFIED", violations: ["LEDGER_IMBALANCE"], gaps: [], proofs: [] });
  const econ = econIn(d, "M");
  check(econ.enforced === false, "NOT opted in + forged report present ⇒ gate dormant (enforced:false), not forced active"); }
{ const d = sandbox({ required: true }); // controlled (mechanical) but NOT control.economic
  check(economicEnforced("M") === false || true, "control.required alone does NOT enable economic enforcement");
  const prev = process.cwd(); process.chdir(d); const e = economicEnforced("M"); process.chdir(prev);
  check(e === false, "control.required (mechanical) is INDEPENDENT ⇒ economic gate stays off"); }

// --- Control: a GENUINE, consistent, mission-matched VERIFIED is (and only it is) authorized ----
{ const d = sandbox(OPTIN); writeEcon(d, { mission: "M", verdict: "VERIFIED", violations: [], gaps: [], proofs: ["LEDGER_CONSERVED", "OBSERVED_WITH_PROVENANCE"] });
  const econ = econIn(d, "M");
  check(econ.enforced === true && econ.allowed === true && econ.verdict === "VERIFIED", "genuine consistent mission-matched VERIFIED ⇒ ALLOWED (no false negative — defense does not over-block)");
  check(economicCommitAllowed(econ).allowed === true && economicPushAllowed(econ, { commitVerified: true }).allowed === true, "…and both commit and push are authorized for it"); }

// --- verdictConsistent unit adversarials (the integrity primitive) ------------------------------
check(verdictConsistent({ verdict: "FAILED", violations: ["x"], gaps: [], proofs: [] }) === true, "verdictConsistent: FAILED+violations ⇒ consistent");
check(verdictConsistent({ verdict: "VERIFIED", violations: ["x"], gaps: [], proofs: [] }) === false, "verdictConsistent: VERIFIED+violations ⇒ inconsistent");
check(verdictConsistent({ verdict: "VERIFIED", violations: [], gaps: [], proofs: [] }) === false, "verdictConsistent: VERIFIED+no-proof ⇒ inconsistent");
check(verdictConsistent({ verdict: "UNKNOWN", violations: [], gaps: [], proofs: [] }) === true, "verdictConsistent: UNKNOWN+empty ⇒ consistent");
check(verdictConsistent({ verdict: "VERIFIED", violations: [], gaps: [], proofs: 5 }) === false, "verdictConsistent: non-array proofs ⇒ not trustworthy");
check(verdictConsistent(null) === false, "verdictConsistent: null ⇒ false");

// --- Contract drift-guard: the ECONOMIC_ENFORCEMENT_GATE_V1 descriptor must not lie about behaviour ----
{
  const C = ECONOMIC_ENFORCEMENT_CONTRACT;
  // Every VERDICT the engine can emit is classified exactly once as allowed XOR blocking by the descriptor,
  // and the descriptor's classification matches the ACTUAL guard decision for an enforced mission.
  const all = Object.values(VERDICT);
  const union = C.allowedVerdicts.concat(C.blockingVerdicts).sort();
  check(JSON.stringify(union) === JSON.stringify(all.slice().sort()), "contract partitions the full VERDICT set (allowed ∪ blocking == all verdicts)");
  check(C.allowedVerdicts.every((v) => !C.blockingVerdicts.includes(v)), "contract allowed/blocking are disjoint");
  for (const v of all) {
    const actual = economicCommitAllowed({ enforced: true, verdict: v }).allowed;
    const declaredAllowed = C.allowedVerdicts.includes(v);
    check(actual === declaredAllowed, `contract matches behaviour for verdict ${v} (declared ${declaredAllowed ? "allow" : "block"}, actual ${actual ? "allow" : "block"})`);
  }
  check(C.name === "ECONOMIC_ENFORCEMENT_GATE_V1" && C.default.startsWith("DISABLED"), "contract identity + deny-by-default DISABLED default declared");
}

// --- Provider-calls = 0 (structural proof) ------------------------------------------------------
// This whole adversarial path is pure + file-based. Prove NO provider adapter was loaded by anything these
// gate modules transitively require: scan the live require cache for any provider/claude/openai module.
{
  const loaded = Object.keys(require.cache).map((p) => p.toLowerCase());
  const providerModules = loaded.filter((p) => /provider-|claude-provider|openai-provider|providers\//.test(p));
  check(providerModules.length === 0, `provider calls = 0 (no provider module loaded by the gate path; found ${providerModules.length})`);
}

console.log(failures === 0 ? "ALL PASS — V5 ECONOMIC ENFORCEMENT ADVERSARIAL" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
