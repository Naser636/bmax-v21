#!/usr/bin/env node

"use strict";

/*
 * V5 CONTROLLED EXECUTION — MECHANICAL ACCEPTANCE evaluator (deterministic, fact-based).
 *
 * Canonical requirement (ODG_FINAL_MASTER_DETAILED_V5_FICHE_07_METHODE_DE_TRAVAIL.md — work method):
 *   the governed chain TRUTH LOCK -> ... -> RUNTIME VERIFY -> EVIDENCE -> MECHANICAL ACCEPTANCE ->
 *   COMMIT -> CHECKPOINT -> PUSH must have a step that decides acceptance on FACTS, never on the
 *   worker's own claim. FICHE_01 §13 authority model: "no valid state => no consequential claim";
 *   a green build is never sufficient proof; the executor must NEVER be the sole authority that its
 *   own work is accepted.
 *
 * Forensic gap (repository truth): acceptance is scattered across several engines with DIFFERENT
 * vocabularies — Validation Engine (SUCCESS/BLOCKED), odg-verify (exit 0/1), Release Manager
 * (RELEASE/NO_RELEASE), objective-evidence (PASS/FAIL), objective-attribution (EVIDENCED/...). There is
 * action-gate.js for the PRE-execution admission of ONE action (ALLOW/DENY/ESCALATE), but NOTHING that,
 * POST-execution, takes the TRUSTED FACTS of a completed mission/phase and returns a single verdict in
 * {ACCEPT, REJECT, BLOCKED, UNKNOWN}. This module is exactly that complement.
 *
 * It creates NO new primitive/engine and NO second state source. It is a pure ARBITRATION layer that
 * COMPOSES the existing primitives: the C03 canonical-state validator (state-transition.validateStateTransition)
 * for the STATE-transition check, the odg-verify build/typescript/gitClean booleans for the required-checks
 * check (same meaning as runtime/bin/odg-verify.js verifyExitCode), the idempotency-guard decision vocabulary
 * (PROCEED/DUPLICATE/CONFLICT) for the no-double-mutation check. Additive + standalone, in the style of
 * action-gate.js / state-transition.js (pure core + a read-only require.main CLI that only prints the
 * contract descriptor). Wiring the evaluator into the live release point is a SEPARATE, opt-in increment
 * (a mission must DECLARE control for it to gate; legacy missions are unaffected).
 *
 * IMPORTANT — it evaluates FACTS, never worker claims:
 *   - A `report` object (e.g. mission-report.json) is a CLAIM. Its status/validated text can NEVER raise a
 *     verdict to ACCEPT. It is used ONLY to detect an identity mismatch or a proven-false (report.validated
 *     === false), both of which REJECT. Text saying "PASS"/"SUCCESS"/"DONE" is never an acceptance basis.
 *   - Missing evidence / a required check with no result / an interrupted (RUNNING) checkpoint can NEVER
 *     ACCEPT. Deny-by-default: with no positive mechanical proof, the verdict is UNKNOWN, never ACCEPT.
 */

const { validateStateTransition } = require("./state-transition");

// ---- Controlled vocabulary (frozen) -----------------------------------------------------------
const VERDICT = Object.freeze({
  ACCEPT: "ACCEPT",   // every required criterion is mechanically proven.
  REJECT: "REJECT",   // a violation / failure is mechanically proven.
  BLOCKED: "BLOCKED", // a known governance / precondition blocks acceptance.
  UNKNOWN: "UNKNOWN", // the outcome cannot (yet) be proven.
});

// Precedence when more than one bucket is non-empty. A proven violation dominates everything; a proven
// block dominates an unprovable gap; only a complete absence of findings AND positive proof is ACCEPT.
const PRECEDENCE = Object.freeze([VERDICT.REJECT, VERDICT.BLOCKED, VERDICT.UNKNOWN, VERDICT.ACCEPT]);

// The universe of required checks this evaluator understands (sourced from trusted facts, not re-run here).
const KNOWN_CHECKS = Object.freeze(["build", "typescript", "tests", "gitClean"]);

