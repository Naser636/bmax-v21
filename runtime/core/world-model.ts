#!/usr/bin/env node
"use strict";

/*
 * V5 §387 — WORLD MODEL / EPISTEMIC STATE (TypeScript port; parity with runtime/core/world-model.js).
 *
 * Minimal canonical representation of world/situation state WITHIN STATE (not a separate DB): items
 * (fact/hypothesis/unknown/constraint/dependency/risk/decision/failed_attempt/validated_result/
 * next_action) each carrying an epistemic status, with versioned compare-and-set and C03 transition
 * records validated by the shared validator (state-transition, already TS, co-located in dist; deps=1).
 * Pure/deterministic (model in → new model out; provenance/time passed in; no clock/random).
 *
 * WI-WM-01 EXTENSION (Campaign 1 → 2): the model is a GRAPH — besides `items` it carries `entities`
 * (nodes, each with a free-form `type` + epistemic status) and `relations` (DIRECTED edges from→to,
 * typed, with referential integrity, fail-closed). A new epistemic status `SIMULATION` is isolated:
 * it is NEVER auto-promoted to a FACTUAL status (PROVEN/OBSERVED) without non-empty evidence_refs (§28
 * "Dreaming never becomes a fact automatically"). Entities and relations reuse the SAME CAS + C03
 * transition discipline as items (one shared validator; no new primitive). The original item API
 * (ITEM_KINDS, EPISTEMIC_STATUS, DECISION, WORLD_MODEL_CONTRACT, emptyModel, read, put, transition,
 * snapshot, load, save) is preserved EXACTLY; snapshot is extended ADDITIVELY (existing fields
 * total/byStatus/byKind unchanged). The historical .js remains the behavioural reference.
 */

const fs = require("fs");
const { validateStateTransition, computeDifference } = require("./state-transition");

const ITEM_KINDS = Object.freeze([
  "fact", "hypothesis", "unknown", "constraint", "dependency", "risk",
  "decision", "failed_attempt", "validated_result", "next_action",
]);
const EPISTEMIC_STATUS = Object.freeze([
  "PROVEN", "OBSERVED", "INFERRED", "HYPOTHESIS", "UNKNOWN", "CONTRADICTED", "STALE", "UNVERIFIED", "SIMULATION",
]);
// A FACTUAL status asserts the world is a certain way; SIMULATION (a "dream"/scenario) may never be
// promoted INTO one of these without evidence (§28). INFERRED/HYPOTHESIS/etc. are non-factual.
const FACTUAL_STATUS = Object.freeze(["PROVEN", "OBSERVED"]);
const DECISION = Object.freeze({ OK: "OK", CONFLICT: "CONFLICT", REJECTED: "REJECTED" });

const WORLD_MODEL_CONTRACT = Object.freeze({
  id: "V5-387-WORLD-MODEL",
  source: "FICHE_06 §387 (+ §9 state-version/compare-and-set, C03 state-transition); WI-WM-01 graph extension",
  itemKinds: ITEM_KINDS,
  epistemicStatus: EPISTEMIC_STATUS,
  factualStatus: FACTUAL_STATUS,
  decisions: Object.freeze(Object.values(DECISION)),
  graph: Object.freeze({ nodes: "entities (typed)", edges: "relations (directed from→to, typed)" }),
  notAuthority: "World Model ≠ Authority ≠ Contract ≠ Policy ≠ Reality (epistemic state only)",
  invariants: Object.freeze([
    "each item carries kind ∈ ITEM_KINDS and status ∈ EPISTEMIC_STATUS",
    "per-item version is a non-negative integer, monotonic, +1 on each real transition",
    "transition is compare-and-set: expectedPreviousVersion must equal current version, else CONFLICT (no change)",
    "every transition is a valid C03 state_transition record (one shared validator)",
    "provenance / time / scope / confidence preserved; grants no authority, asserts no reality",
    "deterministic / pure (model in → new model out; provenance & time passed in)",
    "SIMULATION is isolated: never promoted to a FACTUAL status (PROVEN/OBSERVED) without non-empty evidence_refs (§28)",
    "entities are typed nodes; relations are DIRECTED typed edges with referential integrity (from/to must exist, fail-closed)",
    "entities & relations reuse the SAME CAS + C03 transition discipline as items",
  ]),
});

