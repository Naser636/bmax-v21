#!/usr/bin/env node
"use strict";

/*
 * WI-LOOP-09 — COGNITIVE LOOP cycle manager (§16). PURE, deterministic STATE MACHINE over a cycle record;
 * it ORCHESTRATES/RECORDS the 12-stage cognitive cycle and preserves per-cycle context, but EXECUTES nothing
 * (the ALLOCATE/EXECUTE stages record INTENT; real effects stay with the gated Executor — this is not a second
 * executor). Stage order is enforced (fail-closed); context arrays are APPEND-ONLY so a resumed/interrupted
 * cycle never loses validated decisions or evidence (§16). Version is compare-and-set. No clock/random.
 * Dual export (CJS + ESM export {}) mirroring world-model/causal-graph/memory-taxonomy.
 */

const STAGES = Object.freeze([
  "PERCEIVE", "UNDERSTAND", "RETRIEVE", "DISCOVER", "REASON", "PLAN",
  "ALLOCATE", "EXECUTE", "VERIFY", "DECIDE", "LEARN", "IMPROVE",
]);
// Append-only context fields preserved across the whole cycle (§16).
const FIELDS = Object.freeze([
  "observations", "knowledge", "hypotheses", "decisions", "actions", "results", "evidence", "errors", "learnings",
]);
const DECISION = Object.freeze({ OK: "OK", CONFLICT: "CONFLICT", REJECTED: "REJECTED" });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function freezeArrays(o: any): any { for (const f of FIELDS) o[f] = Object.freeze((o[f] || []).slice()); return o; }

// The stage that legitimately follows `stage` (IMPROVE wraps to PERCEIVE = a new iteration).
function nextStage(stage: any): any {
  const i = STAGES.indexOf(stage);
  if (i < 0) return null;
  return i === STAGES.length - 1 ? "PERCEIVE" : STAGES[i + 1];
}

function ok(cycle: any): any { return Object.freeze({ ok: true, decision: DECISION.OK, cycle }); }
function fail(cycle: any, decision: any, error: any): any { return Object.freeze({ ok: false, decision, error, cycle }); }

/** startCycle(objective, meta?) -> a frozen cycle at stage PERCEIVE, iteration 1, version 1. */
function startCycle(objective: any, meta?: any): any {
  if (!isNonEmptyString(objective)) throw new Error("startCycle: objective (non-empty string) required");
  const m = isObj(meta) ? meta : {};
  const c: any = {
    cycleId: isNonEmptyString(m.cycleId) ? m.cycleId : null,
    iteration: 1, stage: "PERCEIVE", version: 1,
    objective, context: m.context === undefined ? null : m.context, nextAction: null,
  };
  for (const f of FIELDS) c[f] = [];
  return Object.freeze(freezeArrays(c));
}

/**
 * advance(cycle, change) -> { ok, decision, cycle }. change: { toStage, expectedVersion, append?, nextAction? }.
 * COMPARE-AND-SET on version; toStage MUST be nextStage(current) (fail-closed on out-of-order); context arrays
 * are APPEND-ONLY (prior entries never dropped); IMPROVE→PERCEIVE bumps iteration.
 */
function advance(cycle: any, change: any): any {
  if (!isObj(cycle) || STAGES.indexOf(cycle.stage) < 0) return fail(cycle, DECISION.REJECTED, "advance: not a cycle");
  const c = isObj(change) ? change : {};
  if (typeof c.expectedVersion !== "number" || c.expectedVersion !== cycle.version) {
    return fail(cycle, DECISION.CONFLICT, `advance: compare-and-set failed (expected ${c.expectedVersion} != ${cycle.version})`);
  }
  const expected = nextStage(cycle.stage);
  if (c.toStage !== expected) {
    return fail(cycle, DECISION.REJECTED, `advance: out-of-order — from ${cycle.stage} the only next stage is ${expected} (got ${c.toStage})`);
  }
  const wrapped = cycle.stage === "IMPROVE" && c.toStage === "PERCEIVE";
  const next: any = {
    cycleId: cycle.cycleId,
    iteration: cycle.iteration + (wrapped ? 1 : 0),
    stage: c.toStage, version: cycle.version + 1,
    objective: cycle.objective, context: cycle.context,
    nextAction: c.nextAction === undefined ? cycle.nextAction : c.nextAction,
  };
  const ap = isObj(c.append) ? c.append : {};
  for (const f of FIELDS) next[f] = arr(cycle[f]).concat(arr(ap[f])); // APPEND-ONLY
  return ok(Object.freeze(freezeArrays(next)));
}

/** snapshot(cycle) -> frozen read view: stage/iteration/version + per-field counts. Pure. */
function snapshot(cycle: any): any {
  if (!isObj(cycle)) return Object.freeze({ ok: false });
  const counts: any = {};
  for (const f of FIELDS) counts[f] = arr(cycle[f]).length;
  return Object.freeze({
    cycleId: cycle.cycleId || null, stage: cycle.stage, iteration: cycle.iteration, version: cycle.version,
    objective: cycle.objective, nextAction: cycle.nextAction || null, counts: Object.freeze(counts),
  });
}

/** isResumable(cycle) -> true if the record is a well-formed cycle that can be continued without loss. */
function isResumable(cycle: any): boolean {
  return isObj(cycle) && STAGES.indexOf(cycle.stage) >= 0 && typeof cycle.version === "number" && isNonEmptyString(cycle.objective);
}

const COGNITIVE_LOOP_CONTRACT = Object.freeze({
  id: "WI-LOOP-09-COGNITIVE-LOOP",
  source: "FICHE §16 (PERCEIVE→…→IMPROVE cognitive loop; interrupted cycle resumes without losing validated work)",
  stages: STAGES,
  fields: FIELDS,
  notAuthority: "orchestration/record state-machine; EXECUTES nothing (ALLOCATE/EXECUTE record intent; real effects stay with the gated Executor)",
  invariants: Object.freeze([
    "pure/deterministic: cycle + change in → new cycle out; no clock/random",
    "stage order enforced: advance only to nextStage(current); IMPROVE wraps to PERCEIVE (new iteration)",
    "version is compare-and-set (expectedVersion must match)",
    "context fields are APPEND-ONLY ⇒ a resumed cycle never loses prior decisions/evidence (§16)",
    "records intent; does not execute — not a second Executor",
  ]),
});

module.exports = {
  STAGES, FIELDS, DECISION, COGNITIVE_LOOP_CONTRACT,
  nextStage, startCycle, advance, snapshot, isResumable,
};

if (require.main === module) {
  process.stdout.write(JSON.stringify(COGNITIVE_LOOP_CONTRACT, null, 2) + "\n");
}

export {};
