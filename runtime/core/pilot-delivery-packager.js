#!/usr/bin/env node
"use strict";

/*
 * PILOT DELIVERY PACKAGER (DESIGN_PILOT_DELIVERY_PACKAGER → P0 implementation).
 *
 * A READ-ONLY, FAIL-CLOSED assembler. Given an already-executed engineering mission, it composes a
 * human-reviewable delivery package from artifacts WHOSE PROOF AND PROVENANCE IT CAN VERIFY against the
 * EXISTING repository contracts — and NOTHING else. It never writes, never contacts anything, never
 * upgrades or infers a verdict, and always marks human authorization as mandatory.
 *
 * It introduces NO new primitive and NO parallel governance:
 *   - mission identity + verification verdict ← runtime/generated/mission-report.json {mission,status,validated}
 *     (the SAME predicate the proven-only ledger gate uses: report.mission===mission && validated===true).
 *   - proven ledger status            ← runtime/generated/mission-ledger.json entry {mission,proven,validated,state,archived}.
 *   - executed artifacts + evidence   ← runtime/generated/patch-execution.json executed[]{objectiveId,status,capability,evidence}.
 *   - authorized scope                ← runtime/missions/<mission>.json authorized(_)Paths.
 *   - path canonicality / traversal   ← artifact-state.canonicalId (null on absolute/'..').
 *   - content integrity (snapshot)    ← artifact-state.hashContent (sha256).
 *   - provenance                      ← the capability evidence's OWN contract fields
 *                                       (External Research: mode=LIVE ∧ acquired ∧ sources[].content_hash(2xx)
 *                                        ∧ ranked[].provenance_ref; DRY_RUN/acquired:false is NOT acquisition).
 *
 * Ordinary invalid input NEVER throws: it is reported as a stable rejection code with accepted:false.
 */

const fs = require("fs");
const path = require("path");
const artifactState = require("./artifact-state");

const REPORT_REL = "runtime/generated/mission-report.json";
const LEDGER_REL = "runtime/generated/mission-ledger.json";
const EXEC_REL = "runtime/generated/patch-execution.json";
const missionSpecRel = (m) => `runtime/missions/${m}.json`;

// Stable rejection codes (the only vocabulary a caller may branch on).
const CODE = Object.freeze({
  BAD_REQUEST: "BAD_REQUEST",
  BASELINE_INPUT_MISSING: "BASELINE_INPUT_MISSING",
  MALFORMED_JSON: "MALFORMED_JSON",
  MISSION_IDENTITY_MISMATCH: "MISSION_IDENTITY_MISMATCH",
  NOT_VALIDATED: "NOT_VALIDATED",
  NOT_PROVEN_IN_LEDGER: "NOT_PROVEN_IN_LEDGER",
  NO_DELIVERABLE: "NO_DELIVERABLE",
  MISSING_EVIDENCE: "MISSING_EVIDENCE",
  PATH_OUTSIDE_SCOPE: "PATH_OUTSIDE_SCOPE",
  DRY_RUN_NOT_ACQUISITION: "DRY_RUN_NOT_ACQUISITION",
  UNVERIFIED_PROVENANCE: "UNVERIFIED_PROVENANCE",
});

function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

// Read a repo-relative JSON file read-only. Distinguishes ABSENT from MALFORMED (fail-closed, never throws).
function readJson(cwd, rel) {
  const abs = path.resolve(cwd, rel);
  let raw;
  try {
    if (!fs.existsSync(abs) || fs.statSync(abs).size === 0) return { ok: false, code: CODE.BASELINE_INPUT_MISSING };
    raw = fs.readFileSync(abs, "utf8");
  } catch {
    return { ok: false, code: CODE.BASELINE_INPUT_MISSING };
  }
  try {
    return { ok: true, value: JSON.parse(raw), raw };
  } catch {
    return { ok: false, code: CODE.MALFORMED_JSON };
  }
}

