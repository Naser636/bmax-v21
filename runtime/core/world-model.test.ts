#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";

/*
 * V5 §387 — World Model / epistemic state store. Locks: item create/read, initial version, valid
 * transition + version increment, compare-and-set success/stale, zero change on CONFLICT, two
 * concurrent writers (lost-update detected), replay, determinism, persistence round-trip, controlled
 * vocab, and the boundary proofs (not runtime-model, not mission-lifecycle; grants no authority).
 *
 * Run directly: node runtime/core/world-model.test.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const W = require("./world-model");

let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

console.log("V5 §387 — WORLD MODEL / EPISTEMIC STATE");

// Create + read + initial version.
{
  const r = W.put(W.emptyModel(), "e1", { kind: "fact", status: "OBSERVED", value: { x: 1 }, provenance: "run-1", time: "T0", scope: "mission:M", confidence: 0.6 });
  check(r.ok && r.item.version === 1 && r.item.status === "OBSERVED" && r.item.kind === "fact", "put ⇒ item created at version 1 with epistemic status + provenance");
  check(W.read(r.model, "e1").confidence === 0.6, "read returns the stored item (provenance/confidence preserved)");
  check(!W.put(r.model, "e1", { kind: "fact", status: "OBSERVED" }).ok, "duplicate id ⇒ REJECTED (use transition)");
}
// Controlled vocabulary.
{
  check(!W.put(W.emptyModel(), "e", { kind: "bogus", status: "OBSERVED" }).ok, "invalid kind ⇒ REJECTED");
  check(!W.put(W.emptyModel(), "e", { kind: "fact", status: "BOGUS" }).ok, "invalid status ⇒ REJECTED");
}

// Valid transition ⇒ version increments; CAS success.
{
  let m = W.put(W.emptyModel(), "e1", { kind: "hypothesis", status: "HYPOTHESIS" }).model;
  const t = W.transition(m, "e1", { toStatus: "PROVEN", expectedPreviousVersion: 1, evidence_refs: ["ev1"], verification_status: "VERIFIED", provenance: "run-2" });
  check(t.ok && t.item.version === 2 && t.item.status === "PROVEN", "transition (CAS match) ⇒ status PROVEN, version 1→2");
  check(t.item.provenance === "run-2", "transition updates provenance");
}
// REAL-CHANGE guard: a no-op transition (same status AND same value) is REJECTED — the version advances
// only on a real transition (invariant), so no-op version inflation / spurious CONFLICTs cannot occur.
{
  let m = W.put(W.emptyModel(), "e1", { kind: "fact", status: "OBSERVED", value: { x: 1 } }).model;
  const noop = W.transition(m, "e1", { toStatus: "OBSERVED", expectedPreviousVersion: 1 });
  check(noop.ok === false && noop.decision === "REJECTED", "no-op transition (same status + same value) ⇒ REJECTED (no version inflation)");
  check(W.read(noop.model, "e1").version === 1, "no-op ⇒ ZERO change (version stays 1)");
  // a value-only change (status unchanged) is a REAL change ⇒ accepted, version advances.
  const valOnly = W.transition(m, "e1", { toStatus: "OBSERVED", value: { x: 2 }, expectedPreviousVersion: 1 });
  check(valOnly.ok === true && valOnly.item.version === 2, "value-only change (same status) ⇒ accepted, version 1→2 (real change)");
}
// Compare-and-set STALE ⇒ CONFLICT, zero change.
{
  let m = W.put(W.emptyModel(), "e1", { kind: "fact", status: "OBSERVED" }).model;
  m = W.transition(m, "e1", { toStatus: "PROVEN", expectedPreviousVersion: 1, evidence_refs: ["ev"], verification_status: "VERIFIED" }).model; // now v2
  const stale = W.transition(m, "e1", { toStatus: "STALE", expectedPreviousVersion: 1 }); // expects v1, actual v2
  check(stale.ok === false && stale.decision === "CONFLICT", "stale compare-and-set ⇒ CONFLICT");
  check(W.read(stale.model, "e1").version === 2 && W.read(stale.model, "e1").status === "PROVEN", "CONFLICT ⇒ ZERO change (version + status unchanged)");
}
// expectedPreviousVersion required (no blind overwrite).
{
  const m = W.put(W.emptyModel(), "e1", { kind: "fact", status: "OBSERVED" }).model;
  check(!W.transition(m, "e1", { toStatus: "PROVEN" }).ok, "transition without expectedPreviousVersion ⇒ REJECTED (CAS mandatory)");
}

// Two concurrent writers reading the same version ⇒ lost-update detected.
{
  const base = W.put(W.emptyModel(), "e1", { kind: "decision", status: "UNVERIFIED" }).model; // v1
  const a = W.transition(base, "e1", { toStatus: "PROVEN", expectedPreviousVersion: 1, evidence_refs: ["a"], verification_status: "VERIFIED" });
  const b = W.transition(base, "e1", { toStatus: "CONTRADICTED", expectedPreviousVersion: 1, evidence_refs: ["b"], verification_status: "REJECTED" });
  check(a.ok === true && a.item.version === 2, "writer A (from v1) ⇒ OK, v2");
  check(b.ok === true && b.item.version === 2, "writer B (from the SAME base v1) ⇒ OK on its OWN copy (pure, no shared mutation)");
  // The lost-update is detected when B is applied to A's RESULT (the real sequential store):
  const bOnA = W.transition(a.model, "e1", { toStatus: "CONTRADICTED", expectedPreviousVersion: 1 });
  check(bOnA.ok === false && bOnA.decision === "CONFLICT", "B applied after A (stale v1 vs current v2) ⇒ CONFLICT (lost-update prevented)");
}

// Determinism + persistence round-trip.
{
  const seq = () => W.transition(W.put(W.emptyModel(), "e", { kind: "fact", status: "OBSERVED" }).model, "e", { toStatus: "PROVEN", expectedPreviousVersion: 1, evidence_refs: ["x"], verification_status: "VERIFIED" }).model;
  check(JSON.stringify(seq()) === JSON.stringify(seq()), "deterministic: same sequence ⇒ identical model");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wm-"));
  try {
    const file = path.join(dir, "world-model.json");
    const m = seq();
    W.save(file, m);
    const reloaded = W.load(file);
    check(JSON.stringify(reloaded) === JSON.stringify(m), "persistence round-trip: save → load yields the same model");
    check(W.read(reloaded, "e").version === 2 && W.read(reloaded, "e").status === "PROVEN", "reloaded item keeps version + status");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  check(JSON.stringify(W.load(path.join("does", "not", "exist.json"))) === JSON.stringify(W.emptyModel()), "load of a missing file ⇒ empty model (no crash)");
}

// Boundary proofs (the module is self-contained epistemic state).
{
  const src = fs.readFileSync(path.join(__dirname, "..", "dist", "core", "world-model.js"), "utf8");
  check(!/require\(["']\.\/runtime-model["']\)/.test(src), "world-model does NOT import runtime-model (read model is not a canonical source)");
  check(!/require\(["']\.\/mission-lifecycle["']\)/.test(src), "world-model does NOT import mission-lifecycle (governance state is not the item version)");
  check(/require\(["']\.\/state-transition["']\)/.test(src), "world-model REUSES the C03 state-transition validator (one shared discipline)");
}

// ====================== WI-WM-01 EXTENSION ======================

// SIMULATION status + isolation (§28): never auto-promoted to a FACTUAL status without evidence.
{
  check(W.EPISTEMIC_STATUS.includes("SIMULATION"), "SIMULATION added to the epistemic vocabulary");
  check(W.EPISTEMIC_STATUS.length === 9 && W.ITEM_KINDS.length === 10, "exactly 9 statuses (8 historical + SIMULATION), 10 item kinds (unchanged)");
  const base = W.put(W.emptyModel(), "s1", { kind: "hypothesis", status: "SIMULATION", value: { dream: 1 } });
  check(base.ok && base.item.status === "SIMULATION" && base.item.version === 1, "put ⇒ SIMULATION item accepted at v1");
  const promoNoEv = W.transition(base.model, "s1", { toStatus: "PROVEN", expectedPreviousVersion: 1 });
  check(promoNoEv.ok === false && promoNoEv.decision === "REJECTED", "SIMULATION → PROVEN without evidence_refs ⇒ REJECTED (isolation §28)");
  check(W.read(promoNoEv.model, "s1").status === "SIMULATION", "blocked promotion ⇒ ZERO change (stays SIMULATION)");
  const promoNoEvObs = W.transition(base.model, "s1", { toStatus: "OBSERVED", expectedPreviousVersion: 1 });
  check(promoNoEvObs.ok === false, "SIMULATION → OBSERVED without evidence ⇒ REJECTED too");
  const promoEv = W.transition(base.model, "s1", { toStatus: "PROVEN", expectedPreviousVersion: 1, evidence_refs: ["ev-real"], verification_status: "VERIFIED" });
  check(promoEv.ok === true && promoEv.item.status === "PROVEN" && promoEv.item.version === 2, "SIMULATION → PROVEN WITH evidence_refs ⇒ allowed (v1→2)");
  const toNonFactual = W.transition(base.model, "s1", { toStatus: "HYPOTHESIS", expectedPreviousVersion: 1 });
  check(toNonFactual.ok === true, "SIMULATION → non-factual (HYPOTHESIS) without evidence ⇒ allowed");
}

// Entities: create / read / dup / invalid / CAS transition.
{
  const r = W.putEntity(W.emptyModel(), "org:acme", { type: "organization", status: "OBSERVED", value: { name: "ACME" }, provenance: "src-1" });
  check(r.ok && r.entity.type === "organization" && r.entity.version === 1, "putEntity ⇒ entity created at v1 with type + status");
  check(W.readEntity(r.model, "org:acme").provenance === "src-1", "readEntity returns the stored entity (provenance preserved)");
  check(!W.putEntity(r.model, "org:acme", { type: "organization", status: "OBSERVED" }).ok, "duplicate entity id ⇒ REJECTED");
  check(!W.putEntity(W.emptyModel(), "e", { type: "", status: "OBSERVED" }).ok, "entity empty type ⇒ REJECTED");
  check(!W.putEntity(W.emptyModel(), "e", { type: "x", status: "BOGUS" }).ok, "entity invalid status ⇒ REJECTED");
  const t = W.transitionEntity(r.model, "org:acme", { toStatus: "PROVEN", expectedPreviousVersion: 1, evidence_refs: ["e"], verification_status: "VERIFIED" });
  check(t.ok && t.entity.version === 2 && t.entity.status === "PROVEN", "transitionEntity (CAS match) ⇒ v1→2");
  const stale = W.transitionEntity(t.model, "org:acme", { toStatus: "STALE", expectedPreviousVersion: 1 });
  check(stale.ok === false && stale.decision === "CONFLICT", "entity stale CAS ⇒ CONFLICT (zero change)");
}

// Relations: referential integrity (fail-closed), dup, invalid, CAS transition.
{
  let m = W.putEntity(W.emptyModel(), "a", { type: "module", status: "OBSERVED" }).model;
  m = W.putEntity(m, "b", { type: "module", status: "OBSERVED" }).model;
  const link = W.linkRelation(m, "a->b", { from: "a", to: "b", type: "depends_on", status: "OBSERVED" });
  check(link.ok && link.relation.from === "a" && link.relation.to === "b" && link.relation.version === 1, "linkRelation ⇒ directed edge created at v1");
  check(!W.linkRelation(m, "x", { from: "a", to: "ghost", type: "depends_on", status: "OBSERVED" }).ok, "relation to a MISSING 'to' entity ⇒ REJECTED (referential integrity)");
  check(!W.linkRelation(m, "x", { from: "ghost", to: "b", type: "depends_on", status: "OBSERVED" }).ok, "relation from a MISSING 'from' entity ⇒ REJECTED (referential integrity)");
  check(!W.linkRelation(link.model, "a->b", { from: "a", to: "b", type: "depends_on", status: "OBSERVED" }).ok, "duplicate relation id ⇒ REJECTED");
  check(!W.linkRelation(m, "y", { from: "a", to: "b", type: "", status: "OBSERVED" }).ok, "relation empty type ⇒ REJECTED");
  const t = W.transitionRelation(link.model, "a->b", { toStatus: "PROVEN", expectedPreviousVersion: 1, evidence_refs: ["e"], verification_status: "VERIFIED" });
  check(t.ok && t.relation.version === 2 && t.relation.status === "PROVEN", "transitionRelation (CAS match) ⇒ v1→2, endpoints preserved");
  check(t.relation.from === "a" && t.relation.to === "b", "relation transition preserves from/to/type");
}

// put/transition on ITEMS preserve entities & relations (regression: freezeModel carries all three maps).
{
  let m = W.putEntity(W.emptyModel(), "ent1", { type: "module", status: "OBSERVED" }).model;
  m = W.put(m, "it1", { kind: "fact", status: "OBSERVED" }).model;
  check(W.readEntity(m, "ent1") !== null && W.read(m, "it1") !== null, "put item does NOT erase a pre-existing entity (maps coexist)");
  const t = W.transition(m, "it1", { toStatus: "PROVEN", expectedPreviousVersion: 1, evidence_refs: ["e"], verification_status: "VERIFIED" });
  check(W.readEntity(t.model, "ent1") !== null, "item transition preserves entities");
}

// snapshot: ADDITIVE graph fields; existing item fields unchanged.
{
  let m = W.put(W.emptyModel(), "i1", { kind: "fact", status: "OBSERVED" }).model;
  m = W.putEntity(m, "e1", { type: "service", status: "SIMULATION" }).model;
  m = W.putEntity(m, "e2", { type: "service", status: "OBSERVED" }).model;
  m = W.linkRelation(m, "r1", { from: "e1", to: "e2", type: "calls", status: "OBSERVED" }).model;
  const s = W.snapshot(m);
  check(s.total === 1 && s.byStatus.OBSERVED === 1 && s.byKind.fact === 1, "snapshot ITEM fields (total/byStatus/byKind) unchanged");
  check(s.entityTotal === 2 && s.entitiesByType.service === 2 && s.entitiesByStatus.SIMULATION === 1, "snapshot entity fields (entityTotal/byType/byStatus) correct");
  check(s.relationTotal === 1 && s.relationsByType.calls === 1 && s.relationsByStatus.OBSERVED === 1, "snapshot relation fields correct");
}

// Determinism + persistence round-trip across all THREE maps.
{
  const seq = () => {
    let m = W.put(W.emptyModel(), "i", { kind: "fact", status: "OBSERVED" }).model;
    m = W.putEntity(m, "a", { type: "m", status: "OBSERVED" }).model;
    m = W.putEntity(m, "b", { type: "m", status: "OBSERVED" }).model;
    m = W.linkRelation(m, "a->b", { from: "a", to: "b", type: "dep", status: "OBSERVED" }).model;
    return m;
  };
  check(JSON.stringify(seq()) === JSON.stringify(seq()), "deterministic graph: same sequence ⇒ identical model");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wmg-"));
  try {
    const file = path.join(dir, "world-model.json");
    const m = seq();
    W.save(file, m);
    const reloaded = W.load(file);
    check(JSON.stringify(reloaded) === JSON.stringify(m), "graph round-trip: save → load yields the same model (items+entities+relations)");
    check(W.readEntity(reloaded, "a") !== null && W.readRelation(reloaded, "a->b") !== null, "reloaded graph keeps entities + relations");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  check(JSON.stringify(W.load(path.join("no", "such.json"))) === JSON.stringify(W.emptyModel()), "load of a missing file ⇒ empty model with all three maps (no crash)");
}

console.log(failures === 0 ? "ALL PASS — V5 §387 WORLD MODEL" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
