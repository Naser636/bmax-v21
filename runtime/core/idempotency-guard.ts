#!/usr/bin/env node
"use strict";

/*
 * V5 STAGE 5 — RECOVERY / IDEMPOTENCE: action-level idempotency + compare-and-set guard
 * (TypeScript port; parity with runtime/core/idempotency-guard.js).
 *
 * Strict TS port: the public exports (DECISION, IDEMPOTENCY_CONTRACT, emptyJournal, admit, record),
 * DUPLICATE-before-compare-and-set precedence, the exact frozen-object shapes + field order + detail
 * messages, the deep Object.freeze discipline and purity (never mutates the journal) are preserved
 * EXACTLY. The historical .js remains the behavioural reference.
 */

const DECISION = Object.freeze({ PROCEED: "PROCEED", DUPLICATE: "DUPLICATE", CONFLICT: "CONFLICT" });

const IDEMPOTENCY_CONTRACT = Object.freeze({
  id: "V5-STAGE5-IDEMPOTENCY-GUARD",
  source: "FICHE_07 §9",
  fields: Object.freeze(["actionId", "idempotencyKey", "expectedPreviousState", "expectedResult"]),
  decisions: Object.freeze(Object.values(DECISION)),
  rules: Object.freeze([
    "DUPLICATE_DETECTION: a previously-applied idempotencyKey ⇒ DUPLICATE (reconcile to prior result; no re-apply)",
    "COMPARE-AND-SET: expectedPreviousState must equal the current canonical version, else CONFLICT (stale)",
    "RECONCILIATION: DUPLICATE returns the recorded prior result verbatim",
    "opt-in: no idempotencyKey and no expectedPreviousState ⇒ UNGUARDED PROCEED",
    "deterministic / pure (journal passed in, new journal returned)",
  ]),
});

// ---- Type guards ------------------------------------------------------------------------------
function isPlainObject(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
// A canonical version is a non-negative integer (same discipline as state-transition.state_version_*).
function isVersion(v: any): boolean { return typeof v === "number" && Number.isInteger(v) && v >= 0; }

/** An empty journal (map of idempotencyKey -> recorded prior result). Plain data, caller-owned. */
function emptyJournal(): any { return Object.freeze({}); }

/**
 * admit(request, journal, currentVersion) -> frozen decision. Precedence: DUPLICATE (already applied) is
 * detected BEFORE compare-and-set — re-submitting a completed action is always safe. Pure: never mutates.
 */
function admit(request: any, journal: any, currentVersion: any): any {
  const req = isPlainObject(request) ? request : {};
  const jrnl = isPlainObject(journal) ? journal : {};
  const key = isNonEmptyString(req.idempotencyKey) ? req.idempotencyKey : null;
  const hasExpected = req.expectedPreviousState !== undefined && req.expectedPreviousState !== null;
  const guarded = key !== null || hasExpected;

  // DUPLICATE_DETECTION + RECONCILIATION (checked first, so a replay is always safe).
  if (key !== null && Object.prototype.hasOwnProperty.call(jrnl, key)) {
    return Object.freeze({
      decision: DECISION.DUPLICATE,
      guarded: true,
      actionId: isNonEmptyString(req.actionId) ? req.actionId : null,
      idempotencyKey: key,
      reconciledResult: jrnl[key],
      detail: `idempotencyKey "${key}" already applied — reconciled to prior result (no re-apply)`,
    });
  }

  // COMPARE-AND-SET: expectedPreviousState must match the current canonical version.
  if (hasExpected) {
    const expected = req.expectedPreviousState;
    if (!isVersion(expected) || !isVersion(currentVersion)) {
      return Object.freeze({
        decision: DECISION.CONFLICT,
        guarded: true,
        actionId: isNonEmptyString(req.actionId) ? req.actionId : null,
        idempotencyKey: key,
        detail: "compare-and-set: expectedPreviousState and currentVersion must both be non-negative integers",
      });
    }
    if (expected !== currentVersion) {
      return Object.freeze({
        decision: DECISION.CONFLICT,
        guarded: true,
        actionId: isNonEmptyString(req.actionId) ? req.actionId : null,
        idempotencyKey: key,
        detail: `compare-and-set failed: expectedPreviousState ${expected} != currentVersion ${currentVersion} (stale)`,
      });
    }
  }

  return Object.freeze({
    decision: DECISION.PROCEED,
    guarded,
    actionId: isNonEmptyString(req.actionId) ? req.actionId : null,
    idempotencyKey: key,
    detail: guarded ? "new action, expected-previous matches current — safe to apply" : "unguarded action — safe to apply",
  });
}

/**
 * record(journal, idempotencyKey, result) -> NEW journal with the applied key + its result. Pure:
 * returns a new frozen journal; refuses to overwrite an existing key (an applied action is final).
 */
function record(journal: any, idempotencyKey: any, result: any): any {
  const jrnl = isPlainObject(journal) ? journal : {};
  if (!isNonEmptyString(idempotencyKey)) return Object.freeze({ ...jrnl });
  if (Object.prototype.hasOwnProperty.call(jrnl, idempotencyKey)) return Object.freeze({ ...jrnl }); // never overwrite
  const next: any = { ...jrnl };
  next[idempotencyKey] = result === undefined ? null : result;
  return Object.freeze(next);
}

module.exports = { DECISION, IDEMPOTENCY_CONTRACT, emptyJournal, admit, record };

// ---- Read-only CLI: prints the contract descriptor; mutates nothing. --------------------------
if (require.main === module) {
  process.stdout.write(JSON.stringify(IDEMPOTENCY_CONTRACT, null, 2) + "\n");
}

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so this file's internal helpers
// (isPlainObject / isNonEmptyString / isVersion) are MODULE-scoped rather than polluting the global
// script scope and colliding with same-named helpers in sibling lots compiled into the same tsconfig
// program (TS2393, observed in the state-transition lot). The CommonJS API above
// (module.exports = { DECISION, IDEMPOTENCY_CONTRACT, emptyJournal, admit, record }) is unchanged, as is
// the compiled require() surface and the behavioural parity with the .js reference.
export {};
