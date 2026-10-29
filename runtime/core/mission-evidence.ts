#!/usr/bin/env node
/**
 * mission-evidence — a PROOF-CARRYING execution record + an adversarial FALSE-SUCCESS gate for campaign missions.
 *
 * The campaign loop records transitions (event + reason + timing) and fail-closes an ACCEPTED claim that carries no
 * evidence STRING — but a non-empty string is weak proof: it cannot stop a lot from claiming ACCEPTED while its process
 * exited non-zero, an artifact is missing, or no independent verification ran (Mandate C/D). This module makes each
 * accepted/blocked/failed transition carry a structured, tamper-evident record, and gates ACCEPTANCE on real proof.
 *
 * Composition only (EVIDENCE primitive): reuses evidence-provenance.contentDigest for a tamper-evident digest. Pure/
 * deterministic — no fs/network; the timestamp is injected. NO 10th primitive.
 *
 * Honesty contract:
 *   - deny-by-default: an ACCEPTED claim is acceptable ONLY with a decisive passing command (exit 0), every declared
 *     artifact present, and (when required) an independent verification that AGREES — anything missing ⇒ NOT acceptable.
 *   - a successful-looking output NEVER masks a non-zero exit code or a failed downstream step (counter-evidence).
 *   - missing evidence stays missing; the record never fabricates an exit code, artifact digest or verification.
 */
"use strict";