const ACCEPTANCE_CONTRACT = Object.freeze({
  id: "V5-CONTROLLED-EXECUTION-MECHANICAL-ACCEPTANCE",
  source: "FICHE_07 (work method) / FICHE_01 §13 (authority model)",
  chain: "WORK -> ACCEPTANCE -> ACCEPT -> COMMIT -> VERIFY COMMIT -> PUSH -> VERIFY ORIGIN -> VERIFY CLEAN",
  verdicts: Object.freeze(Object.values(VERDICT)),
  precedence: PRECEDENCE,
  knownChecks: KNOWN_CHECKS,
  denyByDefault: true,
  rules: Object.freeze([
    "ACCEPT only when authority is granted, no violation is proven, no gap is unprovable, AND >=1 positive mechanical proof exists",
    "REJECT when a violation/failure is mechanically proven (red check, unauthorized/forbidden path, base mismatch, bad transition, report proven-false, required evidence missing, integrity broken, CONFLICT)",
    "BLOCKED when a known governance/precondition blocks (not AUTHORIZED, idempotent DUPLICATE => no re-mutation)",
    "UNKNOWN when outcome cannot be proven (interrupted RUNNING, required check without a result, no acceptance basis)",
    "FACTS not claims: report status/validated text can never raise a verdict to ACCEPT",
    "RUNNING/INTERRUPTED => UNKNOWN; UNKNOWN never becomes ACCEPT without reconstruction (checkpoint COMPLETE + proof)",
    "commit/push are gated: no ACCEPT => no commit, no push",
    "opt-in: isControlled(mission) is false unless the mission DECLARES control — legacy missions are unaffected",
    "deterministic / pure (no clock, randomness or I/O)",
  ]),
});

// ---- Type guards (shared style with action-gate.js / state-transition.js) ---------------------
function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
function isStringArray(v) { return Array.isArray(v) && v.every(isNonEmptyString); }

