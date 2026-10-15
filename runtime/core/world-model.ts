#!/usr/bin/env node
"use strict";

/*
 * V5 §387 — WORLD MODEL / EPISTEMIC STATE (TypeScript port; parity with runtime/core/world-model.js).
 *
 * Minimal canonical representation of world/situation state WITHIN STATE (not a separate DB): items
 * (fact/hypothesis/unknown/constraint/dependency/risk/decision/failed_attempt/validated_result/
 * next_action) each carrying an epistemic status, with versioned compare-and-set and C03 transition
 * records validated by the shared validator (state-transition, already TS, co-located in dist; deps=1).
 * Pure/deterministic (model in → new model out; provenance/time passed in; no clock/random). Strict
 * port: all exports (ITEM_KINDS, EPISTEMIC_STATUS, DECISION, WORLD_MODEL_CONTRACT, emptyModel, read, put,
 * transition, snapshot, load, save), the frozen constants, the put dup/kind/status rejection, the CAS +
 * real-change guard, the C03 record shape and the caller-supplied load/save are preserved EXACTLY. The
 * historical .js remains the behavioural reference.
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
function isPlainObject(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isVersion(v: any): boolean { return typeof v === "number" && Number.isInteger(v) && v >= 0; }

function emptyModel(): any { return Object.freeze({ items: Object.freeze({}) }); }
function read(model: any, id: any): any {
  if (!isPlainObject(model) || !isPlainObject(model.items)) return null;
  const it = model.items[id];
  return it ? it : null;
}
function cloneItems(model: any): any {
  const out: any = {};
  const items = isPlainObject(model) && isPlainObject(model.items) ? model.items : {};
  for (const k of Object.keys(items)) out[k] = items[k];
  return out;
}
function withItems(items: any): any { return Object.freeze({ items: Object.freeze(items) }); }
function fail(model: any, decision: any, error: any): any { return Object.freeze({ ok: false, decision, error, model }); }
function ok(model: any, item: any): any { return Object.freeze({ ok: true, decision: DECISION.OK, model, item }); }

// A world-model item is itself a canonical state; `meta` carries provenance/time/scope/confidence (§387).
function makeItem(kind: any, status: any, version: any, value: any, meta: any): any {
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
 * or an invalid kind/status.
 */
function put(model: any, id: any, spec: any): any {
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
 * COMPARE-AND-SET + REAL-CHANGE guard. Expressed as a C03 record validated by the shared validator.
 */
function transition(model: any, id: any, change: any): any {
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
  // REAL-CHANGE guard on CONTENT (status/value); a no-op move is rejected (no version inflation).
  const difference = computeDifference(before, after);
  if (Object.keys(difference).length === 0) {
    return fail(model, DECISION.REJECTED, "transition: no real change (toStatus and value identical to current) — version advances only on a real transition");
  }
  const record = {
    state_before: { status: it.status, version: it.version },
    action: { transition: c.toStatus, item: id },
    observed_effect: { status: c.toStatus },
    state_after: { status: c.toStatus, version: nextVersion },
    state_version_before: it.version,
    state_version_after: nextVersion,
    difference,
    evidence_refs: Array.isArray(c.evidence_refs) ? c.evidence_refs : [],
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
function snapshot(model: any): any {
  const items = isPlainObject(model) && isPlainObject(model.items) ? model.items : {};
  const byStatus: any = {}; const byKind: any = {};
  for (const id of Object.keys(items)) {
    const it = items[id];
    byStatus[it.status] = (byStatus[it.status] || 0) + 1;
    byKind[it.kind] = (byKind[it.kind] || 0) + 1;
  }
  return Object.freeze({ total: Object.keys(items).length, byStatus: Object.freeze(byStatus), byKind: Object.freeze(byKind) });
}

// ---- Persistence (the only I/O; clearly separated). world-model.json is git-ignored Runtime state. ----
function load(file: any): any {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (isPlainObject(raw) && isPlainObject(raw.items)) return withItems({ ...raw.items });
  } catch { /* absent / unreadable → empty model */ }
  return emptyModel();
}
function save(file: any, model: any): any {
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

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so the shared helper names
// (isPlainObject, isVersion, makeItem, ...) are module-scoped, not global script scope (TS2393 guard).
export {};
