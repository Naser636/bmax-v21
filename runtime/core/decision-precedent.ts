#!/usr/bin/env node
"use strict";

/*
 * DECISION-PRECEDENT STORE (§V G9 — read-only reuse) — TypeScript port; parity with decision-precedent.js.
 *
 * Closes the structural G9 gap: `patch-memory` can only store/reuse FILE-EDIT patches (its `record()` hard-
 * requires a non-empty `edits[]`), so strictly read-only missions — which apply no patch — had NO reusable
 * learning substrate. This module stores a NON-PATCH precedent: a DECISION / CLASSIFICATION derived from an
 * accepted, evidence-backed mission, keyed by the SAME `patch-memory.signature()` (goal-normalized ⇒ cross-
 * mission reuse). Reuse here NEVER replays a file patch and NEVER mutates a mission's target data — it only
 * attaches a decision to an objective (runtime-owned reasoning), so it is safe for read-only missions.
 *
 * DISCIPLINE (mirrors patch-memory / deny-by-default):
 *   - record requires a non-empty `decision` (deny-by-default; emptiness is never a precedent).
 *   - idempotent by signature; preserves reuseCount, capturedAt and provenance (authoredBy preserved-never-
 *     downgraded; explicit > prior > "UNKNOWN").
 *   - every precedent carries PROVENANCE: sourceMission, sourceEvidence, capturedAt, version, applicability,
 *     limitations — so a future reader can judge applicability and trace it back to real evidence.
 *
 * PURE: no fs / clock / network (the store object + capturedAt are injected by the caller). A library of pure
 * functions — requiring it launches nothing; it creates no new orchestrator, scheduler or permanent primitive.
 * It is NOT wired into the live decision-engine stage (that is a separate, gated boundary).
 */

const { signature } = require("./patch-memory.js");

const NAME = "decision-precedent";
const AUTHOR_UNKNOWN = "UNKNOWN";

function isPlainObject(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function hasDecision(v: any): boolean { return nonEmptyString(v) || (isPlainObject(v) && Object.keys(v).length > 0) || (Array.isArray(v) && v.length > 0); }

function emptyStore(): any { return { version: 1, entries: {} }; }
function ensureStore(store: any): any { return isPlainObject(store) && isPlainObject(store.entries) ? store : emptyStore(); }

// Record a DECISION precedent that was accepted. Idempotent by signature; preserves reuseCount/capturedAt and
// never downgrades provenance. Throws on an empty decision (deny-by-default — a precedent must carry content).
function recordPrecedent(store: any, entry: any): any {
  const s = ensureStore(store);
  if (!isPlainObject(entry) || !hasDecision(entry.decision)) {
    throw new Error("decision-precedent.record: a non-empty `decision` is required (deny-by-default)");
  }
  const sig = nonEmptyString(entry.signature) ? entry.signature : signature(entry.task || entry);
  const prior = s.entries[sig];
  const authoredBy = nonEmptyString(entry.authoredBy) ? entry.authoredBy
    : (prior && nonEmptyString(prior.authoredBy) ? prior.authoredBy : AUTHOR_UNKNOWN);
  s.entries[sig] = {
    signature: sig,
    sourceMission: entry.sourceMission != null ? entry.sourceMission : (prior ? prior.sourceMission : null),
    sourceEvidence: entry.sourceEvidence != null ? entry.sourceEvidence : (prior ? prior.sourceEvidence : null),
    capturedAt: prior && prior.capturedAt ? prior.capturedAt : (entry.capturedAt || null),
    version: entry.version != null ? entry.version : (prior ? prior.version : 1),
    decision: entry.decision,
    applicability: entry.applicability != null ? entry.applicability : (prior ? prior.applicability : null),
    limitations: entry.limitations != null ? entry.limitations : (prior ? prior.limitations : null),
    authoredBy,
    reuseCount: prior && Number.isFinite(prior.reuseCount) ? prior.reuseCount : 0,
  };
  return s.entries[sig];
}

// Pure retrieval — returns the FULL stored precedent (incl. provenance) or null. No mutation.
function recallPrecedent(store: any, task: any): any {
  const s = ensureStore(store);
  const sig = signature(task);
  return s.entries[sig] || null;
}

// Pure application — attach the precedent's decision to a COPY of the objective. NO file write, NO target
// mutation, NO input mutation. Returns { ...objective, decision, resolvedBy:"PRECEDENT", precedentSignature }.
function applyPrecedent(objective: any, precedent: any): any {
  if (!isPlainObject(objective) || !isPlainObject(precedent) || !hasDecision(precedent.decision)) return objective;
  return { ...objective, decision: precedent.decision, resolvedBy: "PRECEDENT", precedentSignature: precedent.signature };
}

// Reuse accounting — increments reuseCount for the matching precedent; returns the new count (0 on miss).
// Mirrors patch-memory.hit: this is the ONLY mutating reuse op.
function reusePrecedent(store: any, task: any): number {
  const s = ensureStore(store);
  const sig = signature(task);
  const e = s.entries[sig];
  if (!e) return 0;
  e.reuseCount = (Number.isFinite(e.reuseCount) ? e.reuseCount : 0) + 1;
  return e.reuseCount;
}

function summarizeReuse(store: any): any {
  const s = ensureStore(store);
  const list: any[] = Object.values(s.entries);
  return {
    total: list.length,
    reused: list.filter((e) => Number.isFinite(e.reuseCount) && e.reuseCount > 0).length,
    totalReuse: list.reduce((n, e) => n + (Number.isFinite(e.reuseCount) ? e.reuseCount : 0), 0),
  };
}

export {};
module.exports = { NAME, signature, emptyStore, recordPrecedent, recallPrecedent, applyPrecedent, reusePrecedent, summarizeReuse };

// Read-only CLI: print the store model; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "decision-precedent/1", name: NAME }, null, 2) + "\n");
}
