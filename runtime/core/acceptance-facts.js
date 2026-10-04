#!/usr/bin/env node
"use strict";

/*
 * V5 CONTROLLED EXECUTION — read-only acceptance fact-gatherer.
 *
 * The MECHANICAL ACCEPTANCE evaluator (runtime/core/mechanical-acceptance.js) is PURE: it decides on a
 * `facts` object and does no I/O. This module is the thin, READ-ONLY adapter that assembles that `facts`
 * object for a given mission from the artifacts ALREADY present on the live release path — it is NOT a
 * new engine and NOT a new state source. It reads:
 *   - the mission contract runtime/missions/<mission>.json  (control declaration + authorized_paths +
 *     forbidden_paths + base_commit + declared evidence artifacts + status)      [absent => legacy mission]
 *   - runtime/generated/runtime-verify.json   (odg-verify build/typescript/gitClean booleans)
 *   - runtime/generated/mission-report.json   (the worker's CLAIM — used only for identity / proven-false)
 *   - runtime/generated/pipeline-checkpoint.json (Checkpoint Engine: status + modifiedFiles (git porcelain,
 *     already status-stripped) + rollback.head (pre-run HEAD)) — the trusted diff/base facts, so NO live
 *     git shelling happens here and the gatherer is deterministic under a fixture cwd.
 * Evidence existence is probed read-only (fs.existsSync + non-empty size). All reads are best-effort and
 * never throw: a missing/corrupt artifact degrades to "not provable", which the evaluator maps to a
 * non-ACCEPT verdict (fail-closed) for a controlled mission.
 *
 * Opt-in: controlDeclared() is false unless the contract declares control.required === true, so legacy
 * missions never acquire a new acceptance requirement.
 */

const fs = require("fs");
const path = require("path");
const { isControlled, evaluateAcceptance } = require("./mechanical-acceptance");
const { VERDICT: ECON_VERDICT, verdictConsistent } = require("./economic-verification");

const MISSIONS_DIR = path.join("runtime", "missions");
const GEN = (name) => path.join("runtime", "generated", name);
const DEFAULT_REQUIRED_CHECKS = Object.freeze(["build", "typescript"]);

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
function nonEmptyFile(file) {
  try { return fs.statSync(file).size > 0; } catch { return false; }
}
function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

// ---- ECONOMIC_ENFORCEMENT_GATE_V1 — frozen contract descriptor (documents the gate's governed policy) --
// A read-only SPEC in the exact style of ECONOMIC_VERIFICATION_CONTRACT / ACCEPTANCE_CONTRACT / ACTION_CONTRACT.
// It DESCRIBES the behaviour implemented by economicEnforced + evaluateMissionEconomics (this module), the
// §7 economicCommitAllowed/economicPushAllowed guards (mechanical-acceptance.js) and the release gate
// (mission-ledger.recordMission). It is NOT a second source of truth: the code is authoritative and a
// drift-guard test binds the declared allowed/blocking verdicts to the actual guard behaviour.
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

/** Load the mission contract (cwd-relative). Absent/unreadable => null (treated as a legacy mission). */
function loadContract(mission) {
  if (!isNonEmptyString(mission)) return null;
  return readJsonSafe(path.join(MISSIONS_DIR, mission + ".json"));
}

/** controlDeclared(mission) — true iff the mission's contract declares controlled execution (opt-in). */
function controlDeclared(mission) {
  const c = loadContract(mission);
  return isControlled({ control: isPlainObject(c) ? c.control : undefined });
}

/**
 * gatherAcceptanceFacts(mission) -> the pure `facts` object for evaluateAcceptance (see that module).
 * Read-only; deterministic under a fixed cwd/fixtures; never throws.
 */
