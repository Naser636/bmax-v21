#!/usr/bin/env node
"use strict";

/*
 * V5 DECISION A — ARTIFACT / RESOURCE REALITY STATE (canonical identity + versioned CAS).
 *
 * CTO-authorized reality layer. This is the state of a REAL repository artifact a consequential WRITE
 * mutates — distinct from, and never conflated with:
 *   §76 evidence/provenance identity (MISSION/OBJECTIVE id+version), §387 World Model (epistemic belief,
 *   ≠ reality), mission-lifecycle (governance state), runtime-model (projection/read model), the Action
 *   Contract (admission), the idempotency guard (duplicate/CAS decision) and patch-executor (mutation).
 * §387 is explicit: "current reality … remain[s] authoritative"; THIS is that reality-state layer.
 *
 * CANONICAL IDENTITY: the normalized repository-relative PATH of the artifact. Decision A authorizes the
 * path as the artifact's canonical resolution identity WITHIN the authorized write scope (it is stable,
 * deterministic, comparable, persistable, traceable). Absolute paths and any '..' escape are rejected
 * (never an identity). The path is the identity here; content and version are kept SEPARATE from it.
 *
 * REALITY STATE: { version, contentHash, provenance }.
 *   - version    non-negative integer, monotonic, +1 on each real applied mutation (absent artifact = 0).
 *   - contentHash sha256 of the artifact's content — ties the version to REAL content (a reality fact,
 *                 not an arbitrary token); recomputed on each transition from the bytes actually written.
 *   - provenance  caller-supplied origin (who/what produced this version) — preserved, never invented.
 *
 * COMPARE-AND-SET: a transition MUST declare expectedPreviousVersion; it must equal the current version
 * (0 when the artifact is not yet tracked), else CONFLICT and ZERO change. Each transition is expressed
 * as a C03 state_transition record and validated by the ONE shared validator (reuse, not reimplement).
 *
 * Pure core (model in → new model out; provenance/content passed IN, no clock, no randomness). Only I/O
 * is load/save of runtime/generated/artifact-state.json (git-ignored Runtime state), clearly separated.
 * A read-only require.main CLI prints the contract descriptor. Grants no authority; asserts only observed
 * content state (reality), never belief.
 */

const crypto = require("crypto");
const fs = require("fs");
const nodePath = require("path");
const { validateStateTransition, computeDifference } = require("./state-transition");

const DECISION = Object.freeze({ OK: "OK", CONFLICT: "CONFLICT", REJECTED: "REJECTED" });

const ARTIFACT_STATE_CONTRACT = Object.freeze({
  id: "V5-DECISION-A-ARTIFACT-STATE",
  source: "Decision A (reality layer); §9 state-version + compare-and-set; C03 state-transition; §387 reality boundary",
  identity: "normalized repository-relative path (within authorized write scope)",
  state: Object.freeze(["version", "contentHash", "provenance"]),
  decisions: Object.freeze(Object.values(DECISION)),
  invariants: Object.freeze([
    "identity = normalized repo-relative path; absolute / '..' escape rejected (never an identity)",
    "version is a non-negative integer, monotonic, +1 on each applied mutation (absent artifact = version 0)",
    "contentHash = sha256 of real content (version tied to reality, not an arbitrary token)",
    "compare-and-set: expectedPreviousVersion must equal current version, else CONFLICT (zero change)",
    "every transition is a valid C03 state_transition record (one shared validator)",
    "deterministic / pure (content & provenance passed in; no clock, no randomness)",
    "reality state only — grants no authority, asserts no belief",
  ]),
});

// ---- Type guards ------------------------------------------------------------------------------
function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
function isVersion(v) { return typeof v === "number" && Number.isInteger(v) && v >= 0; }

/** Deterministic sha256 of content (the reality fact underlying a version). */
function hashContent(content) {
  return crypto.createHash("sha256").update(typeof content === "string" ? content : String(content)).digest("hex");
}

/**
 * canonicalId(target) -> the artifact's canonical identity (normalized repo-relative path), or null when
 * the target cannot be a canonical identity (absent, absolute, or escaping the repo via '..').
 */
function canonicalId(target) {
  if (!isNonEmptyString(target)) return null;
  const norm = nodePath.normalize(target).replace(/\\/g, "/").replace(/\/+$/, "");
  if (nodePath.isAbsolute(norm) || norm === ".." || norm.startsWith("../")) return null;
  return norm;
}