const prov = require("./evidence-provenance.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function nonEmpty(s: any): boolean { return typeof s === "string" && s.trim().length > 0; }

const TRANSITIONS = ["ACCEPTED", "BLOCKED", "FAILED", "RETRY", "WAITING_EXTERNAL"];

/**
 * buildEvidenceRecord(input, opts?): assemble a structured proof record. opts.at = injected ISO timestamp.
 * input = { mission:{id,objective?,acceptanceCriteria?}, authorization:{authorized?,scope?}, writeScope?:[],
 *   inputProvenance?:{sourceCommit?,inputsHash?,env?}, attempts?:[{command,exitCode,stdout?,stderr?,at?}],
 *   artifacts?:[{path,sha256?,present?}], verification?:{verified,by?,method?,reason?}|null, limitations?:[],
 *   transition:{to,from?,reason?} }. Returns the record with a tamper-evident `digest`.
 */
function buildEvidenceRecord(input: any, opts: any = {}): any {
  const i = isObj(input) ? input : {};
  const mission = isObj(i.mission) ? i.mission : {};
  const authorization = isObj(i.authorization) ? i.authorization : {};
  const transition = isObj(i.transition) ? i.transition : {};
  const record: any = {
    model: "mission-evidence/1",
    at: nonEmpty(opts.at) ? opts.at : null,
    mission: { id: mission.id != null ? String(mission.id) : null, objective: mission.objective || null, acceptanceCriteria: mission.acceptanceCriteria || null },
    authorization: { authorized: authorization.authorized === true, scope: arr(authorization.scope) },
    writeScope: arr(i.writeScope),
    inputProvenance: isObj(i.inputProvenance) ? i.inputProvenance : null,
    attempts: arr(i.attempts).map((a: any) => ({ command: (a && a.command) || null, exitCode: a && Number.isInteger(a.exitCode) ? a.exitCode : null, stdout: a && typeof a.stdout === "string" ? a.stdout.slice(0, 2000) : null, stderr: a && typeof a.stderr === "string" ? a.stderr.slice(0, 2000) : null, at: (a && a.at) || null })),
    artifacts: arr(i.artifacts).map((a: any) => ({ path: (a && a.path) || null, sha256: (a && a.sha256) || null, present: a && typeof a.present === "boolean" ? a.present : (a && nonEmpty(a.sha256) ? true : null) })),
    verification: isObj(i.verification) ? { verified: i.verification.verified === true, by: i.verification.by || null, method: i.verification.method || null, reason: i.verification.reason || null } : null,
    limitations: arr(i.limitations),
    transition: { to: TRANSITIONS.includes(transition.to) ? transition.to : null, from: transition.from || null, reason: transition.reason || null },
  };
  // tamper-evident digest over the proof content (excludes the digest field itself).
  record.digest = prov.contentDigest(record);
  return record;
}

/**
 * assertAcceptable(record, opts?): the FALSE-SUCCESS gate. Returns { acceptable, reasons[] }. ONLY guards ACCEPTED
 * transitions (BLOCKED/FAILED/RETRY/WAITING_EXTERNAL are always acceptable records). opts.requireVerification (default
 * true) demands an independent verification that agrees. Deny-by-default: anything missing ⇒ NOT acceptable.
 */
function assertAcceptable(record: any, opts: any = {}): any {
  const requireVerification = opts.requireVerification !== false;   // default true
  const reasons: string[] = [];
  if (!isObj(record)) return { acceptable: false, reasons: ["no evidence record"] };
  const to = record.transition && record.transition.to;
  if (to !== "ACCEPTED") return { acceptable: true, reasons: [] };   // the gate only guards acceptance

  const attempts = arr(record.attempts);
  // (1) must have at least one decisive executed command, and NO attempt may have a non-zero exit (success can't mask a failure).
  const withExit = attempts.filter((a) => Number.isInteger(a.exitCode));
  if (attempts.length === 0 || withExit.length === 0) reasons.push("ACCEPTED without any executed command carrying an exit code (deny-by-default)");
  else {
    const failed = withExit.filter((a) => a.exitCode !== 0);
    if (failed.length) reasons.push(`ACCEPTED but ${failed.length} executed command(s) exited non-zero (a passing claim cannot mask a failing exit code)`);
    const passing = withExit.filter((a) => a.exitCode === 0);
    if (passing.length === 0) reasons.push("ACCEPTED with no passing (exit 0) command");
  }
  // (2) every declared artifact must actually be present (declared-missing ⇒ incomplete work).
  const missingArtifacts = arr(record.artifacts).filter((a) => a.present === false || (a.present == null && !nonEmpty(a.sha256)));
  if (missingArtifacts.length) reasons.push(`${missingArtifacts.length} declared artifact(s) missing/unverified (incomplete work)`);
  // (3) independent verification must exist and agree (when required).
  if (requireVerification) {
    if (!record.verification) reasons.push("ACCEPTED without independent verification");
    else if (record.verification.verified !== true) reasons.push("ACCEPTED but independent verification did NOT confirm");
  }
  // (4) contradiction: verification says verified but a command failed (already caught above, but surface explicitly).
  if (record.verification && record.verification.verified === true && withExit.some((a) => a.exitCode !== 0)) {
    reasons.push("CONTRADICTION: verification=verified while an executed command exited non-zero");
  }
  return { acceptable: reasons.length === 0, reasons };
}

/** verifyDigest(record): recompute the content digest and confirm the record is unmodified (tamper check). */
function verifyDigest(record: any): boolean {
  if (!isObj(record) || !nonEmpty(record.digest)) return false;
  const copy: any = { ...record }; delete copy.digest;
  return prov.contentDigest(copy) === record.digest;
}

export { TRANSITIONS, buildEvidenceRecord, assertAcceptable, verifyDigest };
module.exports = { TRANSITIONS, buildEvidenceRecord, assertAcceptable, verifyDigest };

if (require.main === module) {
  const rec = buildEvidenceRecord({ mission: { id: "demo", objective: "compile" }, authorization: { authorized: true, scope: ["x.js"] }, attempts: [{ command: "node --check x.js", exitCode: 0 }], artifacts: [{ path: "x.js", sha256: "abc" }], verification: { verified: true, by: "ci", method: "node --check" }, transition: { to: "ACCEPTED", reason: "compiles" } }, { at: "2026-10-29T00:00:00Z" });
  process.stdout.write(JSON.stringify({ digest: rec.digest.slice(0, 12), gate: assertAcceptable(rec), tamperOk: verifyDigest(rec) }, null, 2) + "\n");
}
