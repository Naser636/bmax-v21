#!/usr/bin/env node
"use strict";

/*
 * V5 §387 — WORLD MODEL / EPISTEMIC STATE (minimal canonical representation + versioned CAS).
 *
 * Canonical contract (ODG_FINAL_MASTER_V5_FICHE_06.md §387):
 *   "The existing Canonical Domain State is the authoritative home for world/situation state. A
 *    'World Model' is therefore a representation WITHIN STATE, not a separate database or runtime."
 *   Items a world model may contain: facts, hypotheses, unknowns, constraints, dependencies, risks,
 *   decisions, failed_attempts, validated_results, next_actions.
 *   Each material item carries an epistemic status: PROVEN / OBSERVED / INFERRED / HYPOTHESIS /
 *   UNKNOWN / CONTRADICTED / STALE / UNVERIFIED, preserving provenance, time, scope and confidence.
 *   "World Model ≠ Authority. ≠ Contract. ≠ Policy. ≠ Reality. … current reality and verified
 *    evidence remain authoritative."  And §9: a critical change uses a state VERSION + compare-and-set.
 *
 * This module is that representation: a pure, deterministic store of epistemic ITEMS, each with its own
 * canonical per-item STATE_VERSION that increments on a REAL epistemic transition, guarded by
 * compare-and-set (expectedPreviousVersion). It is NOT a separate runtime/DB — it is plain state
 * persisted (best-effort) as runtime/generated/world-model.json (git-ignored), exactly like the other
 * Runtime state artifacts. It GRANTS NO AUTHORITY and ASSERTS NO REALITY (epistemic only): consumers
 * (Resolver/Workgraph) read it, but verified evidence and current reality remain authoritative.
 *
 * Reuse (no new primitive): every transition is expressed as a C03 state_transition record and checked
 * by the ONE real validator (state-transition.validateStateTransition) — so the per-item version
 * discipline is the SAME canonical discipline, not a second one. Pure core (model in, new model out;
 * provenance/time are passed IN, never generated — determinism). A read-only require.main CLI prints the
 * contract descriptor. Persistence helpers (load/save) are the only I/O and are clearly separated.
 *
 * SCOPE (CTO-authorized, §387 only): canonical entity id + epistemic state + versioned CAS + persistence.
 * It does NOT model files/resources (a file is not a §387 epistemic item), so it is NOT wired into the
 * patch-executor file-WRITE CAS — mapping a file write to a world-model item is a semantic decision §387
 * does not define (documented sub-frontier). It provides authentic versioned CAS for world-model items.
 */

const fs = require("fs");
const { validateStateTransition, computeDifference } = require("./state-transition");

const ITEM_KINDS = Object.freeze([
  "fact", "hypothesis", "unknown", "constraint", "dependency", "risk",
  "decision", "failed_attempt", "validated_result", "next_action",
]);
const EPISTEMIC_STATUS = Object.freeze([
  "PROVEN", "OBSERVED", "INFERRED", "HYPOTHESIS", "UNKNOWN", "CONTRADICTED", "STALE", "UNVERIFIED",
]);
const DECISION = Object.freeze({ OK: "OK", CONFLICT: "CONFLICT", REJECTED: "REJECTED" });

const WORLD_MODEL_CONTRACT = Object.freeze({
  id: "V5-387-WORLD-MODEL",
  source: "FICHE_06 §387 (+ §9 state-version/compare-and-set, C03 state-transition)",
  itemKinds: ITEM_KINDS,
  epistemicStatus: EPISTEMIC_STATUS,
  decisions: Object.freeze(Object.values(DECISION)),
  notAuthority: "World Model ≠ Authority ≠ Contract ≠ Policy ≠ Reality (epistemic state only)",
  invariants: Object.freeze([
    "each item carries kind ∈ ITEM_KINDS and status ∈ EPISTEMIC_STATUS",
    "per-item version is a non-negative integer, monotonic, +1 on each real transition",
    "transition is compare-and-set: expectedPreviousVersion must equal current version, else CONFLICT (no change)",
    "every transition is a valid C03 state_transition record (one shared validator)",
    "provenance / time / scope / confidence preserved; grants no authority, asserts no reality",
    "deterministic / pure (model in → new model out; provenance & time passed in)",
  ]),
});

