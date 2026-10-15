#!/usr/bin/env node

"use strict";

/*
 * C03 — STATE / TRANSITION RECORD CONTRACT + DETERMINISTIC VALIDATOR
 * (TypeScript port; parity with runtime/core/state-transition.js).
 *
 * A pure, deterministic validator over a versioned state_transition record
 * (STATE_before → ACTION → OBSERVED_EFFECT → STATE_after). Strict TS port: the seven public exports
 * (VERIFICATION_STATUS, PROOF_REQUIRING, REQUIRED_FIELDS, C03_CONTRACT, canonicalize, computeDifference,
 * validateStateTransition), the frozen constants, the I1–I7 invariants, the DETERMINISTIC error-list
 * order, the frozen return shapes and purity are preserved EXACTLY. The .js remains the reference.
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
function isPlainObject(v: any): boolean {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function isInt(v: any): boolean {
  return typeof v === "number" && Number.isInteger(v);
}
function isNonNegInt(v: any): boolean {
  return isInt(v) && v >= 0;
}
function isStringArray(v: any): boolean {
  return Array.isArray(v) && v.every((x: any) => typeof x === "string");
}
// An ACTION / OBSERVED_EFFECT must be substantive: a non-empty string, or an object with >=1 key.
function isNonEmptyActionLike(v: any): boolean {
  if (typeof v === "string") return v.trim().length > 0;
  if (isPlainObject(v)) return Object.keys(v).length > 0;
  return false;
}

// ---- Deterministic helpers --------------------------------------------------------------------
function canonicalize(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

function computeDifference(before: any, after: any): any {
  const b = isPlainObject(before) ? before : {};
  const a = isPlainObject(after) ? after : {};
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort();
  const diff: any = {};
  for (const k of keys) {
    if (canonicalize(b[k]) !== canonicalize(a[k])) {
      diff[k] = { before: k in b ? b[k] : null, after: k in a ? a[k] : null };
    }
  }
  return diff;
}

function normalize(r: any): any {
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
function validateStateTransition(record: any): any {
  if (!isPlainObject(record)) {
    return Object.freeze({ ok: false, errors: Object.freeze(["record: must be a non-null object"]), record: null });
  }

  const errors: string[] = [];

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

  // I6 — a version advance must reflect a real change.
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

// ESM named exports (NOT `module.exports = {…}`): this makes the file a MODULE, so its internal
// helpers (isPlainObject, isInt, …) are MODULE-scoped rather than polluting the global script scope and
// colliding with same-named helpers in sibling lots compiled into the same tsconfig.runtime-dist program
// (TS2393). Compiles to the same `exports.<name>` CommonJS surface the consumers + bench require.
export {
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
