#!/usr/bin/env node
/*
 * Final Report × C03 consumer test (CONSUME_C03_IN_FINAL_REPORT).
 *
 * Proves the Final Report now CONSUMES the additive c03Transitions the Mission Lifecycle produces
 * (P0-071): summarizeC03 reports an honest count, tolerates lifecycle objects without the field, and
 * stays deterministic. The real producer (toC03Records) feeds the real consumer — no mock contract.
 *
 * Run: `node runtime/core/final-report.test.js`.
 */

const assert = require("assert");
const { summarizeC03 } = require("./final-report");
const { toC03Records } = require("./mission-lifecycle");

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log("  ok -", msg);
  passed++;
}

const SM = {
  initialState: "CREATED",
  terminalState: "ARCHIVED",
  transitions: {
    CREATED: ["QUALIFIED"],
    QUALIFIED: ["ANALYZED"],
    ANALYZED: ["ARCHIVED"],
    ARCHIVED: [],
  },
};
// Two confirmed advances (VERIFIED) + one blocked attempt (UNVERIFIED), as the lifecycle emits them.
const TRANSITIONS = [
  { from: "CREATED", to: "QUALIFIED", ok: true, evidence: "contract present" },
  { from: "QUALIFIED", to: "ANALYZED", ok: true, evidence: "mission-plan.json (2 objectives)" },
  { from: "ANALYZED", to: "ARCHIVED", ok: false, evidence: "not validated" },
];

console.log("consumes real producer output");
{
  const lifecycle = { c03Transitions: toC03Records(TRANSITIONS, SM) };
  const s = summarizeC03(lifecycle);
  ok(s.total === 3, "total counts every produced C03 record");
  ok(s.validated === 3, "validated counts records the real validator accepted (all 3)");
  ok(s.verified === 2, "verified counts VERIFIED records only (2 confirmed advances)");
}

console.log("honest + tolerant of missing field (backward compatibility)");
{
  ok(JSON.stringify(summarizeC03({})) === JSON.stringify({ total: 0, validated: 0, verified: 0 }),
    "a lifecycle without c03Transitions summarizes to zeros (no crash)");
  ok(JSON.stringify(summarizeC03(null)) === JSON.stringify({ total: 0, validated: 0, verified: 0 }),
    "a null lifecycle summarizes to zeros (no crash)");
  ok(JSON.stringify(summarizeC03({ c03Transitions: "nope" })) === JSON.stringify({ total: 0, validated: 0, verified: 0 }),
    "a malformed c03Transitions is treated as empty, not an error");
}

console.log("deterministic");
{
  const lifecycle = { c03Transitions: toC03Records(TRANSITIONS, SM) };
  ok(JSON.stringify(summarizeC03(lifecycle)) === JSON.stringify(summarizeC03(lifecycle)),
    "summarizeC03 is deterministic");
}

console.log(`\nFINAL REPORT × C03 — ${passed} assertions passed.`);
