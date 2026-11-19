#!/usr/bin/env node

/*
 * P1 — Patch / Solution Memory (TypeScript port; parity with runtime/core/patch-memory.js).
 *
 * DON'T ASK AI FIRST: look up a patch already APPLIED for the same problem signature and replay it.
 * Storage: autonomy-store "patch-memory" (already TS, co-located in dist; deps=1). Strict port: the
 * public exports (signature, record, lookup, recall, hit, list, NAME), the deterministic signature
 * (rootCause | normalized-goal(fallback objectiveId) | target), the record idempotency (reuseCount +
 * learnedAt preservation), the authoredBy provenance precedence (explicit > prior > UNKNOWN), and the
 * lookup/hit/recall/list semantics are preserved EXACTLY. record() keeps its real new Date().toISOString()
 * learnedAt. The historical .js remains the behavioural reference; many consumers depend on this API.
 */

"use strict";

const store = require("./autonomy-store");
const reuseValidity = require("./odg-reuse-validity-gate.js"); // V324 §6.3 — FORWARD pre-reuse validity (additive)

const NAME = "patch-memory";

function emptyDB(): any {
  return { version: 1, entries: {} };
}

function norm(value: any): string {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ").toLowerCase();
}

function problemKey(task: any): string {
  return norm(task && task.goal) || norm(task && task.objectiveId);
}

function signature(task: any): string {
  if (typeof task === "string") return task;
  return [norm(task && task.rootCause), problemKey(task), norm(task && task.target)].join("|");
}

// Record a solution that WORKED. Idempotent by signature: re-recording updates the entry and preserves
// the reuse counter.
function record(entry: any): any {
  if (!entry || !Array.isArray(entry.edits) || entry.edits.length === 0) {
    throw new Error("patch-memory.record requires non-empty edits");
  }
  const sig = entry.signature || signature(entry);
  const db = store.read(NAME, emptyDB());
  const prior = db.entries[sig];
  // ORIGINAL-AUTHOR PROVENANCE (CTO Phase-03): APPLIED-by-ODG is not CREATED-by-ODG. Preserved, never
  // upgraded: an explicit proven authoredBy wins; else the prior stored value; else UNKNOWN.
  const authoredBy =
    (typeof entry.authoredBy === "string" && entry.authoredBy) ? entry.authoredBy
      : (prior && typeof prior.authoredBy === "string" && prior.authoredBy) ? prior.authoredBy
        : "UNKNOWN";
  db.entries[sig] = {
    signature: sig,
    mission: entry.mission || (prior && prior.mission) || null,
    authoredBy,
    edits: entry.edits,
    reuseCount: prior ? prior.reuseCount : 0,
    learnedAt: prior ? prior.learnedAt : new Date().toISOString(),
  };
  store.write(NAME, db);
  return db.entries[sig];
}

// Look up a known solution WITHOUT mutating. Returns the stored edits or null (a miss ⇒ next tier).
function lookup(task: any): any {
  const sig = typeof task === "string" ? task : signature(task);
  const db = store.read(NAME, emptyDB());
  const hitEntry = db.entries[sig];
  return hitEntry ? hitEntry.edits : null;
}

// Mark a stored solution as reused (metrics / learning signal).
function hit(task: any): number {
  const sig = typeof task === "string" ? task : signature(task);
  const db = store.read(NAME, emptyDB());
  if (!db.entries[sig]) return 0;
  db.entries[sig].reuseCount += 1;
  store.write(NAME, db);
  return db.entries[sig].reuseCount;
}

function list(): any {
  return Object.values(store.read(NAME, emptyDB()).entries);
}

// Recall the FULL stored record (including retained provenance) WITHOUT mutating. Returns the entry or
// null. A historical entry with no authoredBy ⇒ the caller MUST treat it as UNKNOWN (never requalify).
function recall(task: any): any {
  const sig = typeof task === "string" ? task : signature(task);
  const db = store.read(NAME, emptyDB());
  return db.entries[sig] || null;
}

// (V324 §6.3, ADDITIVE — lookup/recall UNCHANGED) lookupFresh(task, signals): recall the full record and run the
// FORWARD pre-reuse validity gate over it (odg-reuse-validity-gate), so "remembered" is not treated as "valid today".
// Returns null on a miss; else { signature, edits, learnedAt, authoredBy, validity, reusableAsProven }.
// reusableAsProven is true ONLY when the gate returns REUSABLE_AS_PROVEN (fresh + provenanced + drift-checked clean +
// not suppressed). With no freshness signals supplied ⇒ REQUIRES_REVALIDATION (fail-closed) ⇒ reusableAsProven false.
// signals: { asOfMs, changedPaths?, maxAgeDays?, suppressed?, dependencyDrift? } — forwarded to the gate.
function lookupFresh(task: any, signals: any): any {
  const rec = recall(task);
  if (!rec) return null;
  const validity = reuseValidity.classifyReuseValidity(rec, signals || {});
  return Object.freeze({
    signature: rec.signature,
    edits: rec.edits,
    learnedAt: rec.learnedAt,
    authoredBy: rec.authoredBy,
    validity,
    reusableAsProven: validity.ok === true && validity.verdict === "REUSABLE_AS_PROVEN",
  });
}

module.exports = { signature, record, lookup, recall, hit, list, lookupFresh, NAME };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names (emptyDB, norm,
// problemKey) are module-scoped, not global script scope (prevents cross-lot TS2393). API unchanged.
export {};
