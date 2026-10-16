#!/usr/bin/env node
"use strict";

/*
 * V5 CONTROLLED EXECUTION — read-only acceptance fact-gatherer.
 *
 * The MECHANICAL ACCEPTANCE evaluator (mechanical-acceptance.js) is PURE. This module is the thin, READ-ONLY
 * adapter that assembles its `facts` object for a given mission from artifacts ALREADY on the live release
 * path — NOT a new engine and NOT a new state source. It reads the mission contract + runtime-verify.json +
 * mission-report.json (a CLAIM) + pipeline-checkpoint.json (trusted diff/base). Evidence existence is probed
 * read-only; all reads are best-effort and never throw (missing/corrupt ⇒ "not provable" ⇒ non-ACCEPT,
 * fail-closed). Opt-in: controlDeclared() is false unless control.required === true (legacy untouched).
 *
 * STRICT TS PORT (V64 FINANCE/DEC-006, bounded semantics-preserving). The read-only gathering, opt-in
 * control/economic flags, class-aware required checks, the deny-by-default economic-enforcement gate (trusted
 * ONLY when present + mission-matched + verdict + verdictConsistent) and the commit gate are byte-identical.
 * Reuses the dual-ported ./mechanical-acceptance + ./economic-verification. READ-ONLY (no writes/network/secret).
 */

import * as fs from "fs";
import * as path from "path";
const { isControlled, evaluateAcceptance, commitAllowed, economicCommitAllowed } = require("./mechanical-acceptance") as any;
const { VERDICT: ECON_VERDICT, verdictConsistent } = require("./economic-verification") as any;

const MISSIONS_DIR = path.join("runtime", "missions");
const GEN = (name: string) => path.join("runtime", "generated", name);
const DEFAULT_REQUIRED_CHECKS = Object.freeze(["build", "typescript"]);