// ---- Type guards ------------------------------------------------------------------------------
function isPlainObject(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isVersion(v: any): boolean { return typeof v === "number" && Number.isInteger(v) && v >= 0; }
function hasEvidence(v: any): boolean { return Array.isArray(v) && v.length > 0; }

function emptyModel(): any {
  return Object.freeze({ items: Object.freeze({}), entities: Object.freeze({}), relations: Object.freeze({}) });
}
function mapOf(model: any, key: any): any { return isPlainObject(model) && isPlainObject(model[key]) ? model[key] : {}; }
// Rebuild a frozen model preserving all three maps in a stable key order (items, entities, relations).
function freezeModel(items: any, entities: any, relations: any): any {
  return Object.freeze({
    items: Object.freeze({ ...items }),
    entities: Object.freeze({ ...entities }),
    relations: Object.freeze({ ...relations }),
  });
}
function cloneMap(model: any, key: any): any {
  const out: any = {}; const src = mapOf(model, key);
  for (const k of Object.keys(src)) out[k] = src[k];
  return out;
}

function read(model: any, id: any): any {
  if (!isPlainObject(model) || !isPlainObject(model.items)) return null;
  const it = model.items[id]; return it ? it : null;
}
function readEntity(model: any, id: any): any { const e = mapOf(model, "entities")[id]; return e ? e : null; }
function readRelation(model: any, id: any): any { const r = mapOf(model, "relations")[id]; return r ? r : null; }

function fail(model: any, decision: any, error: any): any { return Object.freeze({ ok: false, decision, error, model }); }
function ok(model: any, item: any): any { return Object.freeze({ ok: true, decision: DECISION.OK, model, item }); }
function okEntity(model: any, entity: any): any { return Object.freeze({ ok: true, decision: DECISION.OK, model, entity }); }
function okRelation(model: any, relation: any): any { return Object.freeze({ ok: true, decision: DECISION.OK, model, relation }); }

// A world-model node is itself a canonical state; `meta` carries provenance/time/scope/confidence (§387).
function metaOf(meta: any): any {
  const m = isPlainObject(meta) ? meta : {};
  return {
    provenance: m.provenance === undefined ? null : m.provenance,
    time: m.time === undefined ? null : m.time,
    scope: m.scope === undefined ? null : m.scope,
    confidence: m.confidence === undefined ? null : m.confidence,
  };
}
function makeItem(kind: any, status: any, version: any, value: any, meta: any): any {
  return Object.freeze({ kind, status, version, value: value === undefined ? null : value, ...metaOf(meta) });
}
function makeEntity(type: any, status: any, version: any, value: any, meta: any): any {
  return Object.freeze({ type, status, version, value: value === undefined ? null : value, ...metaOf(meta) });
}
function makeRelation(from: any, to: any, type: any, status: any, version: any, value: any, meta: any): any {
  return Object.freeze({ from, to, type, status, version, value: value === undefined ? null : value, ...metaOf(meta) });
}
// Carry prior provenance/time/scope/confidence unless the change overrides each one.
function carryMeta(node: any, c: any): any {
  return {
    provenance: c.provenance === undefined ? node.provenance : c.provenance,
    time: c.time === undefined ? node.time : c.time,
    scope: c.scope === undefined ? node.scope : c.scope,
    confidence: c.confidence === undefined ? node.confidence : c.confidence,
  };
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
  const items = cloneMap(model, "items");
  items[id] = makeItem(s.kind, s.status, 1, s.value, s);
  return ok(freezeModel(items, mapOf(model, "entities"), mapOf(model, "relations")), items[id]);
}

// Shared CAS + real-change + SIMULATION-isolation + C03-record discipline for ANY node (item/entity/relation).
// Returns { ok:true, after:{status,version,value,meta} } or { ok:false, decision, error }.
function transitionNode(id: any, node: any, change: any): any {
  const c = isPlainObject(change) ? change : {};
  if (!EPISTEMIC_STATUS.includes(c.toStatus)) return { ok: false, decision: DECISION.REJECTED, error: "toStatus ∈ " + EPISTEMIC_STATUS.join(",") };
  if (!isVersion(c.expectedPreviousVersion)) return { ok: false, decision: DECISION.REJECTED, error: "expectedPreviousVersion (non-negative integer) required for compare-and-set" };
  if (c.expectedPreviousVersion !== node.version) {
    return { ok: false, decision: DECISION.CONFLICT, error: `compare-and-set failed: expectedPreviousVersion ${c.expectedPreviousVersion} != current ${node.version} (stale)` };
  }
  // §28 ISOLATION: a SIMULATION node may not be promoted to a FACTUAL status without evidence.
  if (node.status === "SIMULATION" && FACTUAL_STATUS.includes(c.toStatus) && !hasEvidence(c.evidence_refs)) {
    return { ok: false, decision: DECISION.REJECTED, error: "SIMULATION cannot be promoted to a FACTUAL status (PROVEN/OBSERVED) without non-empty evidence_refs" };
  }
  const nextVersion = node.version + 1;
  const before = { status: node.status, value: node.value };
  const after = { status: c.toStatus, value: c.value === undefined ? node.value : c.value };
  const difference = computeDifference(before, after);
  if (Object.keys(difference).length === 0) {
    return { ok: false, decision: DECISION.REJECTED, error: "no real change (toStatus and value identical to current) — version advances only on a real transition" };
  }
  const record = {
    state_before: { status: node.status, version: node.version },
    action: { transition: c.toStatus, item: id },
    observed_effect: { status: c.toStatus },
    state_after: { status: c.toStatus, version: nextVersion },
    state_version_before: node.version,
    state_version_after: nextVersion,
    difference,
    evidence_refs: Array.isArray(c.evidence_refs) ? c.evidence_refs : [],
    verification_status: isNonEmptyString(c.verification_status) ? c.verification_status : "RECORDED",
  };
  const v = validateStateTransition(record);
  if (!v.ok) return { ok: false, decision: DECISION.REJECTED, error: "invalid C03 record: " + (v.errors[0] || "unknown") };
  return { ok: true, after: { status: c.toStatus, version: nextVersion, value: after.value, meta: carryMeta(node, c) } };
}

/**
 * transition(model, id, change) -> { ok, decision, model, item }
 * COMPARE-AND-SET + REAL-CHANGE guard. Expressed as a C03 record validated by the shared validator.
 */
function transition(model: any, id: any, change: any): any {
  const it = read(model, id);
  if (!it) return fail(model, DECISION.REJECTED, `transition: unknown item "${id}"`);
  const r = transitionNode(id, it, change);
  if (!r.ok) return fail(model, r.decision, "transition: " + r.error);
  const items = cloneMap(model, "items");
  items[id] = makeItem(it.kind, r.after.status, r.after.version, r.after.value, r.after.meta);
  return ok(freezeModel(items, mapOf(model, "entities"), mapOf(model, "relations")), items[id]);
}

// ---- Entities (typed graph nodes) -------------------------------------------------------------
function putEntity(model: any, id: any, spec: any): any {
  if (!isNonEmptyString(id)) return fail(model, DECISION.REJECTED, "putEntity: id required");
  const s = isPlainObject(spec) ? spec : {};
  if (!isNonEmptyString(s.type)) return fail(model, DECISION.REJECTED, "putEntity: type (non-empty string) required");
  if (!EPISTEMIC_STATUS.includes(s.status)) return fail(model, DECISION.REJECTED, "putEntity: status ∈ " + EPISTEMIC_STATUS.join(","));
  if (readEntity(model, id)) return fail(model, DECISION.REJECTED, `putEntity: entity "${id}" already exists (use transitionEntity)`);
  const entities = cloneMap(model, "entities");
  entities[id] = makeEntity(s.type, s.status, 1, s.value, s);
  return okEntity(freezeModel(mapOf(model, "items"), entities, mapOf(model, "relations")), entities[id]);
}
function transitionEntity(model: any, id: any, change: any): any {
  const e = readEntity(model, id);
  if (!e) return fail(model, DECISION.REJECTED, `transitionEntity: unknown entity "${id}"`);
  const r = transitionNode(id, e, change);
  if (!r.ok) return fail(model, r.decision, "transitionEntity: " + r.error);
  const entities = cloneMap(model, "entities");
  entities[id] = makeEntity(e.type, r.after.status, r.after.version, r.after.value, r.after.meta);
  return okEntity(freezeModel(mapOf(model, "items"), entities, mapOf(model, "relations")), entities[id]);
}

// ---- Relations (directed typed edges; referential integrity, fail-closed) ---------------------
function linkRelation(model: any, id: any, spec: any): any {
  if (!isNonEmptyString(id)) return fail(model, DECISION.REJECTED, "linkRelation: id required");
  const s = isPlainObject(spec) ? spec : {};
  if (!isNonEmptyString(s.type)) return fail(model, DECISION.REJECTED, "linkRelation: type (non-empty string) required");
  if (!EPISTEMIC_STATUS.includes(s.status)) return fail(model, DECISION.REJECTED, "linkRelation: status ∈ " + EPISTEMIC_STATUS.join(","));
  if (!isNonEmptyString(s.from) || !readEntity(model, s.from)) return fail(model, DECISION.REJECTED, "linkRelation: 'from' entity must exist (referential integrity)");
  if (!isNonEmptyString(s.to) || !readEntity(model, s.to)) return fail(model, DECISION.REJECTED, "linkRelation: 'to' entity must exist (referential integrity)");
  if (readRelation(model, id)) return fail(model, DECISION.REJECTED, `linkRelation: relation "${id}" already exists (use transitionRelation)`);
  const relations = cloneMap(model, "relations");
  relations[id] = makeRelation(s.from, s.to, s.type, s.status, 1, s.value, s);
  return okRelation(freezeModel(mapOf(model, "items"), mapOf(model, "entities"), relations), relations[id]);
}
function transitionRelation(model: any, id: any, change: any): any {
  const rel = readRelation(model, id);
  if (!rel) return fail(model, DECISION.REJECTED, `transitionRelation: unknown relation "${id}"`);
  const r = transitionNode(id, rel, change);
  if (!r.ok) return fail(model, r.decision, "transitionRelation: " + r.error);
  const relations = cloneMap(model, "relations");
  relations[id] = makeRelation(rel.from, rel.to, rel.type, r.after.status, r.after.version, r.after.value, r.after.meta);
  return okRelation(freezeModel(mapOf(model, "items"), mapOf(model, "entities"), relations), relations[id]);
}

/**
 * snapshot(model) -> frozen read view. EXISTING fields (total, byStatus, byKind) describe ITEMS and are
 * UNCHANGED. ADDITIVE fields describe the graph: entityTotal/entitiesByStatus/entitiesByType and
 * relationTotal/relationsByStatus/relationsByType. Pure.
 */
function snapshot(model: any): any {
  const items = mapOf(model, "items");
  const byStatus: any = {}; const byKind: any = {};
  for (const id of Object.keys(items)) {
    const it = items[id];
    byStatus[it.status] = (byStatus[it.status] || 0) + 1;
    byKind[it.kind] = (byKind[it.kind] || 0) + 1;
  }
  const entities = mapOf(model, "entities");
  const entitiesByStatus: any = {}; const entitiesByType: any = {};
  for (const id of Object.keys(entities)) {
    const e = entities[id];
    entitiesByStatus[e.status] = (entitiesByStatus[e.status] || 0) + 1;
    entitiesByType[e.type] = (entitiesByType[e.type] || 0) + 1;
  }
  const relations = mapOf(model, "relations");
  const relationsByStatus: any = {}; const relationsByType: any = {};
  for (const id of Object.keys(relations)) {
    const r = relations[id];
    relationsByStatus[r.status] = (relationsByStatus[r.status] || 0) + 1;
    relationsByType[r.type] = (relationsByType[r.type] || 0) + 1;
  }
  return Object.freeze({
    total: Object.keys(items).length,
    byStatus: Object.freeze(byStatus),
    byKind: Object.freeze(byKind),
    entityTotal: Object.keys(entities).length,
    entitiesByStatus: Object.freeze(entitiesByStatus),
    entitiesByType: Object.freeze(entitiesByType),
    relationTotal: Object.keys(relations).length,
    relationsByStatus: Object.freeze(relationsByStatus),
    relationsByType: Object.freeze(relationsByType),
  });
}

// ---- Persistence (the only I/O; clearly separated). world-model.json is git-ignored Runtime state. ----
function load(file: any): any {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (isPlainObject(raw)) {
      return freezeModel(
        isPlainObject(raw.items) ? raw.items : {},
        isPlainObject(raw.entities) ? raw.entities : {},
        isPlainObject(raw.relations) ? raw.relations : {},
      );
    }
  } catch { /* absent / unreadable → empty model */ }
  return emptyModel();
}
function save(file: any, model: any): any {
  fs.writeFileSync(file, JSON.stringify({
    items: mapOf(model, "items"),
    entities: mapOf(model, "entities"),
    relations: mapOf(model, "relations"),
  }, null, 2));
  return file;
}

module.exports = {
  ITEM_KINDS, EPISTEMIC_STATUS, FACTUAL_STATUS, DECISION, WORLD_MODEL_CONTRACT,
  emptyModel, read, put, transition,
  readEntity, putEntity, transitionEntity,
  readRelation, linkRelation, transitionRelation,
  snapshot, load, save,
};

// ---- Read-only CLI: prints the contract descriptor; mutates nothing. --------------------------
if (require.main === module) {
  process.stdout.write(JSON.stringify(WORLD_MODEL_CONTRACT, null, 2) + "\n");
}

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so the shared helper names
// (isPlainObject, isVersion, makeItem, ...) are module-scoped, not global script scope (TS2393 guard).
export {};
