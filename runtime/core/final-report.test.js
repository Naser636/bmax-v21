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
const { summarizeC03, attributionSection } = require("./final-report");
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

// ---------------------------------------------------------------------------
// Stage-6 PER-OBJECTIVE ATTRIBUTION surfaced in the Final Report (read-only observability).
// Feeds the REAL objective-attribution analyzer (no mock) through the report helper and asserts the
// rendered markdown reflects each per-objective verdict, stays honest (done_when NOT evaluated), gates
// nothing, and degrades gracefully when the artifacts are absent.
// ---------------------------------------------------------------------------
console.log("surfaces per-objective attribution (real analyzer, no mock)");
{
  const plan = { mission: "M", objectives: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] };
  const patch = {
    patches: [
      { objectiveId: "obj_a", done_when: ["x"] },
      { objectiveId: "obj_b", done_when: ["y"] },
      { objectiveId: "obj_c", done_when: ["z"] },
      { objectiveId: "obj_d", done_when: ["w"] }, // no execution entry ⇒ UNMATCHED
    ],
  };
  const execution = {
    executed: [
      { objectiveId: "obj_a", status: "EXECUTED", evidence: "evidence/a.json" }, // EVIDENCED
      { objectiveId: "obj_b", status: "EXECUTED", evidence: "evidence/missing.json" }, // no usable file
      { objectiveId: "obj_c", status: "FAILED" }, // FAILED
    ],
  };
  const evidenceProbe = (p) => p === "evidence/a.json"; // only a's evidence is present & non-empty
  const lines = attributionSection(plan, patch, execution, evidenceProbe);
  const md = lines.join("\n");

  ok(lines[0] === "## Per-objective attribution", "renders the attribution heading");
  ok(/Evidenced: 1 /.test(md), "summary: exactly 1 EVIDENCED");
  ok(/Recorded \(no evidence\): 1 /.test(md), "summary: exactly 1 RECORDED-NO-EVIDENCE (evidence file absent)");
  ok(/Failed: 1 /.test(md), "summary: exactly 1 FAILED");
  ok(/Unmatched: 1 /.test(md), "summary: exactly 1 UNMATCHED (no execution entry)");
  ok(/done_when NOT evaluated/.test(md), "honesty: states done_when is NOT evaluated (no fabricated proof)");
  ok(/obj_a: \*\*EVIDENCED\*\*/.test(md), "per-objective line: obj_a EVIDENCED");
  ok(/obj_b: \*\*RECORDED-NO-EVIDENCE\*\*/.test(md), "per-objective line: obj_b RECORDED-NO-EVIDENCE");
  ok(/obj_c: \*\*FAILED\*\*/.test(md), "per-objective line: obj_c FAILED");
  ok(/obj_d: \*\*UNMATCHED\*\*/.test(md), "per-objective line: obj_d UNMATCHED");
  ok(!/satisfied|proven|SUCCESS/i.test(md), "never claims satisfied/proven/SUCCESS (changes no gate)");
}

console.log("degrades gracefully when the artifacts are absent (best-effort stage)");
{
  const none = attributionSection({ mission: "M" }, null, null, () => false);
  ok(none[0] === "## Per-objective attribution", "heading present even without artifacts");
  ok(none.some((l) => /not available/.test(l)), "renders an explicit 'not available' line (no crash, no fabricated zero)");
}

console.log("deterministic");
{
  const plan = { objectives: [{ id: "a" }] };
  const patch = { patches: [{ objectiveId: "obj_a", done_when: [] }] };
  const execution = { executed: [{ objectiveId: "obj_a", status: "EXECUTED", evidence: "e" }] };
  const probe = () => true;
  ok(
    JSON.stringify(attributionSection(plan, patch, execution, probe)) ===
      JSON.stringify(attributionSection(plan, patch, execution, probe)),
    "attributionSection is deterministic given identical inputs",
  );
}

console.log(`\nFINAL REPORT × C03 — ${passed} assertions passed.`);