function readJsonSafe(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
function nonEmptyFile(file: string): boolean {
  try { return fs.statSync(file).size > 0; } catch { return false; }
}
function isPlainObject(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

// ---- ECONOMIC_ENFORCEMENT_GATE_V1 — frozen contract descriptor (documents the gate's governed policy) --
const ECONOMIC_ENFORCEMENT_CONTRACT = Object.freeze({
  id: "V5-ECONOMIC-CORE-ECONOMIC-ENFORCEMENT-GATE",
  name: "ECONOMIC_ENFORCEMENT_GATE_V1",
  policyVersion: "1.0.0",
  purpose: "pipeline success is NOT economic success — refuse release/commit of an OPTED-IN mission whose independent economic verdict is not VERIFIED",
  authority: "ODG Runtime governance (human-authorized LOCAL enforcement)",
  authorityBoundary: "mission-ledger.recordMission (release) + mechanical-acceptance.economicCommitAllowed/economicPushAllowed (commit/push); economic-verification is the VERIFIER, these are the AUTHORITY",
  verb: "admit | refuse",
  target: "one mission's release (recordMission) and commit/push decision",
  scope: "per-mission, OPT-IN",
  missionScope: "missions whose contract declares control.economic === true (independent of control.required)",
  default: "DISABLED — a mission that does not opt in is a pure NO-OP (legacy behaviour byte-for-byte)",
  inputs: Object.freeze([
    "runtime/missions/<mission>.json → control.economic (opt-in flag)",
    "runtime/generated/economic-verification-report.json → { mission, verdict, violations, gaps, proofs } (gitignored evidence produced by economic-verification.verifyEconomics)",
  ]),
  outputs: Object.freeze([
    "evaluateMissionEconomics → { enforced, verdict, allowed } | { enforced:false }",
    "release refusal: { skipped:true, reason:'NOT_ECONOMICALLY_VERIFIED', verdict }",
    "commit/push guard: { allowed, enforced, verdict, reason }",
  ]),
  allowedVerdicts: Object.freeze(["VERIFIED"]),
  blockingVerdicts: Object.freeze(["FAILED", "INCOMPLETE", "UNKNOWN"]),
  unknownHandling: "BLOCK",
  missingEvidenceHandling: "BLOCK (UNKNOWN, deny-by-default)",
  malformedEvidenceHandling: "BLOCK (UNKNOWN)",
  wrongMissionEvidenceHandling: "BLOCK (UNKNOWN — identity enforced, no verdict borrowing)",
  inconsistentEvidenceHandling: "BLOCK (UNKNOWN — verdictConsistent rejects tampered/forged evidence)",
  invariants: Object.freeze([
    "deny-by-default: anything other than a genuine, mission-matched, internally-consistent VERIFIED blocks",
    "UNKNOWN is never VERIFIED; INCOMPLETE/FAILED never authorize",
    "not opted in ⇒ NO-OP (no new requirement on legacy/other missions)",
    "the engine VERIFIES, the gate AUTHORIZES — nothing is recomputed from raw facts, no second source of truth",
    "DERIVED economic info is never promoted into BILLED/REVENUE/CASH/PROFIT",
  ]),
  failureModes: Object.freeze([
    "evaluator throw ⇒ enforced:false (never breaks a legacy mission; gatherer uses only safe reads)",
    "tampered/forged verdict ⇒ rejected by verdictConsistent ⇒ UNKNOWN (blocked)",
  ]),
  recovery: "a blocked mission makes NO durable mutation (ledger unchanged); re-run yields a fresh economic verdict",
  idempotency: "release idempotence via the existing (mission, runId) dedup in mission-ledger; the commit/push guards are pure",
  reversibility: "R0 — pure + opt-in; disable by removing control.economic; no external effect",
  risk: "LOW",
  blastRadius: "a single opted-in mission's release/commit decision",
  evidence: "runtime/generated/economic-verification-report.json (gitignored)",
  verification: Object.freeze([
    "runtime/core/mission-ledger-economic.test.js",
    "runtime/core/economic-commit-gate.test.js",
    "runtime/core/economic-enforcement-adversarial.test.js",
  ]),
  stopCondition: "activating enforcement on a REAL mission requires a metered provider run to produce the verdict — an external/billable action behind a SEPARATE authority gate",
  acceptanceCriterion: "only a genuine, mission-matched, internally-consistent VERIFIED authorizes release & commit/push; every other state blocks; non-opted-in missions are unaffected",
  dependencies: Object.freeze([
    "economic-verification.verifyEconomics / verdictConsistent / VERDICT",
    "acceptance-facts.economicEnforced / evaluateMissionEconomics",
    "mechanical-acceptance.economicCommitAllowed / economicPushAllowed",
    "mission-ledger.recordMission",
  ]),
});

function loadContract(mission: any): any {
  if (!isNonEmptyString(mission)) return null;
  return readJsonSafe(path.join(MISSIONS_DIR, mission + ".json"));
}

function controlDeclared(mission: any): boolean {
  const c = loadContract(mission);
  return isControlled({ control: isPlainObject(c) ? c.control : undefined });
}

function gatherAcceptanceFacts(mission: any): any {
  const contract = loadContract(mission) || {};
  const control = isPlainObject(contract.control) ? contract.control : undefined;

  const verify = readJsonSafe(GEN("runtime-verify.json"));
  const report = readJsonSafe(GEN("mission-report.json"));
  const checkpoint = readJsonSafe(GEN("pipeline-checkpoint.json"));

  const writeSet = Array.isArray(contract.authorized_paths)
    ? contract.authorized_paths
    : (isPlainObject(contract.permissions) && Array.isArray(contract.permissions.authorizedPaths)
      ? contract.permissions.authorizedPaths
      : undefined);
  const forbidden = Array.isArray(contract.forbidden_paths) ? contract.forbidden_paths : undefined;
  const forbiddenConcepts = Array.isArray(contract.forbidden_concepts) ? contract.forbidden_concepts : undefined;
  const baseCommit = isNonEmptyString(contract.base_commit) ? contract.base_commit : undefined;
  const isEngineering = (Array.isArray(writeSet) && writeSet.length > 0) || contract.requires_engineering === true;
  const requiredChecks = Array.isArray(control && control.required_checks)
    ? control.required_checks
    : (control ? (isEngineering ? DEFAULT_REQUIRED_CHECKS.slice() : []) : undefined);

  const declaredEvidence = Array.isArray(contract.evidence) ? contract.evidence : [];
  const requiredEvidence = declaredEvidence
    .map((e: any) => (isNonEmptyString(e) ? e : (isPlainObject(e) ? e.path : null)))
    .filter(isNonEmptyString)
    .map((p: string) => {
      const present = fs.existsSync(p);
      return { path: p, present, nonEmpty: present && nonEmptyFile(p) };
    });

  const changed = isPlainObject(checkpoint) && Array.isArray(checkpoint.modifiedFiles) ? checkpoint.modifiedFiles : undefined;
  const ckBase = isPlainObject(checkpoint) && isPlainObject(checkpoint.rollback) && isNonEmptyString(checkpoint.rollback.head)
    ? checkpoint.rollback.head
    : undefined;

  const facts: any = {
    mission: {
      id: mission,
      authorized: contract.status === "AUTHORIZED",
      control,
    },
    report: isPlainObject(report) ? { mission: report.mission, validated: report.validated } : null,
  };
  if (isPlainObject(verify)) facts.verify = { build: verify.build, typescript: verify.typescript, gitClean: verify.gitClean };
  if (writeSet) facts.mission.write_set = writeSet;
  if (forbidden) facts.mission.forbidden_paths = forbidden;
  if (forbiddenConcepts) facts.mission.forbidden_concepts = forbiddenConcepts;
  if (baseCommit) facts.mission.base_commit = baseCommit;
  if (requiredChecks) facts.mission.required_checks = requiredChecks;
  if (changed !== undefined || ckBase !== undefined) facts.git = { changed_files: changed, base_commit: ckBase };
  if (requiredEvidence.length > 0) facts.evidence = { required: requiredEvidence };
  if (isPlainObject(checkpoint) && isNonEmptyString(checkpoint.status)) facts.checkpoint = { status: checkpoint.status };
  return facts;
}

function evaluateMissionAcceptance(mission: any): any {
  if (!controlDeclared(mission)) return { controlled: false };
  const facts = gatherAcceptanceFacts(mission);
  const record = evaluateAcceptance(facts);
  return { controlled: true, verdict: record.verdict, record };
}

function economicEnforced(mission: any): boolean {
  const c = loadContract(mission);
  return isPlainObject(c) && isPlainObject(c.control) && c.control.economic === true;
}

function evaluateMissionEconomics(mission: any): any {
  if (!economicEnforced(mission)) return { enforced: false };
  const report = readJsonSafe(GEN("economic-verification-report.json"));
  const trusted = isPlainObject(report)
    && report.mission === mission
    && isNonEmptyString(report.verdict)
    && verdictConsistent(report);
  const verdict = trusted ? report.verdict : ECON_VERDICT.UNKNOWN;
  return { enforced: true, verdict, allowed: verdict === ECON_VERDICT.VERIFIED };
}

function commitGateDecision(mission: any): any {
  const reasons: string[] = [];
  const acc = evaluateMissionAcceptance(mission);
  if (acc && acc.controlled === true && commitAllowed(acc.verdict).allowed !== true) {
    reasons.push(`mechanical acceptance ${acc.verdict} (requires ACCEPT)`);
  }
  const econ = evaluateMissionEconomics(mission);
  if (econ && econ.enforced === true && economicCommitAllowed(econ).allowed !== true) {
    reasons.push(`economic verification ${econ.verdict} (requires VERIFIED)`);
  }
  return Object.freeze({ allowed: reasons.length === 0, reasons: Object.freeze(reasons) });
}

module.exports = {
  DEFAULT_REQUIRED_CHECKS,
  ECONOMIC_ENFORCEMENT_CONTRACT,
  loadContract,
  controlDeclared,
  gatherAcceptanceFacts,
  evaluateMissionAcceptance,
  economicEnforced,
  evaluateMissionEconomics,
  commitGateDecision,
};

// ---- Read-only CLI: prints the gathered facts + verdict for a mission; mutates nothing. -------
if (require.main === module) {
  const mission = process.argv[2];
  if (!mission) { process.stdout.write("usage: node runtime/core/acceptance-facts.js <mission>\n"); process.exit(2); }
  const out: any = { mission, controlled: controlDeclared(mission), economicEnforced: economicEnforced(mission), facts: gatherAcceptanceFacts(mission) };
  out.acceptance = evaluateMissionAcceptance(mission);
  out.economics = evaluateMissionEconomics(mission);
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
