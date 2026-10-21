#!/usr/bin/env node
"use strict";

/*
 * DECISION-PRECEDENT STORE (§V G9 — read-only reuse) — ODG_RUNTIME=js rollback twin of decision-precedent.ts;
 * parity-maintained. Stores a NON-PATCH decision/classification precedent (keyed by patch-memory.signature so
 * reuse is cross-mission and goal-normalized). Reuse NEVER replays a file patch and NEVER mutates target data
 * (decision payload only) ⇒ safe for strictly read-only missions. PURE (store + capturedAt injected); no fs/
 * clock/network; no top-level execution; not wired into the live decision-engine stage (separate gated boundary).
 */

const { signature } = require("./patch-memory.js");

const NAME = "decision-precedent";
const AUTHOR_UNKNOWN = "UNKNOWN";

function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
function hasDecision(v) { return nonEmptyString(v) || (isPlainObject(v) && Object.keys(v).length > 0) || (Array.isArray(v) && v.length > 0); }

function emptyStore() { return { version: 1, entries: {} }; }
function ensureStore(store) { return isPlainObject(store) && isPlainObject(store.entries) ? store : emptyStore(); }

function recordPrecedent(store, entry) {
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

function recallPrecedent(store, task) {
  const s = ensureStore(store);
  const sig = signature(task);
  return s.entries[sig] || null;
}

function applyPrecedent(objective, precedent) {
  if (!isPlainObject(objective) || !isPlainObject(precedent) || !hasDecision(precedent.decision)) return objective;
  return { ...objective, decision: precedent.decision, resolvedBy: "PRECEDENT", precedentSignature: precedent.signature };
}

function reusePrecedent(store, task) {
  const s = ensureStore(store);
  const sig = signature(task);
  const e = s.entries[sig];
  if (!e) return 0;
  e.reuseCount = (Number.isFinite(e.reuseCount) ? e.reuseCount : 0) + 1;
  return e.reuseCount;
}

function summarizeReuse(store) {
  const s = ensureStore(store);
  const list = Object.values(s.entries);
  return {
    total: list.length,
    reused: list.filter((e) => Number.isFinite(e.reuseCount) && e.reuseCount > 0).length,
    totalReuse: list.reduce((n, e) => n + (Number.isFinite(e.reuseCount) ? e.reuseCount : 0), 0),
  };
}

module.exports = { NAME, signature, emptyStore, recordPrecedent, recallPrecedent, applyPrecedent, reusePrecedent, summarizeReuse };

if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "decision-precedent/1", name: NAME }, null, 2) + "\n");
}
