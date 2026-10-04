#!/usr/bin/env node
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
  const src = fs.readFileSync(path.join(__dirname, "world-model.js"), "utf8");
  check(!/require\(["']\.\/runtime-model["']\)/.test(src), "world-model does NOT import runtime-model (read model is not a canonical source)");
  check(!/require\(["']\.\/mission-lifecycle["']\)/.test(src), "world-model does NOT import mission-lifecycle (governance state is not the item version)");
  check(/require\(["']\.\/state-transition["']\)/.test(src), "world-model REUSES the C03 state-transition validator (one shared discipline)");
}

console.log(failures === 0 ? "ALL PASS — V5 §387 WORLD MODEL" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