// A changed file is "under" a declared path when the path is a prefix of it (directory or exact file).
// Normalizes a leading "./" and a trailing "/" so "runtime/core" matches "runtime/core/x.js".
function pathUnder(file, base) {
  if (!isNonEmptyString(file) || !isNonEmptyString(base)) return false;
  const f = file.replace(/^\.\//, "");
  const b = base.replace(/^\.\//, "").replace(/\/+$/, "");
  return f === b || f.startsWith(b + "/");
}
function anyBaseCovers(file, bases) {
  return Array.isArray(bases) && bases.some((b) => pathUnder(file, b));
}

/**
 * isControlled(mission) — opt-in switch. The live release path should ONLY require ACCEPT when this is
 * true, so missions that do not declare controlled execution keep their legacy behavior unchanged.
 */
function isControlled(mission) {
  return isPlainObject(mission) && isPlainObject(mission.control) && mission.control.required === true;
}

/**
 * evaluateAcceptance(facts) -> frozen verdict record.
 *
 * `facts` are ALREADY-GATHERED, trusted facts (this function does NO I/O, so it cannot be fooled by the
 * filesystem and is fully testable). Shape (all optional unless noted):
 *   mission: { id (required), authorized, base_commit, write_set[], forbidden_paths[], forbidden_concepts[],
 *              required_checks[] (subset of knownChecks), control:{required} }
 *   git:     { head, base_commit, changed_files[], worktree_clean }
 *   verify:  the odg-verify object { build, typescript, gitClean } (or null)   [trusted booleans]
 *   checks:  { tests } and/or overrides for any known check                    [trusted booleans]
 *   report:  mission-report.json object { mission, validated } (or null)       [a CLAIM — see header]
 *   evidence:{ required:[{path,present,nonEmpty}], sealHash, recomputedSealHash }
 *   scan:    { forbiddenConceptHits:[] }                                       [caller-supplied scan result]
 *   transition: a C03 state-transition record to validate                      [reuses validateStateTransition]
 *   checkpoint: { status: RUNNING|INTERRUPTED|FAILED|COMPLETE }
 *   idempotency: { decision: PROCEED|DUPLICATE|CONFLICT }                       [from idempotency-guard.admit]
 *
 * Returns { verdict, rejections[], blocks[], unknowns[], proofs[], checks{} } — frozen, deterministic.
 */
function evaluateAcceptance(facts) {
  const f = isPlainObject(facts) ? facts : {};
  const mission = isPlainObject(f.mission) ? f.mission : {};
  const rejections = [];
  const blocks = [];
  const unknowns = [];
  const proofs = []; // positive mechanical proofs — ACCEPT requires at least one.
  const checkResults = {};

  // Cannot even identify the subject ⇒ not provable.
  if (!isNonEmptyString(mission.id)) {
    return freezeResult(VERDICT.UNKNOWN, [], [], ["mission.id: required to identify the subject of acceptance"], [], {});
  }

  // --- AUTHORITY (governance precondition) -----------------------------------------------------
  if (mission.authorized !== true) {
    blocks.push("authority: mission is not AUTHORIZED (governance precondition not met)");
  }

  // --- INTERRUPTION / checkpoint status (RUNNING -> UNKNOWN) ------------------------------------
  if (isPlainObject(f.checkpoint)) {
    const st = f.checkpoint.status;
    if (st === "RUNNING" || st === "INTERRUPTED") {
      unknowns.push(`checkpoint: execution ${st} — outcome not proven (RUNNING => UNKNOWN)`);
    } else if (st === "FAILED") {
      rejections.push("checkpoint: recorded FAILED");
    }
  }

  // --- IDEMPOTENCY (no double mutation) --------------------------------------------------------
  if (isPlainObject(f.idempotency)) {
    const d = f.idempotency.decision;
    if (d === "CONFLICT") {
      rejections.push("idempotency: CONFLICT (compare-and-set stale) — must not apply");
    } else if (d === "DUPLICATE") {
      blocks.push("idempotency: DUPLICATE — action already applied; re-execution refused (no double mutation)");
    }
  }

  // --- BASE COMMIT -----------------------------------------------------------------------------
  if (isNonEmptyString(mission.base_commit)) {
    const actual = isPlainObject(f.git) ? f.git.base_commit : undefined;
    if (isNonEmptyString(actual)) {
      if (actual !== mission.base_commit) {
        rejections.push(`base_commit: work built on ${actual} but mission declares base ${mission.base_commit}`);
      } else {
        proofs.push("base_commit matches the mission-declared base");
      }
    } else {
      unknowns.push("base_commit: declared by mission but actual base not available to verify");
    }
  }

  // --- WRITE-SET CONTAINMENT + FORBIDDEN PATHS -------------------------------------------------
  const changed = isPlainObject(f.git) && Array.isArray(f.git.changed_files) ? f.git.changed_files : null;
  if (isStringArray(mission.write_set) && mission.write_set.length > 0) {
    if (changed) {
      const outside = changed.filter((file) => !anyBaseCovers(file, mission.write_set));
      if (outside.length > 0) {
        rejections.push("write_set: unauthorized modification outside write_set: " + outside.join(", "));
      } else {
        proofs.push("every changed file is within the authorized write_set");
      }
    } else {
      unknowns.push("write_set: declared but the actual diff (changed_files) is not available to verify");
    }
  }
  if (isStringArray(mission.forbidden_paths) && mission.forbidden_paths.length > 0 && changed) {
    const hit = changed.filter((file) => anyBaseCovers(file, mission.forbidden_paths));
    if (hit.length > 0) {
      rejections.push("forbidden_paths: modification of forbidden path(s): " + hit.join(", "));
    }
  }

  // --- FORBIDDEN CONCEPTS (only when a scan fact is supplied — honest about mechanical support) --
  if (isStringArray(mission.forbidden_concepts) && mission.forbidden_concepts.length > 0) {
    if (isPlainObject(f.scan) && Array.isArray(f.scan.forbiddenConceptHits)) {
      if (f.scan.forbiddenConceptHits.length > 0) {
        rejections.push("forbidden_concepts: present in change: " + f.scan.forbiddenConceptHits.join(", "));
      }
    } else {
      unknowns.push("forbidden_concepts: declared but not mechanically scanned (no scan fact supplied)");
    }
  }

  // --- REQUIRED CHECKS (build/typescript/tests/gitClean) ---------------------------------------
  // Value source: verify.{build,typescript,gitClean} and checks.{...}. ANY present check that is false is a
  // proven failure (REJECT) whether or not it was listed required. A REQUIRED check with no result is UNKNOWN.
  const required = isStringArray(mission.required_checks) ? mission.required_checks.filter((c) => KNOWN_CHECKS.includes(c)) : [];
  const verify = isPlainObject(f.verify) ? f.verify : {};
  const explicit = isPlainObject(f.checks) ? f.checks : {};
  for (const name of KNOWN_CHECKS) {
    let val;
    if (Object.prototype.hasOwnProperty.call(explicit, name)) val = explicit[name];
    else if (Object.prototype.hasOwnProperty.call(verify, name)) val = verify[name];
    else val = undefined;
    checkResults[name] = val === undefined ? null : val;
    if (val === false) {
      rejections.push(`check ${name}: failed (proven false)`);
    } else if (val === true) {
      if (required.includes(name)) proofs.push(`required check ${name} passed`);
    } else if (required.includes(name)) {
      unknowns.push(`check ${name}: required but has no result (not proven)`);
    }
  }

  // --- REPORT CROSS-CHECK (a CLAIM — never an ACCEPT basis) ------------------------------------
  if (isPlainObject(f.report)) {
    if (isNonEmptyString(f.report.mission) && f.report.mission !== mission.id) {
      rejections.push(`report: identity mismatch (report.mission=${f.report.mission} != mission.id=${mission.id})`);
    }
    if (f.report.validated === false) {
      rejections.push("report: records validated:false (mission not proven)");
    }
    // report.validated === true / status "SUCCESS" is deliberately NOT added to proofs.
  }

  // --- EVIDENCE existence + integrity ----------------------------------------------------------
  if (isPlainObject(f.evidence)) {
    if (Array.isArray(f.evidence.required)) {
      const missing = f.evidence.required.filter((e) => !(isPlainObject(e) && e.present === true && e.nonEmpty === true));
      if (missing.length > 0) {
        rejections.push("evidence: required artifact(s) missing/empty: " + missing.map((e) => (isPlainObject(e) ? e.path : String(e))).join(", "));
      } else if (f.evidence.required.length > 0) {
        proofs.push("all required evidence artifacts present and non-empty");
      }
    }
    const haveSeal = isNonEmptyString(f.evidence.sealHash);
    const haveRecomputed = isNonEmptyString(f.evidence.recomputedSealHash);
    if (haveSeal && haveRecomputed) {
      if (f.evidence.sealHash !== f.evidence.recomputedSealHash) {
        rejections.push("evidence: integrity broken (seal hash mismatch — artifacts changed since sealing)");
      } else {
        proofs.push("evidence seal integrity verified (seal hash matches)");
      }
    } else if (haveSeal && !haveRecomputed) {
      unknowns.push("evidence: sealHash declared but not recomputed — integrity not verified");
    }
  }

  // --- STATE TRANSITION (reuse C03 validator) --------------------------------------------------
  if (f.transition !== undefined && f.transition !== null) {
    const v = validateStateTransition(f.transition);
    if (v.ok) proofs.push("state transition valid (C03)");
    else rejections.push("state transition invalid (C03): " + (v.errors[0] || "unknown"));
  }

  // --- COMBINE: REJECT > BLOCKED > UNKNOWN > ACCEPT, with deny-by-default backstop --------------
  if (rejections.length === 0 && blocks.length === 0 && unknowns.length === 0 && proofs.length === 0) {
    unknowns.push("no acceptance basis provided (deny-by-default: nothing was mechanically proven)");
  }

  let verdict;
  if (rejections.length > 0) verdict = VERDICT.REJECT;
  else if (blocks.length > 0) verdict = VERDICT.BLOCKED;
  else if (unknowns.length > 0) verdict = VERDICT.UNKNOWN;
  else verdict = VERDICT.ACCEPT; // authorized, no violation, no gap, and >=1 positive proof.

  return freezeResult(verdict, rejections, blocks, unknowns, proofs, checkResults);
}

function freezeResult(verdict, rejections, blocks, unknowns, proofs, checkResults) {
  return Object.freeze({
    verdict,
    rejections: Object.freeze(rejections.slice()),
    blocks: Object.freeze(blocks.slice()),
    unknowns: Object.freeze(unknowns.slice()),
    proofs: Object.freeze(proofs.slice()),
    checks: Object.freeze({ ...checkResults }),
  });
}

// ---- Commit / push gate (§7) ------------------------------------------------------------------
// No ACCEPT => no commit, no push. These are pure guards over a verdict (string or verdict record).
function verdictOf(v) { return isPlainObject(v) ? v.verdict : v; }

/** commitAllowed(verdict) — a commit is authorized ONLY when acceptance is ACCEPT. */
function commitAllowed(verdict) {
  const ok = verdictOf(verdict) === VERDICT.ACCEPT;
  return Object.freeze({ allowed: ok, reason: ok ? "verdict ACCEPT — commit authorized" : "verdict is not ACCEPT — commit refused" });
}

/**
 * pushAllowed(verdict, post) — a push is authorized ONLY when acceptance is ACCEPT AND the commit it would
 * push was verified to exist (post.commitVerified === true). local==origin and clean worktree are
 * POST-push confirmations, not preconditions of the push itself.
 */
function pushAllowed(verdict, post) {
  const accepted = verdictOf(verdict) === VERDICT.ACCEPT;
  const committed = isPlainObject(post) && post.commitVerified === true;
  const ok = accepted && committed;
  let reason;
  if (!accepted) reason = "verdict is not ACCEPT — push refused";
  else if (!committed) reason = "commit not verified — push refused";
  else reason = "verdict ACCEPT and commit verified — push authorized";
  return Object.freeze({ allowed: ok, reason });
}

module.exports = {
  VERDICT,
  PRECEDENCE,
  KNOWN_CHECKS,
  ACCEPTANCE_CONTRACT,
  isControlled,
  evaluateAcceptance,
  commitAllowed,
  pushAllowed,
};

// ---- Read-only CLI: prints the contract descriptor; mutates nothing. --------------------------
if (require.main === module) {
  process.stdout.write(JSON.stringify(ACCEPTANCE_CONTRACT, null, 2) + "\n");
}
