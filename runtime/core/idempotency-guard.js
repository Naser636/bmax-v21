#!/usr/bin/env node
"use strict";

/*
 * V5 STAGE 5 — RECOVERY / IDEMPOTENCE: action-level idempotency + compare-and-set guard.
 *
 * Canonical requirement (ODG_FINAL_MASTER_DETAILED_V5_FICHE_07_METHODE_DE_TRAVAIL.md §9):
 *   "Un changement critique doit utiliser version d'état et mécanisme de conflit approprié :
 *    compare-and-set, atomic transition, merge déterministe ou owner explicite du conflit.
 *    Idempotence : ACTION_ID + IDEMPOTENCY_KEY + EXPECTED_PREVIOUS_STATE + EXPECTED_RESULT +
 *    DUPLICATE_DETECTION + RECONCILIATION."
 *
 * Forensic gap (repository truth): the ONLY idempotency present is the Mission Ledger's recording-level
 * dedup by (mission, runId) — a run finalizer guard, NOT an action-level one. The Stage-2 Action Contract
 * already carries `idempotencyKey` and `expectedTransition` (with state_version_before), but NOTHING
 * consumed them for DUPLICATE_DETECTION or compare-and-set. This module closes that gap.
 *
 * It composes the EXISTING primitives (no new state source): the canonical state VERSION from
 * state-transition.js (the `state_version_*` discipline) is the EXPECTED_PREVIOUS_STATE for compare-and-set,
 * and the Action Contract's `idempotencyKey` is the DUPLICATE_DETECTION key. Pure/deterministic, in the
 * style of state-transition.js / action-gate.js / budget-ledger.js (no clock, randomness or I/O; a journal
 * of applied keys is passed IN and a new journal is returned). A read-only require.main CLI prints the
 * descriptor.
 *
 * Decisions:
 *   PROCEED   — new action, expected-previous matches current ⇒ safe to apply.
 *   DUPLICATE — idempotencyKey already applied ⇒ DO NOT re-apply; reconcile to the recorded prior result.
 *   CONFLICT  — compare-and-set failed (expectedPreviousState != currentVersion) ⇒ stale; DO NOT apply.
 * Opt-in/truthful: a request that declares neither an idempotencyKey nor an expectedPreviousState is
 * UNGUARDED (guarded:false) and PROCEEDs — the guard enforces exactly what the action declares, nothing more.
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
function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
// A canonical version is a non-negative integer (same discipline as state-transition.state_version_*).
function isVersion(v) { return typeof v === "number" && Number.isInteger(v) && v >= 0; }

/** An empty journal (map of idempotencyKey -> recorded prior result). Plain data, caller-owned. */
function emptyJournal() { return Object.freeze({}); }

/**
 * admit(request, journal, currentVersion) -> frozen decision.
 *   request         { actionId?, idempotencyKey?, expectedPreviousState?, expectedResult? } — the latter
 *                   fields come straight from the Stage-2 Action Contract (idempotencyKey, and
 *                   expectedTransition.state_version_before as expectedPreviousState).
 *   journal         map idempotencyKey -> prior result (DUPLICATE_DETECTION + RECONCILIATION source).
 *   currentVersion  the current canonical state version (EXPECTED_PREVIOUS_STATE is compared against it).
 *
 * Precedence: DUPLICATE (already applied) is detected BEFORE compare-and-set — re-submitting a completed
 * action is always safe and returns its prior result, regardless of how the version has since moved.
 * Pure: never mutates the journal.
 */
function admit(request, journal, currentVersion) {
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
 * record(journal, idempotencyKey, result) -> NEW journal with the applied key + its result.
 * Call ONLY after the action actually applied (PROCEED → apply → record), so a later replay reconciles.
 * Pure: returns a new frozen journal; refuses to overwrite an existing key (an applied action is final).
 */
function record(journal, idempotencyKey, result) {
  const jrnl = isPlainObject(journal) ? journal : {};
  if (!isNonEmptyString(idempotencyKey)) return Object.freeze({ ...jrnl });
  if (Object.prototype.hasOwnProperty.call(jrnl, idempotencyKey)) return Object.freeze({ ...jrnl }); // never overwrite
  const next = { ...jrnl };
  next[idempotencyKey] = result === undefined ? null : result;
  return Object.freeze(next);
}

module.exports = { DECISION, IDEMPOTENCY_CONTRACT, emptyJournal, admit, record };

// ---- Read-only CLI: prints the contract descriptor; mutates nothing. --------------------------
if (require.main === module) {
  process.stdout.write(JSON.stringify(IDEMPOTENCY_CONTRACT, null, 2) + "\n");
}