function gatherAcceptanceFacts(mission) {
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
  // Class-aware required checks (mirrors validation-engine.js:66 / objective-evidence.ts:82-84): an
  // ENGINEERING mission (declares authorized_paths, or requires_engineering) must pass the build/tsc
  // gate; a READ-ONLY mission (AUDIT/analyze — no code change) produces no build artifact, so it defaults
  // to no required checks and is proven by its declared evidence instead. An explicit control.required_checks
  // always wins. Only computed for a controlled mission (undefined otherwise — legacy path untouched).
  const isEngineering = (Array.isArray(writeSet) && writeSet.length > 0) || contract.requires_engineering === true;
  const requiredChecks = Array.isArray(control && control.required_checks)
    ? control.required_checks
    : (control ? (isEngineering ? DEFAULT_REQUIRED_CHECKS.slice() : []) : undefined);

  // Declared evidence artifacts: contract.evidence may be string paths or { path } objects. Probe existence.
  const declaredEvidence = Array.isArray(contract.evidence) ? contract.evidence : [];
  const requiredEvidence = declaredEvidence
    .map((e) => (isNonEmptyString(e) ? e : (isPlainObject(e) ? e.path : null)))
    .filter(isNonEmptyString)
    .map((p) => {
      const present = fs.existsSync(p);
      return { path: p, present, nonEmpty: present && nonEmptyFile(p) };
    });

  const changed = isPlainObject(checkpoint) && Array.isArray(checkpoint.modifiedFiles) ? checkpoint.modifiedFiles : undefined;
  const ckBase = isPlainObject(checkpoint) && isPlainObject(checkpoint.rollback) && isNonEmptyString(checkpoint.rollback.head)
    ? checkpoint.rollback.head
    : undefined;

  const facts = {
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

/**
 * evaluateMissionAcceptance(mission) -> { controlled, verdict, record } | { controlled:false }.
 * For a CONTROLLED mission, gather facts and run the pure evaluator. For a legacy mission, controlled:false
 * (callers MUST NOT impose any new requirement). The single call sites use this to gate release.
 */
function evaluateMissionAcceptance(mission) {
  if (!controlDeclared(mission)) return { controlled: false };
  const facts = gatherAcceptanceFacts(mission);
  const record = evaluateAcceptance(facts);
  return { controlled: true, verdict: record.verdict, record };
}

/**
 * economicEnforced(mission) — true iff the mission's contract OPTS IN to economic enforcement
 * (control.economic === true). INDEPENDENT of control.required (mechanical acceptance): a mission may opt
 * into either, both, or neither. Absent/unreadable contract => false (legacy mission, untouched).
 */
function economicEnforced(mission) {
  const c = loadContract(mission);
  return isPlainObject(c) && isPlainObject(c.control) && c.control.economic === true;
}

/**
 * evaluateMissionEconomics(mission) -> { enforced:true, verdict, allowed } | { enforced:false }.
 *
 * The ECONOMIC analog of evaluateMissionAcceptance: the thin read-only boundary where the INDEPENDENT
 * economic verdict becomes a release condition — ONLY for a mission that opted in. It reuses the verdict
 * ALREADY rendered by economic-verification.js (verifyEconomics) and persisted as gitignored evidence at
 * runtime/generated/economic-verification-report.json during the metered provider run; it invents no new
 * verdict meaning and recomputes nothing. DENY-BY-DEFAULT: a report that is ABSENT, belongs to ANOTHER
 * mission, or carries no verdict is treated as UNKNOWN (blocked). Only the already-defined VERIFIED verdict
 * is ALLOWED; INCOMPLETE / UNKNOWN / FAILED all block. A mission that does not opt in => enforced:false
 * (NO-OP), so legacy behavior and non-opted-in missions are exactly as before.
 */
function evaluateMissionEconomics(mission) {
  if (!economicEnforced(mission)) return { enforced: false };
  const report = readJsonSafe(GEN("economic-verification-report.json"));
  // Deny-by-default: a report is trusted ONLY when it is present, for THIS mission, carries a verdict, AND
  // is INTERNALLY CONSISTENT (its stated verdict agrees with its own violations/gaps/proofs, per the
  // engine's own precedence). The consistency check — NOT a re-verification — rejects tampered/forged
  // evidence (e.g. a "VERIFIED" record that still carries violations) so the gate can never be tricked
  // into authorizing something the economic findings themselves say must be rejected. Anything else ⇒
  // UNKNOWN (blocked).
  const trusted = isPlainObject(report)
    && report.mission === mission
    && isNonEmptyString(report.verdict)
    && verdictConsistent(report);
  const verdict = trusted ? report.verdict : ECON_VERDICT.UNKNOWN;
  return { enforced: true, verdict, allowed: verdict === ECON_VERDICT.VERIFIED };
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
};

// ---- Read-only CLI: prints the gathered facts + verdict for a mission; mutates nothing. -------
if (require.main === module) {
  const mission = process.argv[2];
  if (!mission) { process.stdout.write("usage: node runtime/core/acceptance-facts.js <mission>\n"); process.exit(2); }
  const out = { mission, controlled: controlDeclared(mission), economicEnforced: economicEnforced(mission), facts: gatherAcceptanceFacts(mission) };
  out.acceptance = evaluateMissionAcceptance(mission);
  out.economics = evaluateMissionEconomics(mission);
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}