// ---- Type guards ------------------------------------------------------------------------------
function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
function isVersion(v) { return typeof v === "number" && Number.isInteger(v) && v >= 0; }

function emptyModel() { return Object.freeze({ items: Object.freeze({}) }); }
function read(model, id) {
  if (!isPlainObject(model) || !isPlainObject(model.items)) return null;
  const it = model.items[id];
  return it ? it : null;
}
function cloneItems(model) {
  const out = {};
  const items = isPlainObject(model) && isPlainObject(model.items) ? model.items : {};
  for (const k of Object.keys(items)) out[k] = items[k];
  return out;
}
function withItems(items) { return Object.freeze({ items: Object.freeze(items) }); }
function fail(model, decision, error) { return Object.freeze({ ok: false, decision, error, model }); }
function ok(model, item) { return Object.freeze({ ok: true, decision: DECISION.OK, model, item }); }

// A world-model item is itself a canonical state; `meta` carries provenance/time/scope/confidence (§387).
function makeItem(kind, status, version, value, meta) {
  const m = isPlainObject(meta) ? meta : {};
  return Object.freeze({
    kind, status, version, value: value === undefined ? null : value,
    provenance: m.provenance === undefined ? null : m.provenance,
    time: m.time === undefined ? null : m.time,
    scope: m.scope === undefined ? null : m.scope,
    confidence: m.confidence === undefined ? null : m.confidence,
  });
}

/**
 * put(model, id, spec) -> { ok, model, item } — create a NEW item at version 1. Rejects a duplicate id
 * (an existing item may only change via transition) or an invalid kind/status.
 */
function put(model, id, spec) {
  if (!isNonEmptyString(id)) return fail(model, DECISION.REJECTED, "put: id required");
  const s = isPlainObject(spec) ? spec : {};
  if (!ITEM_KINDS.includes(s.kind)) return fail(model, DECISION.REJECTED, "put: kind ∈ " + ITEM_KINDS.join(","));
  if (!EPISTEMIC_STATUS.includes(s.status)) return fail(model, DECISION.REJECTED, "put: status ∈ " + EPISTEMIC_STATUS.join(","));
  if (read(model, id)) return fail(model, DECISION.REJECTED, `put: item "${id}" already exists (use transition)`);
  const items = cloneItems(model);
  items[id] = makeItem(s.kind, s.status, 1, s.value, s);
  return ok(withItems(items), items[id]);
}

/**
 * transition(model, id, change) -> { ok, decision, model, item }
 *   change: { toStatus, expectedPreviousVersion, value?, provenance?, time?, scope?, confidence? }
 * COMPARE-AND-SET: expectedPreviousVersion MUST equal the item's current version, else CONFLICT and NO
 * change. On success the status moves to toStatus and version increments by 1. The move is expressed as
 * a C03 state_transition record and validated by the shared validator; an invalid record is REJECTED
 * (no change). Pure — returns a new model.
 */
