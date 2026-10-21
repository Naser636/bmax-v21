#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx; migration-debt pragma (not strict typing).
"use strict";

/*
 * DECISION-PRECEDENT — G9 read-only reuse proof (CAPTURED → PERSISTED → RETRIEVED → APPLIED → EFFECTIVE).
 *
 * Mirrors the learning-effective-ab design but for a NON-PATCH decision precedent: a CONTROLLED A/B over a
 * single read-only "decision" step, built from existing mechanisms (decision-precedent + the REAL
 * improvement-baseline.measureDelta + the REAL learning-chain.classifyLearningState). The ONLY independent
 * variable between the two arms is the seeded precedent for the SAME objective goal/signature:
 *   - Arm A (CONTROL / miss): empty store ⇒ recall null ⇒ the objective is UNRESOLVED ⇒ escalate.
 *   - Arm B (TREATMENT / hit): store seeded with the precedent captured from an accepted mission ⇒ recall hit
 *     ⇒ applyPrecedent resolves the objective locally ⇒ reuseCount 0→1.
 * So the measured improvement is attributable to REUSE, not correlated drift. EFFECTIVE is graded by
 * learning-chain, which REFUSES a flat/fabricated effect (baseline == after ⇒ not EFFECTIVE). No file patch is
 * replayed and no target data is mutated: a precedent only attaches a decision to a copy of the objective.
 *
 * Provenance is REAL: the seeded precedent is derived from the accepted, evidence-backed mission
 * FORMALIZE_SCHEDULER_IDLE_OBSERVABILITY_DELTA (commit 18768c1) — the diagnostic conclusion that a canary tick
 * whose allowlisted missions are all ledger-proven IDLEs by dedup is an EXPECTED steady state, not a defect.
 */