// Mirror of self-diagnostic.inAuthorized (not exported there): a target is in scope iff it sits under one
// of the authorized path prefixes. Reused semantics, no new governance.
function inAuthorized(relTarget, authorizedPaths) {
  if (!Array.isArray(authorizedPaths)) return false;
  const norm = path.normalize(String(relTarget)).replace(/\\/g, "/");
  return authorizedPaths.some((pre) => {
    const base = String(pre).replace(/[*].*$/, "").replace(/\/+$/, "");
    return base && (norm === base || norm.startsWith(base + "/") || norm === String(pre));
  });
}

function authorizedPathsOf(spec) {
  const raw = (spec && (spec.authorizedPaths || spec.authorized_paths)) || [];
  return Array.isArray(raw) ? raw.filter(isNonEmptyString) : [];
}

// Verify one included artifact: canonical in-scope path, present, non-empty, parseable, capability-matched,
// and carrying provenance its capability contract actually supports. Returns a frozen descriptor or a
// rejection. READ-ONLY: computes a sha256 snapshot of the exact bytes on disk (artifact-state.hashContent).
function verifyArtifact(cwd, execRecord, authorizedPaths) {
  const capability = isNonEmptyString(execRecord.capability) ? execRecord.capability : null;
  const evidenceRel = isNonEmptyString(execRecord.evidence) ? execRecord.evidence : null;
  const objectiveId = isNonEmptyString(execRecord.objectiveId) ? execRecord.objectiveId : (execRecord.action || null);

  if (!evidenceRel) return { ok: false, code: CODE.MISSING_EVIDENCE, detail: `no evidence path for objective ${objectiveId}` };

  // Path canonicality + traversal (reuse artifact-state.canonicalId) + scope.
  const canon = artifactState.canonicalId(evidenceRel);
  if (canon === null) return { ok: false, code: CODE.PATH_OUTSIDE_SCOPE, detail: `evidence path not canonical/escapes repo: ${evidenceRel}` };
  if (!inAuthorized(canon, authorizedPaths)) return { ok: false, code: CODE.PATH_OUTSIDE_SCOPE, detail: `evidence ${canon} outside authorized scope ${JSON.stringify(authorizedPaths)}` };

  // D1 REPAIR — SYMLINK CONFINEMENT. The lexical checks above constrain the DECLARED path string; they do
  // NOT stop an in-scope path that is a SYMLINK to a file outside cwd/scope (fs reads follow symlinks).
  // Resolve cwd and the target through the real filesystem (realpath) and require the RESOLVED real target
  // to stay (a) within the canonical cwd AND (b) within the canonical authorized scope — re-applying the
  // SAME canonicalId + authorizedPaths contract to the real repo-relative path. Only then read it. A
  // missing/dangling/unresolvable path fails closed (realpath throws ⇒ MISSING_EVIDENCE). No scope broadened.
  const abs = path.resolve(cwd, canon);
  let cwdReal, targetReal;
  try {
    cwdReal = fs.realpathSync(cwd);
    targetReal = fs.realpathSync(abs); // follows symlinks; throws on missing/dangling
  } catch {
    return { ok: false, code: CODE.MISSING_EVIDENCE, detail: `evidence path unresolvable (missing/dangling): ${canon}` };
  }
  const relReal = path.relative(cwdReal, targetReal).replace(/\\/g, "/");
  if (relReal === "" || relReal.startsWith("..") || path.isAbsolute(relReal)) {
    return { ok: false, code: CODE.PATH_OUTSIDE_SCOPE, detail: `evidence real path escapes cwd: ${canon} -> ${targetReal}` };
  }
  if (artifactState.canonicalId(relReal) === null || !inAuthorized(relReal, authorizedPaths)) {
    return { ok: false, code: CODE.PATH_OUTSIDE_SCOPE, detail: `evidence real path outside authorized scope: ${relReal}` };
  }
  let bytes;
  try {
    const st = fs.statSync(targetReal);
    if (!st.isFile() || st.size === 0) return { ok: false, code: CODE.MISSING_EVIDENCE, detail: `evidence absent/empty/not-a-file: ${relReal}` };
    bytes = fs.readFileSync(targetReal, "utf8");
  } catch {
    return { ok: false, code: CODE.MISSING_EVIDENCE, detail: `evidence unreadable: ${relReal}` };
  }
  let evidence;
  try { evidence = JSON.parse(bytes); } catch { return { ok: false, code: CODE.MALFORMED_JSON, detail: `evidence not JSON: ${canon}` }; }

  // Capability binding: the artifact must self-declare the SAME capability the execution record claims.
  if (!isPlainObject(evidence) || (capability && evidence.capability !== capability)) {
    return { ok: false, code: CODE.UNVERIFIED_PROVENANCE, detail: `evidence capability "${evidence && evidence.capability}" != executed capability "${capability}" (${canon})` };
  }

  const prov = verifyProvenance(capability, evidence);
  if (!prov.ok) return { ok: false, code: prov.code, detail: `${prov.detail} (${canon})` };

  const sha256 = artifactState.hashContent(bytes); // snapshot of the exact bytes — enables tamper detection
  return Object.freeze({
    ok: true,
    artifact: Object.freeze({ path: canon, objectiveId, capability, sha256, provenance: prov.provenance }),
  });
}

