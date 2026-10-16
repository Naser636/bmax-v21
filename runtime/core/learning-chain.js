#!/usr/bin/env node
"use strict";

/*
 * LEARNING-CHAIN STATE MODEL (§V S2) — makes the doctrine's five learning states OBSERVABLE and
 * machine-checkable instead of merely asserted in prose per commit.
 *
 * The §V doctrine defines an ordered learning chain:
 *   CAPTURED → PERSISTED → DISCOVERABLE → REUSED → EFFECTIVE
 * Until now each improvement CLAIMED a state in its commit/roadmap text; nothing verified the claim. This
 * pure model classifies a learning RECORD by the EVIDENCE it actually carries, so a claim of EFFECTIVE that
 * lacks a measured before/after is DOWNGRADED, never accepted.
 *
 * TWO HARD RULES (mirroring the runtime's deny-by-default discipline):
 *   1. CONTIGUITY — a state is "reached" ONLY if its own evidence is present AND every earlier state is
 *      reached. A gap (e.g. REUSED evidence but no PERSISTED ref) caps the chain at the last contiguous
 *      state; later evidence is recorded as `ahead` but NEVER counts as progress past the gap.
 *   2. NO FABRICATED EFFECT — EFFECTIVE requires a real measurement: a baseline AND an after that DIFFER
 *      (or an explicit measured delta). A bare `effective:true` / equal baseline==after is NOT effective.
 *
 * Pure: no fs/clock/network. A read-model over a learning record; creates no store/writer/primitive.
 */

const STATES = Object.freeze(["CAPTURED", "PERSISTED", "DISCOVERABLE", "REUSED", "EFFECTIVE"]);

function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
function nonEmptyArray(v) { return Array.isArray(v) && v.length > 0; }

// Per-state evidence predicates — each answers "does this record carry PROOF of this state?" (not a claim).
// A record may present evidence as a nested object or a few tolerated shorthands; emptiness is never proof.
const EVIDENCE = Object.freeze({
  // CAPTURED: the learning is written down — a non-empty description/cause of what was learned.
  CAPTURED(r) {
    const c = r.captured;
    if (nonEmptyString(c)) return true;
    return isPlainObject(c) && (nonEmptyString(c.description) || nonEmptyString(c.cause) || nonEmptyString(c.fact));
  },
  // PERSISTED: it lives in a durable, named location (memory file / roadmap anchor / commit / record id).
  PERSISTED(r) {
    const p = r.persisted;
    if (nonEmptyString(p)) return true;
    return isPlainObject(p) && (nonEmptyString(p.ref) || nonEmptyString(p.file) || nonEmptyString(p.commit) || nonEmptyString(p.id));
  },
  // DISCOVERABLE: it is indexed/linked so a future reader can FIND it (index entry / link / anchor).
  DISCOVERABLE(r) {
    const d = r.discoverable;
    if (nonEmptyString(d)) return true;
    return isPlainObject(d) && (nonEmptyString(d.index) || nonEmptyString(d.anchor) || nonEmptyArray(d.links));
  },
  // REUSED: there is ACTUAL reuse evidence — one or more concrete consumers/call-sites/runs, or a count>0.
  REUSED(r) {
    const u = r.reused;
    if (isPlainObject(u)) {
      if (nonEmptyArray(u.refs) || nonEmptyArray(u.consumers)) return true;
      if (Number.isFinite(u.count) && u.count > 0) return true;
    }
    return false;
  },
  // EFFECTIVE: a REAL measured effect — a baseline AND an after that DIFFER, or an explicit non-zero delta.
  // A bare boolean / equal baseline==after / missing measurement is NOT effective (no fabricated effect).
  EFFECTIVE(r) {
    const e = r.effective;
    if (!isPlainObject(e)) return false;
    if (Number.isFinite(e.delta)) return e.delta !== 0;
    const has = Object.prototype.hasOwnProperty.call(e, "baseline") && Object.prototype.hasOwnProperty.call(e, "after");
    if (!has) return false;
    // A measurement is present; it is effective only if it actually CHANGED (deep-unequal baseline vs after).
    return JSON.stringify(e.baseline) !== JSON.stringify(e.after);
  },
});

/**
 * classifyLearningState(record) -> {
 *   state,            // the highest CONTIGUOUS state reached (or null if not even CAPTURED)
 *   reached,          // { CAPTURED, PERSISTED, DISCOVERABLE, REUSED, EFFECTIVE } booleans (contiguous)
 *   evidencePresent,  // per-state RAW evidence presence (before the contiguity rule)
 *   missing,          // the next state whose evidence is absent (the gap to advance), or null if EFFECTIVE
 *   ahead,            // states whose evidence IS present but sit BEYOND a contiguity gap (claimed, not counted)
 *   complete,         // true iff EFFECTIVE reached (the full chain is proven)
 *   reason,
 * }
 * Pure + deny-by-default: a missing/unevidenced state caps the chain; a later evidenced state never jumps it.
 */
function classifyLearningState(record) {
  const r = isPlainObject(record) ? record : {};
  const evidencePresent = {};
  for (const s of STATES) evidencePresent[s] = EVIDENCE[s](r) === true;

  const reached = {};
  let broke = false;
  let highest = null;
  for (const s of STATES) {
    const ok = !broke && evidencePresent[s];
    reached[s] = ok;
    if (ok) highest = s;
    else broke = true; // CONTIGUITY: once a state is unproven, no later state can be "reached".
  }

  // states whose evidence is present but fall beyond the contiguity gap (a CLAIM not yet counted as progress).
  const ahead = STATES.filter((s) => evidencePresent[s] && !reached[s]);
  const missing = STATES.find((s) => !reached[s]) || null;
  const complete = reached.EFFECTIVE === true;

  let reason;
  if (highest === null) reason = "UNTRACKED: no CAPTURED evidence (no description/cause recorded)";
  else if (complete) reason = "EFFECTIVE: full learning chain proven (measured before/after effect)";
  else reason = `${highest}: next state ${missing} is unproven` + (ahead.length ? ` (evidence present but gated behind the gap: ${ahead.join(", ")})` : "");

  return { state: highest, reached, evidencePresent, missing, ahead, complete, reason };
}

// Summarize a set of learning records — how far the portfolio of learnings has actually progressed.
function summarizeChain(records) {
  const list = Array.isArray(records) ? records : [];
  const classified = list.map((r) => ({ id: isPlainObject(r) && nonEmptyString(r.id) ? r.id : null, ...classifyLearningState(r) }));
  const byState = {};
  for (const s of [...STATES, "UNTRACKED"]) byState[s] = 0;
  for (const c of classified) byState[c.state || "UNTRACKED"] += 1;
  return { total: classified.length, byState, effective: classified.filter((c) => c.complete).length, classified };
}

module.exports = { STATES, EVIDENCE, classifyLearningState, summarizeChain };

// Read-only CLI: print the state model (the ordered chain + evidence contract); mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "learning-chain/1", states: STATES }, null, 2) + "\n");
}
