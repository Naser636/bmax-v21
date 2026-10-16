#!/usr/bin/env node

"use strict";

/*
 * V5 CONTROLLED EXECUTION — MECHANICAL ACCEPTANCE evaluator (deterministic, fact-based).
 *
 * Canonical requirement (FICHE_07 work method; FICHE_01 §13 authority model): the governed chain must decide
 * acceptance on FACTS, never on the worker's own claim — "no valid state => no consequential claim"; a green
 * build is never sufficient proof; the executor is never the sole authority that its own work is accepted.
 *
 * It creates NO new primitive/engine and NO second state source. It is a pure ARBITRATION layer that COMPOSES
 * the existing primitives: the C03 state-transition validator, the odg-verify build/typescript/gitClean
 * booleans, the idempotency-guard decision vocabulary. Additive + standalone. Wiring into the live release
 * point is a SEPARATE, opt-in increment (a mission must DECLARE control to gate; legacy missions unaffected).
 *
 * IMPORTANT — it evaluates FACTS, never worker claims: a report's status/validated text can NEVER raise a
 * verdict to ACCEPT; missing evidence / unresulted required check / interrupted RUNNING can NEVER ACCEPT
 * (deny-by-default UNKNOWN).
 *
 * STRICT TS PORT (V64 FINANCE/DEC-006, bounded semantics-preserving). The controlled vocabulary, precedence
 * (REJECT>BLOCKED>UNKNOWN>ACCEPT), fact-based evaluation, deny-by-default, commit/push gates and the OPT-IN
 * economic gates are byte-identical. Pure (no clock/I/O); reuses dual-ported state-transition + economic-verification.
 */

const { validateStateTransition } = require("./state-transition") as { validateStateTransition: (t: any) => any };

// ---- Controlled vocabulary (frozen) -----------------------------------------------------------
const VERDICT = Object.freeze({
  ACCEPT: "ACCEPT",
  REJECT: "REJECT",
  BLOCKED: "BLOCKED",
  UNKNOWN: "UNKNOWN",
});

const PRECEDENCE = Object.freeze([VERDICT.REJECT, VERDICT.BLOCKED, VERDICT.UNKNOWN, VERDICT.ACCEPT]);

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