// Provenance rules grounded in the EXISTING capability evidence contracts. Default-deny for a capability
// whose evidence carries no recognized provenance signal — never invents one.
function verifyProvenance(capability, evidence) {
  if (capability === "External Research Acquisition") {
    if (evidence.mode === "DRY_RUN" || evidence.acquired !== true) {
      return { ok: false, code: CODE.DRY_RUN_NOT_ACQUISITION, detail: `mode=${evidence.mode} acquired=${evidence.acquired} is a plan/dry-run, not a verified acquisition` };
    }
    const sources = Array.isArray(evidence.sources) ? evidence.sources : [];
    if (sources.length === 0) return { ok: false, code: CODE.UNVERIFIED_PROVENANCE, detail: "acquired:true but no sources" };
    const everySourceProven = sources.every(
      (s) => isPlainObject(s) && Number.isFinite(s.http_status) && s.http_status >= 200 && s.http_status <= 299 && isNonEmptyString(s.content_hash),
    );
    if (!everySourceProven) return { ok: false, code: CODE.UNVERIFIED_PROVENANCE, detail: "a source lacks 2xx status or sha256 content_hash" };
    const ranked = Array.isArray(evidence.ranked) ? evidence.ranked : [];
    if (ranked.length > 0 && !ranked.every((r) => isPlainObject(r) && isNonEmptyString(r.provenance_ref))) {
      return { ok: false, code: CODE.UNVERIFIED_PROVENANCE, detail: "a ranked item lacks provenance_ref" };
    }
    return { ok: true, provenance: Object.freeze({ kind: "external-research-live", sources: sources.length, contentHashes: sources.map((s) => s.content_hash) }) };
  }
  // No provenance contract recognized for this capability ⇒ fail closed (never fabricate provenance).
  return { ok: false, code: CODE.UNVERIFIED_PROVENANCE, detail: `no repository provenance contract for capability "${capability}"` };
}

/**
 * packageDelivery(mission, { cwd }) → frozen Package.
 * READ-ONLY, FAIL-CLOSED, deterministic (no clock, no randomness). Never throws on ordinary invalid input.
 */
