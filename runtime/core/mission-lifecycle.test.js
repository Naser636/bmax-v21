#!/usr/bin/env node
/*
 * Mission Lifecycle × C03 integration test (P0-071).
 *
 * Proves the ADDITIVE integration: the transitions mission-lifecycle already produces can also be
 * expressed as canonical C03 records that pass the ONE real validator (runtime/core/state-transition.js),
 * WITHOUT a second state source, a second transition engine, or any change to existing behaviour.
 *
 * Run: `node runtime/core/mission-lifecycle.test.js`.
 */

const assert = require("assert");
const {
  computeLifecycle,
  toC03Records,
  orderedStates,
} = require("./mission-lifecycle");
const {
  validateStateTransition,
  VERIFICATION_STATUS,
} = require("./state-transition");

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log("  ok -", msg);
  passed++;
}

// A state machine shaped exactly like runtime/governance/state-machine.json (linear chain).
const SM = {
  initialState: "CREATED",
  terminalState: "ARCHIVED",
  transitions: {
    CREATED: ["QUALIFIED"],
    QUALIFIED: ["ANALYZED"],
    ANALYZED: ["PLANNED"],
    PLANNED: ["ARCHIVED"],
    ARCHIVED: [],
  },
};

// Transitions in the exact { from, to, ok, evidence } shape computeLifecycle emits.
const TRANSITIONS = [
  { from: "CREATED", to: "QUALIFIED", ok: true, evidence: "contract present (runtime/missions/X.json)" },
  { from: "QUALIFIED", to: "ANALYZED", ok: true, evidence: "mission-plan.json (2 objectives)" },
  { from: "ANALYZED", to: "PLANNED", ok: false, evidence: "no decision/patch plan" },
];

console.log("ordered chain is the single version source");
{
  const order = orderedStates(SM);
  ok(JSON.stringify(order) === JSON.stringify(["CREATED", "QUALIFIED", "ANALYZED", "PLANNED", "ARCHIVED"]),
    "orderedStates walks the linear chain in order");
  // A cyclic/malformed machine must still terminate (bounded walk).
  const cyclic = { initialState: "A", terminalState: "Z", transitions: { A: ["B"], B: ["A"] } };
  ok(Array.isArray(orderedStates(cyclic)), "orderedStates terminates on a cyclic machine");
}

console.log("every lifecycle transition maps to a record the REAL validator accepts");
{
  const records = toC03Records(TRANSITIONS, SM);
  ok(records.length === 3, "one C03 record per lifecycle transition");
  ok(records.every((r) => r.ok === true), "the real C03 validator accepts every produced record");
  // Re-validate independently through the real validator to prove it is genuinely C03-valid.
  ok(records.every((r) => validateStateTransition(r.record).ok === true),
    "each produced record re-passes validateStateTransition independently");
}

console.log("acceptance-criteria mapping (first, confirmed ADVANCE)");
{
  const [first] = toC03Records(TRANSITIONS, SM);
  const r = first.record;
  ok(JSON.stringify(r.state_before) === JSON.stringify({ state: "CREATED" }), "state_before = { state: from }");
  ok(r.action.type === "ADVANCE" && r.action.from === "CREATED" && r.action.to === "QUALIFIED",
    "action = { type: ADVANCE, from, to }");
  ok(r.observed_effect.ok === true && r.observed_effect.evidence === TRANSITIONS[0].evidence,
    "observed_effect preserves ok + evidence");
  ok(JSON.stringify(r.state_after) === JSON.stringify({ state: "QUALIFIED" }), "state_after = { state: to }");
  ok(JSON.stringify(r.evidence_refs) === JSON.stringify([TRANSITIONS[0].evidence]),
    "evidence_refs carries the lifecycle evidence (no invented proof)");
}

console.log("versions are coherent and strictly increasing");
{
  const records = toC03Records(TRANSITIONS, SM);
  ok(records.every((r) => r.record.state_version_after > r.record.state_version_before),
    "state_version_after > state_version_before for every record");
  const befores = records.map((r) => r.record.state_version_before);
  ok(JSON.stringify(befores) === JSON.stringify([0, 1, 2]), "versions follow the chain ordinal (0,1,2)");
}

console.log("verification_status is honest and C03-vocabulary-only");
{
  const records = toC03Records(TRANSITIONS, SM);
  const vocab = Object.values(VERIFICATION_STATUS);
  ok(records.every((r) => vocab.includes(r.record.verification_status)),
    "verification_status is always a member of the C03 vocabulary");
  ok(records[0].record.verification_status === "VERIFIED" && records[2].record.verification_status === "UNVERIFIED",
    "ok ⇒ VERIFIED, ok:false ⇒ UNVERIFIED (never done/SUCCESS, never fabricated)");
  // I5: a VERIFIED (proof-requiring) record must carry at least one evidence_ref.
  ok(records.filter((r) => r.record.verification_status === "VERIFIED")
    .every((r) => r.record.evidence_refs.length >= 1),
    "VERIFIED records carry >= 1 evidence_ref (no proof-free verification)");
}

console.log("determinism (I7): identical input ⇒ identical output");
{
  const a = JSON.stringify(toC03Records(TRANSITIONS, SM));
  const b = JSON.stringify(toC03Records(TRANSITIONS, SM));
  ok(a === b, "toC03Records is deterministic");
}

console.log("additive integration + existing-consumer compatibility");
{
  // Real end-to-end call: reads the real state machine, writes the (gitignored) generated file.
  const lifecycle = computeLifecycle("P0071_C03_INTEGRATION_PROBE");
  ok(Array.isArray(lifecycle.c03Transitions), "computeLifecycle now emits c03Transitions (additive)");
  // Existing fields that consumers (mission-ledger/final-report/pipeline-builder/odg-delegate) read
  // remain present and unchanged in shape.
  ok(typeof lifecycle.mission === "string" &&
     typeof lifecycle.achieved === "string" &&
     Array.isArray(lifecycle.path) &&
     Array.isArray(lifecycle.transitions),
    "existing lifecycle fields (mission/achieved/path/transitions) preserved");
  ok(lifecycle.transitions.every((t) => "from" in t && "to" in t && "ok" in t && "evidence" in t),
    "existing transition entries keep their {from,to,ok,evidence} shape (unchanged)");
  ok(lifecycle.c03Transitions.length === lifecycle.transitions.length &&
     lifecycle.c03Transitions.every((r) => r.ok === true),
    "one valid C03 record per real transition");
}

console.log(`\nMISSION LIFECYCLE × C03 — ${passed} assertions passed.`);