function transition(model, id, change) {
  const it = read(model, id);
  if (!it) return fail(model, DECISION.REJECTED, `transition: unknown item "${id}"`);
  const c = isPlainObject(change) ? change : {};
  if (!EPISTEMIC_STATUS.includes(c.toStatus)) return fail(model, DECISION.REJECTED, "transition: toStatus ∈ " + EPISTEMIC_STATUS.join(","));
  if (!isVersion(c.expectedPreviousVersion)) {
    return fail(model, DECISION.REJECTED, "transition: expectedPreviousVersion (non-negative integer) required for compare-and-set");
  }
  // COMPARE-AND-SET.
  if (c.expectedPreviousVersion !== it.version) {
    return fail(model, DECISION.CONFLICT, `compare-and-set failed: expectedPreviousVersion ${c.expectedPreviousVersion} != current ${it.version} (stale)`);
  }
  const nextVersion = it.version + 1;
  const before = { status: it.status, value: it.value };
  const after = { status: c.toStatus, value: c.value === undefined ? it.value : c.value };
  // REAL-CHANGE guard (invariant above: "+1 on each REAL transition"). The C03 record embeds `version` in
  // state_before/state_after, so those always differ and the validator's I6 real-change check can never fire
  // here — enforce it on the CONTENT (status/value) instead. A move that changes neither status nor value is
  // a no-op: reject it (no version inflation, no spurious CONFLICT for other writers, no empty-diff record),
  // exactly as the standalone C03 validator rejects an advanced version with identical content.
  const difference = computeDifference(before, after);
  if (Object.keys(difference).length === 0) {
    return fail(model, DECISION.REJECTED, "transition: no real change (toStatus and value identical to current) — version advances only on a real transition");
  }
  // Express the move as a C03 record and validate with the ONE shared validator (reuse, not reimplement).
  const record = {
    state_before: { status: it.status, version: it.version },
    action: { transition: c.toStatus, item: id },
    observed_effect: { status: c.toStatus },
    state_after: { status: c.toStatus, version: nextVersion },
    state_version_before: it.version,
    state_version_after: nextVersion,
    difference,
    evidence_refs: Array.isArray(c.evidence_refs) ? c.evidence_refs : [],
    // Epistemic move is RECORDED coverage, not a proof verdict (honest; proof-requiring statuses would
    // demand evidence_refs — callers pass them when the transition asserts a verification conclusion).
    verification_status: isNonEmptyString(c.verification_status) ? c.verification_status : "RECORDED",
  };
  const v = validateStateTransition(record);
  if (!v.ok) return fail(model, DECISION.REJECTED, "transition: invalid C03 record: " + (v.errors[0] || "unknown"));

  const items = cloneItems(model);
  items[id] = makeItem(
    it.kind, c.toStatus, nextVersion, after.value,
    {
      provenance: c.provenance === undefined ? it.provenance : c.provenance,
      time: c.time === undefined ? it.time : c.time,
      scope: c.scope === undefined ? it.scope : c.scope,
      confidence: c.confidence === undefined ? it.confidence : c.confidence,
    },
  );
  return ok(withItems(items), items[id]);
}

/** snapshot(model) -> frozen read view: total + counts by status and by kind. Pure. */
function snapshot(model) {
  const items = isPlainObject(model) && isPlainObject(model.items) ? model.items : {};
  const byStatus = {}; const byKind = {};
  for (const id of Object.keys(items)) {
    const it = items[id];
    byStatus[it.status] = (byStatus[it.status] || 0) + 1;
    byKind[it.kind] = (byKind[it.kind] || 0) + 1;
  }
  return Object.freeze({ total: Object.keys(items).length, byStatus: Object.freeze(byStatus), byKind: Object.freeze(byKind) });
}

// ---- Persistence (the only I/O; clearly separated). world-model.json is git-ignored Runtime state. ----
function load(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (isPlainObject(raw) && isPlainObject(raw.items)) return withItems({ ...raw.items });
  } catch { /* absent / unreadable → empty model */ }
  return emptyModel();
}
function save(file, model) {
  fs.writeFileSync(file, JSON.stringify({ items: (isPlainObject(model) ? model.items : {}) || {} }, null, 2));
  return file;
}

module.exports = {
  ITEM_KINDS, EPISTEMIC_STATUS, DECISION, WORLD_MODEL_CONTRACT,
  emptyModel, read, put, transition, snapshot, load, save,
};

// ---- Read-only CLI: prints the contract descriptor; mutates nothing. --------------------------
if (require.main === module) {
  process.stdout.write(JSON.stringify(WORLD_MODEL_CONTRACT, null, 2) + "\n");
}