function packageDelivery(mission, opts) {
  const cwd = (opts && isNonEmptyString(opts.cwd)) ? opts.cwd : process.cwd();
  const reject = (rejections) =>
    Object.freeze({
      mission: isNonEmptyString(mission) ? mission : null,
      accepted: false,
      verdict: null,
      ledger: null,
      deliverable: Object.freeze([]),
      provenanceComplete: false,
      rejections: Object.freeze(rejections.map((r) => Object.freeze(r))),
      humanAuthorizationRequired: true,
      readOnly: true,
      generatedBy: "pilot-delivery-packager",
    });

  if (!isNonEmptyString(mission)) return reject([{ code: CODE.BAD_REQUEST, detail: "mission must be a non-empty string" }]);

  // 1) Baseline inputs (ABSENT vs MALFORMED distinguished; fail closed, never throw).
  const specR = readJson(cwd, missionSpecRel(mission));
  const reportR = readJson(cwd, REPORT_REL);
  const ledgerR = readJson(cwd, LEDGER_REL);
  const execR = readJson(cwd, EXEC_REL);
  const baselineErrs = [];
  for (const [name, r, rel] of [["spec", specR, missionSpecRel(mission)], ["report", reportR, REPORT_REL], ["ledger", ledgerR, LEDGER_REL], ["execution", execR, EXEC_REL]]) {
    if (!r.ok) baselineErrs.push({ code: r.code, detail: `${name} (${rel})` });
  }
  if (baselineErrs.length) return reject(baselineErrs);

  const spec = specR.value, report = reportR.value, ledger = ledgerR.value, exec = execR.value;
  const rejections = [];

  // 2) Mission identity bound across ALL sources (no borrowing).
  const reportMission = isPlainObject(report) ? report.mission : null;
  const execMission = isPlainObject(exec) ? exec.mission : null;
  const ledgerEntries = Array.isArray(ledger) ? ledger : (isPlainObject(ledger) && Array.isArray(ledger.entries) ? ledger.entries : []);
  const ledgerEntry = ledgerEntries.filter((e) => isPlainObject(e) && e.mission === mission).slice(-1)[0] || null;
  if (reportMission !== mission) rejections.push({ code: CODE.MISSION_IDENTITY_MISMATCH, detail: `report.mission="${reportMission}" != "${mission}"` });
  if (execMission != null && execMission !== mission) rejections.push({ code: CODE.MISSION_IDENTITY_MISMATCH, detail: `patch-execution.mission="${execMission}" != "${mission}"` });

  // 3) Validation verdict — require success; never infer/upgrade.
  const validated = isPlainObject(report) && report.mission === mission && report.validated === true && report.status === "SUCCESS";
  if (!validated) rejections.push({ code: CODE.NOT_VALIDATED, detail: `report validated=${report && report.validated} status=${report && report.status}` });

  // 4) Proven ledger entry — explicit, never upgraded.
  const proven = !!ledgerEntry && ledgerEntry.proven === true && ledgerEntry.validated === true;
  if (!proven) rejections.push({ code: CODE.NOT_PROVEN_IN_LEDGER, detail: ledgerEntry ? `entry proven=${ledgerEntry.proven} validated=${ledgerEntry.validated}` : "no ledger entry for mission" });

  // 5) Deliverable artifacts — executed objectives with verifiable evidence + provenance, in scope.
  const authorizedPaths = authorizedPathsOf(spec);
  const executed = isPlainObject(exec) && Array.isArray(exec.executed) ? exec.executed : [];
  const executedOk = executed.filter((e) => isPlainObject(e) && e.status === "EXECUTED");
  const deliverable = [];
  for (const rec of executedOk) {
    const v = verifyArtifact(cwd, rec, authorizedPaths);
    if (v.ok) deliverable.push(v.artifact);
    else rejections.push({ code: v.code, detail: v.detail });
  }
  if (executedOk.length === 0) rejections.push({ code: CODE.NO_DELIVERABLE, detail: "no EXECUTED objective with evidence" });

  const provenanceComplete = deliverable.length > 0 && rejections.every((r) => r.code !== CODE.UNVERIFIED_PROVENANCE && r.code !== CODE.DRY_RUN_NOT_ACQUISITION && r.code !== CODE.MISSING_EVIDENCE && r.code !== CODE.PATH_OUTSIDE_SCOPE && r.code !== CODE.MALFORMED_JSON);
  const accepted = rejections.length === 0 && validated && proven && deliverable.length > 0 && provenanceComplete;

  return Object.freeze({
    mission,
    accepted,
    verdict: Object.freeze({ status: report && report.status, validated: validated }),
    ledger: ledgerEntry ? Object.freeze({ state: ledgerEntry.state, proven: proven, archived: ledgerEntry.archived === true }) : null,
    deliverable: Object.freeze(deliverable),
    provenanceComplete,
    rejections: Object.freeze(rejections.map((r) => Object.freeze(r))),
    humanAuthorizationRequired: true, // ALWAYS — handoff is a human act, never performed here
    readOnly: true,
    generatedBy: "pilot-delivery-packager",
  });
}

module.exports = { packageDelivery, CODE };

if (require.main === module) {
  const out = packageDelivery(process.argv[2] || "", { cwd: process.cwd() });
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  process.exit(out.accepted ? 0 : 1);
}