const assert = require("assert");
const dp = require("./decision-precedent.js");
const { measureDelta } = require("./improvement-baseline.js");
const { classifyLearningState } = require("./learning-chain.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

console.log("decision-precedent — G9 read-only reuse proof");

// A real, read-only decision stage: recall a precedent for the objective; if found, APPLY it (resolve locally)
// and account the reuse; else the objective is unresolved and must escalate. NO file write, NO target mutation.
function resolveReadOnly(objective, store) {
  const rec = dp.recallPrecedent(store, objective);
  if (rec) {
    const resolved = dp.applyPrecedent(objective, rec);
    dp.reusePrecedent(store, objective);
    return { resolved, escalate: false };
  }
  return { resolved: { ...objective, decision: null }, escalate: true };
}

// The precedent captured from the accepted mission (REAL provenance). Goal-normalized key ⇒ cross-mission reuse.
const CAPTURED_AT = "2026-10-21T21:41:06Z"; // injected (core is clock-free)
function seedPrecedent(store) {
  return dp.recordPrecedent(store, {
    task: { goal: "classify scheduler IDLE outcome for an all-proven canary allowlist" },
    sourceMission: "FORMALIZE_SCHEDULER_IDLE_OBSERVABILITY_DELTA",
    sourceEvidence: { commit: "18768c1", artifact: "runtime/missions/FORMALIZE_SCHEDULER_IDLE_OBSERVABILITY_DELTA.json", verdict: "ACCEPTED" },
    capturedAt: CAPTURED_AT,
    version: 1,
    decision: { classification: "EXPECTED_STEADY_STATE", rationale: "all allowlisted missions are ledger-proven ⇒ dedup IDLE; not a defect" },
    applicability: "scheduler/canary IDLE triage where every allowlisted mission is proven",
    limitations: "does not apply once a non-proven mission is allowlisted (then IDLE would be a real gap)",
    authoredBy: "ODG_CAPABILITY",
  });
}

// 0 — purity / exports (requiring the module launched nothing).
ok("pure library exports record/recall/apply/reuse/summarize", ["recordPrecedent","recallPrecedent","applyPrecedent","reusePrecedent","summarizeReuse"].every((f) => typeof dp[f] === "function"));

// 1 — deny-by-default: a precedent MUST carry a decision (an empty/patch-only entry is refused).
{
  let threw = false;
  try { dp.recordPrecedent(dp.emptyStore(), { task: { goal: "x" }, edits: [{ target: "a", content: "b" }] }); } catch { threw = true; }
  ok("record refuses an entry with no decision (deny-by-default; NOT a file-patch store)", threw);
}

// 2 — CAPTURED (state 1): the precedent is recorded from accepted-mission evidence.
const objGoal = "classify scheduler IDLE outcome for an all-proven canary allowlist";
const storeB = dp.emptyStore();
const captured = seedPrecedent(storeB);
ok("CAPTURED: precedent recorded with real source provenance", captured && captured.sourceMission === "FORMALIZE_SCHEDULER_IDLE_OBSERVABILITY_DELTA" && captured.sourceEvidence.commit === "18768c1");

// 3 — PERSISTED (state 2): it lives durably in the store with provenance (captured time + authored-by).
ok("PERSISTED: store holds the precedent durably with provenance", storeB.entries[captured.signature] && storeB.entries[captured.signature].capturedAt === CAPTURED_AT && storeB.entries[captured.signature].authoredBy === "ODG_CAPABILITY");

// 4 — RETRIEVED (state 3): a DIFFERENT objective (new id, same goal) recalls the precedent (cross-mission).
const objective2 = { id: "NEW_MISSION_OBJ_1", goal: objGoal };
const recalled = dp.recallPrecedent(storeB, objective2);
ok("RETRIEVED: a new objective with the same goal recalls the precedent (goal-keyed reuse)", recalled && recalled.signature === captured.signature);

// 5 — APPLIED (state 4): applyPrecedent resolves the objective WITHOUT mutating the input / without any patch.
const applied = dp.applyPrecedent(objective2, recalled);
ok("APPLIED: decision attached to a COPY (input not mutated; no edits/patch field)", applied.decision && applied.resolvedBy === "PRECEDENT" && objective2.decision === undefined && !("edits" in applied));

// 6 — DEMONSTRATED EFFECT (state 5): controlled A/B — same objective, only the seeded precedent differs.
const storeA = dp.emptyStore(); // control: empty
const armA = resolveReadOnly({ id: "NEW_MISSION_OBJ_1", goal: objGoal }, storeA);
const armB = resolveReadOnly({ id: "NEW_MISSION_OBJ_1", goal: objGoal }, storeB);
ok("A/B: control arm (no precedent) escalates; treatment arm (precedent) resolves locally", armA.escalate === true && armA.resolved.decision === null && armB.escalate === false && armB.resolved.decision && armB.resolved.decision.classification === "EXPECTED_STEADY_STATE");
ok("REUSE accounted on treatment only (reuseCount 0→1)", storeB.entries[captured.signature].reuseCount === 1 && (storeA.entries[captured.signature] === undefined));

// measured before/after via the REAL improvement-baseline (escalations lower-is-better, resolvedLocally higher).
const before = { escalations: armA.escalate ? 1 : 0, resolvedLocally: armA.resolved.decision ? 1 : 0 };
const after = { escalations: armB.escalate ? 1 : 0, resolvedLocally: armB.resolved.decision ? 1 : 0 };
const delta = measureDelta(before, after, { escalations: "lower", resolvedLocally: "higher" });
ok("measureDelta: a REAL non-flat improvement (escalations↓, resolvedLocally↑)", delta.summary.improved === 2 && delta.summary.regressed === 0 && delta.metrics.escalations.direction === "improved" && delta.metrics.resolvedLocally.direction === "improved");

// EFFECTIVE graded by the REAL learning-chain (refuses a flat/fabricated effect).
const learningRecord = {
  id: captured.signature,
  captured: { description: captured.decision.rationale },
  persisted: { file: "runtime/generated/autonomy/decision-precedent.json", ref: captured.signature, commit: captured.sourceEvidence.commit },
  discoverable: { anchor: captured.sourceMission },
  reused: { count: storeB.entries[captured.signature].reuseCount, consumers: [objective2.id] },
  effective: { baseline: before, after: after },
};
const chain = classifyLearningState(learningRecord);
ok("learning-chain classifies the record EFFECTIVE (full read-only reuse chain, measured effect)", chain.complete === true && chain.state === "EFFECTIVE");

// 7 — TRACEABLE LINKS: source evidence → precedent → execution → result, all cross-referenced.
ok("traceable: sourceEvidence → precedent.signature → consumer objective → resolved decision", captured.sourceEvidence.commit === "18768c1" && learningRecord.persisted.ref === captured.signature && learningRecord.reused.consumers[0] === objective2.id && armB.resolved.precedentSignature === captured.signature);

// 8 — DISTINCT STATES: each of the five states is independently evidenced (not collapsed).
ok("five states are DISTINCT and each independently evidenced", chain.reached.CAPTURED && chain.reached.PERSISTED && chain.reached.DISCOVERABLE && chain.reached.REUSED && chain.reached.EFFECTIVE);

// 9 — a bare counter is NOT accepted as effect: a flat baseline==after is NOT EFFECTIVE (honesty guard).
{
  const flat = classifyLearningState({ ...learningRecord, effective: { baseline: before, after: before } });
  ok("honesty: flat baseline==after is NOT EFFECTIVE (counter alone insufficient)", flat.complete === false && flat.state === "REUSED");
}

console.log(`\ndecision-precedent — ${passed} assertions passed. (read-only reuse; NO file patch, NO target mutation.)`);
