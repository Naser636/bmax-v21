#!/usr/bin/env node

"use strict";

/*
 * C03 — STATE / TRANSITION RECORD CONTRACT + DETERMINISTIC VALIDATOR.
 *
 * Phase-0 P0-CURRENT-069 C03-contract. Root gap (per docs/audit/phase-0/current/PHASE_0_CARNET.md,
 * P0-CURRENT-069-G GAP ANALYSIS): the canonical truth model
 *
 *     STATE_before → ACTION → OBSERVED_EFFECT → STATE_after
 *
 * had NO governed record contract. runtime-model.js is a SNAPSHOT of current state (no transitions);
 * governance/state-machine.json is the mission LIFECYCLE (no per-entity observed-effect/diff/evidence);
 * src/core/*-state.ts are domain slices. None recorded a versioned, evidence-bearing transition.
 *
 * This module is that contract. It is the FIRST increment the carnet authorized (CONTRACT + VALIDATOR,
 * NOT a runtime): a pure, deterministic validator over a versioned state_transition record. It creates
 * NO new primitive, kernel, runtime, or parallel state source — it is additive and standalone, in the
 * style of scope-observer.js / objective-attribution.js (pure core, a read-only require.main CLI that
 * only prints). Existing surfaces feed/consume it: a runtime-model snapshot fits state_before/
 * state_after unchanged (opaque objects), and verification_status reuses the system's epistemic
 * honesty vocabulary (RECORDED is coverage, never a proof — as in objective-attribution.js).
 *
 * THE CONTRACT (required fields of a state_transition record):
 *   state_before          opaque object — canonical state BEFORE the action.
 *   action                non-empty object or string — the ACTION applied.
 *   observed_effect       non-empty object or string — what was OBSERVED to happen.
 *   state_after           opaque object — canonical state AFTER the action.
 *   state_version_before  non-negative integer — optimistic-concurrency version before.
 *   state_version_after   integer, STRICTLY greater than state_version_before.
 *   difference            object — the (possibly computed) before→after diff; non-empty when the
 *                         version advances a real change (enforced: cannot be identical state).
 *   evidence_refs         array of strings — references to evidence artifacts.
 *   verification_status   one of VERIFICATION_STATUS (controlled vocabulary, below).
 *
 * C03 INVARIANTS (enforced by validateStateTransition, deterministic):
 *   I1  every required field present and well-typed, else REJECTED with a stable error list.
 *   I2  state_version_after > state_version_before  (STRICT monotonic advance).
 *   I3  evidence_refs is an array of strings (controlled shape).
 *   I4  verification_status is a known member of the controlled vocabulary.
 *   I5  PROOF-REQUIRING statuses (VERIFIED, REJECTED) MUST carry at least one evidence_ref —
 *       a verification conclusion is never asserted without a proof reference. RECORDED / UNVERIFIED
 *       are honest coverage and may carry no evidence.
 *   I6  a version advance must reflect a real change: canonical(state_before) !== canonical(state_after).
 *   I7  deterministic: validateStateTransition / canonicalize / computeDifference are pure functions of
 *       their inputs (no clock, no randomness, no I/O), and the error list order is fixed.
 *
 * verification_status is NOT a done_when proof and NOT a mission SUCCESS verdict; like
 * objective-attribution's VERDICT it records the OBSERVED verification state of ONE transition only.
 */

// ---- Controlled vocabulary (frozen) ------------------------------------------------------------
const VERIFICATION_STATUS = Object.freeze({
  VERIFIED: "VERIFIED", // observed_effect confirmed by evidence — proof-requiring.
  REJECTED: "REJECTED", // observed_effect contradicts the expected effect — proof-requiring.
  RECORDED: "RECORDED", // honest coverage only — NOT a proof; evidence optional.
  UNVERIFIED: "UNVERIFIED", // not yet verified; evidence optional.
});

// Statuses that ASSERT a verification conclusion and therefore require >=1 evidence_ref.
const PROOF_REQUIRING = Object.freeze([VERIFICATION_STATUS.VERIFIED, VERIFICATION_STATUS.REJECTED]);

const REQUIRED_FIELDS = Object.freeze([
  "state_before",
  "action",
  "observed_effect",
  "state_after",
  "state_version_before",
  "state_version_after",
  "difference",
  "evidence_refs",
  "verification_status",
]);

// Self-describing contract descriptor (testable, documentation-as-data).
const C03_CONTRACT = Object.freeze({
  id: "C03",
  shape: "STATE_before -> ACTION -> OBSERVED_EFFECT -> STATE_after",
  requiredFields: REQUIRED_FIELDS,
  verificationStatuses: Object.freeze(Object.values(VERIFICATION_STATUS)),
  proofRequiring: PROOF_REQUIRING,
  invariants: Object.freeze([
    "I1 all required fields present and well-typed",
    "I2 state_version_after strictly > state_version_before",
    "I3 evidence_refs is an array of strings",
    "I4 verification_status is a known member",
    "I5 proof-requiring status => at least one evidence_ref",
    "I6 a version advance implies state_after !== state_before",
    "I7 deterministic / pure",
  ]),
});