function emptyModel() { return Object.freeze({ artifacts: Object.freeze({}) }); }
function read(model, id) {
  if (!isPlainObject(model) || !isPlainObject(model.artifacts)) return null;
  const a = model.artifacts[id];
  return a ? a : null;
}
function currentVersion(model, id) {
  const a = read(model, id);
  return a ? a.version : 0; // not-yet-tracked artifact is version 0 (pristine)
}
function cloneArtifacts(model) {
  const out = {};
  const a = isPlainObject(model) && isPlainObject(model.artifacts) ? model.artifacts : {};
  for (const k of Object.keys(a)) out[k] = a[k];
  return out;
}
function fail(model, decision, error) { return Object.freeze({ ok: false, decision, error, model }); }

/**
 * transition(model, target, change) -> { ok, decision, model, id, artifact }
 *   change: { expectedPreviousVersion, content | contentHash, provenance? }
 * COMPARE-AND-SET: expectedPreviousVersion must equal the current version (0 if untracked), else CONFLICT
 * and NO change. On success the artifact's version increments by 1 and its contentHash/provenance update.
 * The move is a C03 record validated by the shared validator. Pure — returns a new model.
 */
function transition(model, target, change) {
  const id = canonicalId(target);
  if (id === null) return fail(model, DECISION.REJECTED, `transition: "${target}" is not a valid canonical artifact identity`);
  const c = isPlainObject(change) ? change : {};
  if (!isVersion(c.expectedPreviousVersion)) {
    return fail(model, DECISION.REJECTED, "transition: expectedPreviousVersion (non-negative integer) required for compare-and-set");
  }
  const contentHash = isNonEmptyString(c.contentHash) ? c.contentHash
    : (c.content !== undefined ? hashContent(c.content) : null);
  if (!isNonEmptyString(contentHash)) return fail(model, DECISION.REJECTED, "transition: content or contentHash required");

  const cur = currentVersion(model, id);
  if (c.expectedPreviousVersion !== cur) {
    return fail(model, DECISION.CONFLICT, `compare-and-set failed: expectedPreviousVersion ${c.expectedPreviousVersion} != current ${cur} (stale)`);
  }
  const nextVersion = cur + 1;
  const prev = read(model, id);
  const record = {
    state_before: { artifact: id, version: cur, contentHash: prev ? prev.contentHash : null },
    action: { write: id },
    observed_effect: { contentHash },
    state_after: { artifact: id, version: nextVersion, contentHash },
    state_version_before: cur,
    state_version_after: nextVersion,
    difference: computeDifference(
      { version: cur, contentHash: prev ? prev.contentHash : null },
      { version: nextVersion, contentHash },
    ),
    evidence_refs: Array.isArray(c.evidence_refs) ? c.evidence_refs : [],
    verification_status: isNonEmptyString(c.verification_status) ? c.verification_status : "RECORDED",
  };
  const v = validateStateTransition(record);
  if (!v.ok) return fail(model, DECISION.REJECTED, "transition: invalid C03 record: " + (v.errors[0] || "unknown"));

  const artifacts = cloneArtifacts(model);
  artifacts[id] = Object.freeze({
    version: nextVersion,
    contentHash,
    provenance: c.provenance === undefined ? (prev ? prev.provenance : null) : c.provenance,
  });
  return Object.freeze({ ok: true, decision: DECISION.OK, model: Object.freeze({ artifacts: Object.freeze(artifacts) }), id, artifact: artifacts[id] });
}

function snapshot(model) {
  const a = isPlainObject(model) && isPlainObject(model.artifacts) ? model.artifacts : {};
  return Object.freeze({ total: Object.keys(a).length });
}

// ---- Persistence (only I/O). artifact-state.json is git-ignored Runtime state. ----------------
function load(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (isPlainObject(raw) && isPlainObject(raw.artifacts)) return Object.freeze({ artifacts: Object.freeze({ ...raw.artifacts }) });
  } catch { /* absent / unreadable → empty */ }
  return emptyModel();
}
function save(file, model) {
  fs.writeFileSync(file, JSON.stringify({ artifacts: (isPlainObject(model) ? model.artifacts : {}) || {} }, null, 2));
  return file;
}

module.exports = {
  DECISION, ARTIFACT_STATE_CONTRACT,
  hashContent, canonicalId, emptyModel, read, currentVersion, transition, snapshot, load, save,
};

// ---- Read-only CLI: prints the contract descriptor; mutates nothing. --------------------------
if (require.main === module) {
  process.stdout.write(JSON.stringify(ARTIFACT_STATE_CONTRACT, null, 2) + "\n");
}
