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
  const requiredChecks = Array.isArray(control && control.required_checks)
    ? control.required_checks
    : (control ? DEFAULT_REQUIRED_CHECKS.slice() : undefined);

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

module.exports = {
  DEFAULT_REQUIRED_CHECKS,
  loadContract,
  controlDeclared,
  gatherAcceptanceFacts,
  evaluateMissionAcceptance,
};

// ---- Read-only CLI: prints the gathered facts + verdict for a mission; mutates nothing. -------
if (require.main === module) {
  const mission = process.argv[2];
  if (!mission) { process.stdout.write("usage: node runtime/core/acceptance-facts.js <mission>\n"); process.exit(2); }
  const out = { mission, controlled: controlDeclared(mission), facts: gatherAcceptanceFacts(mission) };
  out.acceptance = evaluateMissionAcceptance(mission);
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}