// ---- Type guards ------------------------------------------------------------------------------
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function isInt(v) {
  return typeof v === "number" && Number.isInteger(v);
}
function isNonNegInt(v) {
  return isInt(v) && v >= 0;
}
function isStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}
// An ACTION / OBSERVED_EFFECT must be substantive: a non-empty string, or an object with >=1 key.
function isNonEmptyActionLike(v) {
  if (typeof v === "string") return v.trim().length > 0;
  if (isPlainObject(v)) return Object.keys(v).length > 0;
  return false;
}

// ---- Deterministic helpers --------------------------------------------------------------------
/**
 * canonicalize(value) -> stable JSON string with object keys sorted recursively.
 * Pure and order-independent: two structurally-equal values ALWAYS produce the same string,
 * regardless of key insertion order. Underpins I6 (real-change check) and I7 (determinism).
 */
function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

/**
 * computeDifference(before, after) -> deterministic top-level diff { key: {before, after} } for
 * every key whose canonical value changed. Sorted key order ⇒ identical inputs ⇒ identical output.
 * Provided so a caller can fill `difference` consistently; the validator checks presence, not identity.
 */
function computeDifference(before, after) {
  const b = isPlainObject(before) ? before : {};
  const a = isPlainObject(after) ? after : {};
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort();
  const diff = {};
  for (const k of keys) {
    if (canonicalize(b[k]) !== canonicalize(a[k])) {
      diff[k] = { before: k in b ? b[k] : null, after: k in a ? a[k] : null };
    }
  }
  return diff;
}

function normalize(r) {
  return Object.freeze({
    state_before: r.state_before,
    action: r.action,
    observed_effect: r.observed_effect,
    state_after: r.state_after,
    state_version_before: r.state_version_before,
    state_version_after: r.state_version_after,
    difference: r.difference,
    evidence_refs: Object.freeze([...r.evidence_refs]),
    verification_status: r.verification_status,
  });
}

// ---- The validator ----------------------------------------------------------------------------
/**
 * validateStateTransition(record) -> { ok, errors, record }
 *   ok      true iff every C03 invariant holds.
 *   errors  frozen, deterministically-ordered list of human-readable reasons (empty when ok).
 *   record  the normalized, frozen transition when ok; otherwise null.
 *
 * Pure: no clock, no randomness, no I/O. Same input ⇒ same output, always (I7).
 */
function validateStateTransition(record) {
  if (!isPlainObject(record)) {
    return Object.freeze({ ok: false, errors: Object.freeze(["record: must be a non-null object"]), record: null });
  }

  const errors = [];

  // I1 — required object states.
  if (!isPlainObject(record.state_before)) errors.push("state_before: required object");
  if (!isPlainObject(record.state_after)) errors.push("state_after: required object");

  // I1 — ACTION and OBSERVED_EFFECT must be substantive.
  if (!isNonEmptyActionLike(record.action)) errors.push("action: required non-empty object or string");
  if (!isNonEmptyActionLike(record.observed_effect)) errors.push("observed_effect: required non-empty object or string");

  // I1 + I2 — versions.
  const vb = record.state_version_before;
  const va = record.state_version_after;
  if (!isNonNegInt(vb)) errors.push("state_version_before: required non-negative integer");
  if (!isInt(va)) errors.push("state_version_after: required integer");
  if (isInt(vb) && isInt(va) && !(va > vb)) {
    errors.push("state_version_after: must be strictly greater than state_version_before");
  }

  // I1 — difference present.
  if (!isPlainObject(record.difference)) errors.push("difference: required object");

  // I3 — evidence_refs shape.
  const evidenceOk = isStringArray(record.evidence_refs);
  if (!evidenceOk) errors.push("evidence_refs: required array of strings");

  // I4 — verification_status membership.
  const vs = record.verification_status;
  const statusKnown = Object.values(VERIFICATION_STATUS).includes(vs);
  if (!statusKnown) {
    errors.push("verification_status: required one of " + Object.values(VERIFICATION_STATUS).join(", "));
  }

  // I5 — proof-requiring status demands at least one evidence_ref.
  if (statusKnown && PROOF_REQUIRING.includes(vs)) {
    if (!evidenceOk || record.evidence_refs.length === 0) {
      errors.push("verification_status " + vs + ": requires at least one evidence_ref");
    }
  }

  // I6 — a version advance must reflect a real change (only checked once states are well-formed
  // and the versions strictly advanced, so it never fires on top of a shape error).
  if (
    isPlainObject(record.state_before) &&
    isPlainObject(record.state_after) &&
    isInt(vb) &&
    isInt(va) &&
    va > vb &&
    canonicalize(record.state_before) === canonicalize(record.state_after)
  ) {
    errors.push("state_after: identical to state_before while state_version advanced (no observed change)");
  }

  const ok = errors.length === 0;
  return Object.freeze({ ok, errors: Object.freeze(errors), record: ok ? normalize(record) : null });
}

module.exports = {
  VERIFICATION_STATUS,
  PROOF_REQUIRING,
  REQUIRED_FIELDS,
  C03_CONTRACT,
  canonicalize,
  computeDifference,
  validateStateTransition,
};

// ---- Read-only CLI: prints the contract descriptor; mutates nothing. --------------------------
if (require.main === module) {
  process.stdout.write(JSON.stringify(C03_CONTRACT, null, 2) + "\n");
}