// ---- Type guards ------------------------------------------------------------------------------
function isPlainObject(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isStringArray(v: any): boolean { return Array.isArray(v) && v.every(isNonEmptyString); }

function pathUnder(file: any, base: any): boolean {
  if (!isNonEmptyString(file) || !isNonEmptyString(base)) return false;
  const f = file.replace(/^\.\//, "");
  const b = base.replace(/^\.\//, "").replace(/\/+$/, "");
  return f === b || f.startsWith(b + "/");
}
function anyBaseCovers(file: any, bases: any): boolean {
  return Array.isArray(bases) && bases.some((b) => pathUnder(file, b));
}

function isControlled(mission: any): boolean {
  return isPlainObject(mission) && isPlainObject(mission.control) && mission.control.required === true;
}

function evaluateAcceptance(facts: any): any {
  const f = isPlainObject(facts) ? facts : {};
  const mission = isPlainObject(f.mission) ? f.mission : {};
  const rejections: string[] = [];
  const blocks: string[] = [];
  const unknowns: string[] = [];
  const proofs: string[] = [];
  const checkResults: any = {};

  if (!isNonEmptyString(mission.id)) {
    return freezeResult(VERDICT.UNKNOWN, [], [], ["mission.id: required to identify the subject of acceptance"], [], {});
  }

  // --- AUTHORITY ------------------------------------------------------------------------------
  if (mission.authorized !== true) {
    blocks.push("authority: mission is not AUTHORIZED (governance precondition not met)");
  }

  // --- INTERRUPTION / checkpoint status -------------------------------------------------------
  if (isPlainObject(f.checkpoint)) {
    const st = f.checkpoint.status;
    if (st === "RUNNING" || st === "INTERRUPTED") {
      unknowns.push(`checkpoint: execution ${st} — outcome not proven (RUNNING => UNKNOWN)`);
    } else if (st === "FAILED") {
      rejections.push("checkpoint: recorded FAILED");
    }
  }

  // --- IDEMPOTENCY ----------------------------------------------------------------------------
  if (isPlainObject(f.idempotency)) {
    const d = f.idempotency.decision;
    if (d === "CONFLICT") {
      rejections.push("idempotency: CONFLICT (compare-and-set stale) — must not apply");
    } else if (d === "DUPLICATE") {
      blocks.push("idempotency: DUPLICATE — action already applied; re-execution refused (no double mutation)");
    }
  }

  // --- BASE COMMIT ----------------------------------------------------------------------------
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

  // --- WRITE-SET CONTAINMENT + FORBIDDEN PATHS ------------------------------------------------
  const changed = isPlainObject(f.git) && Array.isArray(f.git.changed_files) ? f.git.changed_files : null;
  if (isStringArray(mission.write_set) && mission.write_set.length > 0) {
    if (changed) {
      const outside = changed.filter((file: any) => !anyBaseCovers(file, mission.write_set));
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
    const hit = changed.filter((file: any) => anyBaseCovers(file, mission.forbidden_paths));
    if (hit.length > 0) {
      rejections.push("forbidden_paths: modification of forbidden path(s): " + hit.join(", "));
    }
  }

  // --- FORBIDDEN CONCEPTS ---------------------------------------------------------------------
  if (isStringArray(mission.forbidden_concepts) && mission.forbidden_concepts.length > 0) {
    if (isPlainObject(f.scan) && Array.isArray(f.scan.forbiddenConceptHits)) {
      if (f.scan.forbiddenConceptHits.length > 0) {
        rejections.push("forbidden_concepts: present in change: " + f.scan.forbiddenConceptHits.join(", "));
      }
    } else {
      unknowns.push("forbidden_concepts: declared but not mechanically scanned (no scan fact supplied)");
    }
  }

  // --- REQUIRED CHECKS ------------------------------------------------------------------------
  const required = isStringArray(mission.required_checks) ? mission.required_checks.filter((c: any) => KNOWN_CHECKS.includes(c)) : [];
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

  // --- REPORT CROSS-CHECK (a CLAIM — never an ACCEPT basis) -----------------------------------
  if (isPlainObject(f.report)) {
    if (isNonEmptyString(f.report.mission) && f.report.mission !== mission.id) {
      rejections.push(`report: identity mismatch (report.mission=${f.report.mission} != mission.id=${mission.id})`);
    }
    if (f.report.validated === false) {
      rejections.push("report: records validated:false (mission not proven)");
    }
  }

  // --- EVIDENCE existence + integrity ---------------------------------------------------------
  if (isPlainObject(f.evidence)) {
    if (Array.isArray(f.evidence.required)) {
      const missing = f.evidence.required.filter((e: any) => !(isPlainObject(e) && e.present === true && e.nonEmpty === true));
      if (missing.length > 0) {
        rejections.push("evidence: required artifact(s) missing/empty: " + missing.map((e: any) => (isPlainObject(e) ? e.path : String(e))).join(", "));
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

  // --- STATE TRANSITION (reuse C03 validator) -------------------------------------------------
  if (f.transition !== undefined && f.transition !== null) {
    const v = validateStateTransition(f.transition);
    if (v.ok) proofs.push("state transition valid (C03)");
    else rejections.push("state transition invalid (C03): " + (v.errors[0] || "unknown"));
  }

  // --- COMBINE --------------------------------------------------------------------------------
  if (rejections.length === 0 && blocks.length === 0 && unknowns.length === 0 && proofs.length === 0) {
    unknowns.push("no acceptance basis provided (deny-by-default: nothing was mechanically proven)");
  }

  let verdict;
  if (rejections.length > 0) verdict = VERDICT.REJECT;
  else if (blocks.length > 0) verdict = VERDICT.BLOCKED;
  else if (unknowns.length > 0) verdict = VERDICT.UNKNOWN;
  else verdict = VERDICT.ACCEPT;

  return freezeResult(verdict, rejections, blocks, unknowns, proofs, checkResults);
}

function freezeResult(verdict: any, rejections: string[], blocks: string[], unknowns: string[], proofs: string[], checkResults: any): any {
  return Object.freeze({
    verdict,
    rejections: Object.freeze(rejections.slice()),
    blocks: Object.freeze(blocks.slice()),
    unknowns: Object.freeze(unknowns.slice()),
    proofs: Object.freeze(proofs.slice()),
    checks: Object.freeze({ ...checkResults }),
  });
}

// ---- Commit / push gate -----------------------------------------------------------------------
function verdictOf(v: any): any { return isPlainObject(v) ? v.verdict : v; }

function commitAllowed(verdict: any): any {
  const ok = verdictOf(verdict) === VERDICT.ACCEPT;
  return Object.freeze({ allowed: ok, reason: ok ? "verdict ACCEPT — commit authorized" : "verdict is not ACCEPT — commit refused" });
}

function pushAllowed(verdict: any, post: any): any {
  const accepted = verdictOf(verdict) === VERDICT.ACCEPT;
  const committed = isPlainObject(post) && post.commitVerified === true;
  const ok = accepted && committed;
  let reason;
  if (!accepted) reason = "verdict is not ACCEPT — push refused";
  else if (!committed) reason = "commit not verified — push refused";
  else reason = "verdict ACCEPT and commit verified — push authorized";
  return Object.freeze({ allowed: ok, reason });
}

// ---- Economic commit / push gate (OPT-IN) -----------------------------------------------------
const { VERDICT: ECON_VERDICT } = require("./economic-verification") as { VERDICT: any };

function economicVerdictOf(economics: any): any {
  return isPlainObject(economics) && isNonEmptyString(economics.verdict) ? economics.verdict : ECON_VERDICT.UNKNOWN;
}

function economicCommitAllowed(economics: any): any {
  const enforced = isPlainObject(economics) && economics.enforced === true;
  if (!enforced) return Object.freeze({ allowed: true, enforced: false, reason: "economic enforcement not enabled — commit unaffected" });
  const verdict = economicVerdictOf(economics);
  const ok = verdict === ECON_VERDICT.VERIFIED;
  return Object.freeze({ allowed: ok, enforced: true, verdict, reason: ok ? "economic verdict VERIFIED — commit authorized" : `economic verdict ${verdict} (requires VERIFIED) — commit refused` });
}

function economicPushAllowed(economics: any, post: any): any {
  const enforced = isPlainObject(economics) && economics.enforced === true;
  if (!enforced) return Object.freeze({ allowed: true, enforced: false, reason: "economic enforcement not enabled — push unaffected" });
  const verdict = economicVerdictOf(economics);
  const verified = verdict === ECON_VERDICT.VERIFIED;
  const committed = isPlainObject(post) && post.commitVerified === true;
  const ok = verified && committed;
  let reason;
  if (!verified) reason = `economic verdict ${verdict} (requires VERIFIED) — push refused`;
  else if (!committed) reason = "commit not verified — push refused";
  else reason = "economic verdict VERIFIED and commit verified — push authorized";
  return Object.freeze({ allowed: ok, enforced: true, verdict, reason });
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
  economicCommitAllowed,
  economicPushAllowed,
};

// ---- Read-only CLI: prints the contract descriptor; mutates nothing. --------------------------
if (require.main === module) {
  process.stdout.write(JSON.stringify(ACCEPTANCE_CONTRACT, null, 2) + "\n");
}

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
