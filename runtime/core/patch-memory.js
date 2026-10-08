#!/usr/bin/env node

/*
 * P1 — Patch / Solution Memory.
 *
 * Embodies DON'T ASK AI FIRST: before any external escalation, the Runtime looks up a patch it has
 * already APPLIED for the same problem signature and replays it. Reuses the existing Mission Ledger
 * + patch-execution.json shape (edits carry {target, content|diff}) and the Root Cause Engine's
 * classification as the signature key. No new patch format is invented.
 *
 * Storage: autonomy-store "patch-memory" (git-ignored runtime state).
 */

"use strict";

const store = require("./autonomy-store");

const NAME = "patch-memory";

function emptyDB() {
    return { version: 1, entries: {} };
}

/*
 * A stable signature for a problem. Derived from the fields the Runtime already has at decision
 * time — root cause (from Root Cause Engine), the PROBLEM identity, and the target file — so the same
 * recurring problem always maps to the same key. Pure function ⇒ deterministic.
 *
 * INTER-MISSION REUSE (fix): the problem identity is the normalized GOAL, NOT the objective id. An
 * objective id is mission-specific (missions label objectives `<MISSION>_<n>`), so keying on it made a
 * solution proven under mission A unreachable from mission B even for the identical problem. The goal
 * text is the stable, mission-independent identity of "the same problem", so a validated solution is now
 * reusable across different missions. objectiveId remains only a fallback for older callers that carry
 * no goal. Whitespace is collapsed and case folded so trivially-different phrasings of the same goal map
 * to the same key. The target stays part of the key for callers that supply it symmetrically on both the
 * record and the lookup side; the live record/lookup paths leave it empty (the decision-time lookup has
 * no target), keeping those two sides symmetric so a real precedent is actually found.
 */
function norm(value) {
    return String(value == null ? "" : value).trim().replace(/\s+/g, " ").toLowerCase();
}

function problemKey(task) {
    return norm(task && task.goal) || norm(task && task.objectiveId);
}

function signature(task) {
    if (typeof task === "string") return task;
    return [norm(task && task.rootCause), problemKey(task), norm(task && task.target)].join("|");
}

// Record a solution that WORKED (edits that were APPLIED + validated). Idempotent by signature:
// re-recording the same signature updates the entry and preserves the reuse counter.
function record(entry) {
    if (!entry || !Array.isArray(entry.edits) || entry.edits.length === 0) {
        throw new Error("patch-memory.record requires non-empty edits");
    }
    const sig = entry.signature || signature(entry);
    const db = store.read(NAME, emptyDB());
    const prior = db.entries[sig];
    db.entries[sig] = {
        signature: sig,
        mission: entry.mission || (prior && prior.mission) || null,
        edits: entry.edits,
        reuseCount: prior ? prior.reuseCount : 0,
        learnedAt: prior ? prior.learnedAt : new Date().toISOString(),
    };
    store.write(NAME, db);
    return db.entries[sig];
}

// Look up a known solution WITHOUT mutating. Returns the stored edits or null (a miss => the caller
// falls through to the next tier: rules, fixers, tests, local LLM, then external AI).
function lookup(task) {
    const sig = typeof task === "string" ? task : signature(task);
    const db = store.read(NAME, emptyDB());
    const hit = db.entries[sig];
    return hit ? hit.edits : null;
}

// Mark a stored solution as reused (metrics / learning signal).
function hit(task) {
    const sig = typeof task === "string" ? task : signature(task);
    const db = store.read(NAME, emptyDB());
    if (!db.entries[sig]) return 0;
    db.entries[sig].reuseCount += 1;
    store.write(NAME, db);
    return db.entries[sig].reuseCount;
}

function list() {
    return Object.values(store.read(NAME, emptyDB()).entries);
}

module.exports = { signature, record, lookup, hit, list, NAME };
