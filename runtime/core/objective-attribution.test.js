#!/usr/bin/env node

"use strict";

/*
 * Campaign 04 — Path (A) PER-OBJECTIVE EVIDENCE-BACKED ATTRIBUTION: targeted test.
 *
 * Proves ONLY the attribution join (patch-plan done_when/objectiveId ↔ patch-execution
 * status/evidence), classifying each objective as EVIDENCED / RECORDED-NO-EVIDENCE / FAILED, and
 * reporting missing/ambiguous joins explicitly (never as a PASS). Proves the hard invariant that
 * this mechanism NEVER declares an objective's done_when satisfied. Hermetic: pure inputs + an
 * injected evidenceProbe; no disk, no artifacts written.
 */

const assert = require("assert");
const { attributeObjectives, VERDICT } = require("./objective-attribution");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

// Fixture: four objectives exercising each classification; objectiveId is the join key.
const plan = { objectives: [{ id: "OBJ-1" }, { id: "OBJ-2" }, { id: "OBJ-3" }, { id: "OBJ-4" }] };
const patch = {
  patches: [
    { objectiveId: "OBJ-1", done_when: ["artifact X exists"] },         // → EVIDENCED
    { objectiveId: "OBJ-2", done_when: ["planning recorded"] },         // → RECORDED-NO-EVIDENCE
    { objectiveId: "OBJ-3", done_when: ["the build is green"] },        // → FAILED
    { objectiveId: "OBJ-4", done_when: ["something happened"] },        // → UNMATCHED (no exec entry)
  ],
};
const execution = {
  executed: [
    { objectiveId: "OBJ-1", status: "EXECUTED", capability: "Cap A", evidence: "runtime/generated/a.json" },
    { objectiveId: "OBJ-2", status: "RECORDED" },
    { objectiveId: "OBJ-3", status: "FAILED", error: "boom" },
    // OBJ-4: deliberately absent → missing join.
  ],
};
// Evidence probe: only a.json is present & non-empty.
const evidenceProbe = (p) => p === "runtime/generated/a.json";

const { objectives, summary } = attributeObjectives(plan, patch, execution, evidenceProbe);
const byId = Object.fromEntries(objectives.map((o) => [o.objectiveId, o]));

console.log("Case 1 — EVIDENCED: matched + EXECUTED + evidence present & non-empty");
ok("OBJ-1 is EVIDENCED", byId["OBJ-1"].verdict === VERDICT.EVIDENCED);
ok("OBJ-1 keeps its evidence path", byId["OBJ-1"].evidence === "runtime/generated/a.json");

console.log("Case 2 — RECORDED-NO-EVIDENCE: matched, recorded, no usable evidence");
ok("OBJ-2 is RECORDED-NO-EVIDENCE", byId["OBJ-2"].verdict === VERDICT.RECORDED_NO_EVIDENCE);
ok("OBJ-2 is NOT EVIDENCED", byId["OBJ-2"].verdict !== VERDICT.EVIDENCED);

console.log("Case 3 — FAILED: matched + status FAILED");
ok("OBJ-3 is FAILED", byId["OBJ-3"].verdict === VERDICT.FAILED);
ok("OBJ-3 is never a PASS", byId["OBJ-3"].verdict !== VERDICT.EVIDENCED);

console.log("Case 4 — missing join is explicit, never converted to a PASS");
ok("OBJ-4 is UNMATCHED", byId["OBJ-4"].verdict === VERDICT.UNMATCHED);
ok("OBJ-4 is not EVIDENCED/RECORDED", byId["OBJ-4"].verdict !== VERDICT.EVIDENCED && byId["OBJ-4"].verdict !== VERDICT.RECORDED_NO_EVIDENCE);

console.log("Case 5 — ambiguous join (duplicate objectiveId) is INCONSISTENT, never a PASS");
{
  const dupExec = { executed: [
    { objectiveId: "OBJ-1", status: "EXECUTED", evidence: "runtime/generated/a.json" },
    { objectiveId: "OBJ-1", status: "EXECUTED", evidence: "runtime/generated/a.json" },
  ] };
  const dupPatch = { patches: [{ objectiveId: "OBJ-1", done_when: ["x"] }] };
  const r = attributeObjectives(plan, dupPatch, dupExec, evidenceProbe);
  ok("duplicate objectiveId ⇒ INCONSISTENT", r.objectives[0].verdict === VERDICT.INCONSISTENT);
  ok("INCONSISTENT is not EVIDENCED", r.objectives[0].verdict !== VERDICT.EVIDENCED);
}

console.log("Case 6 — an EXECUTED entry whose evidence file is empty is NOT EVIDENCED");
{
  const r = attributeObjectives(
    plan,
    { patches: [{ objectiveId: "OBJ-1", done_when: ["x"] }] },
    { executed: [{ objectiveId: "OBJ-1", status: "EXECUTED", evidence: "runtime/generated/empty.json" }] },
    () => false, // probe reports the evidence as absent/empty
  );
  ok("empty evidence ⇒ RECORDED-NO-EVIDENCE", r.objectives[0].verdict === VERDICT.RECORDED_NO_EVIDENCE);
  ok("empty evidence ⇒ not EVIDENCED", r.objectives[0].verdict !== VERDICT.EVIDENCED);
}

console.log("Case 7 — INVARIANT: done_when is NEVER declared satisfied");
ok("every objective exposes doneWhenEvaluated:false", objectives.every((o) => o.doneWhenEvaluated === false));
ok("summary states doneWhenEvaluated:false", summary.doneWhenEvaluated === false);
ok("done_when carried as context on EVIDENCED, not consumed as proof",
  Array.isArray(byId["OBJ-1"].doneWhen) && byId["OBJ-1"].doneWhen.length === 1);
{
  // No field anywhere claims satisfaction/proof of done_when.
  const blob = JSON.stringify({ objectives, summary }).toLowerCase();
  ok("no 'satisfied' claim in the result", !blob.includes("satisfied"));
  ok("no 'done_when proven'/'donewhenproven' claim", !blob.includes("proven"));
}

console.log("Case 8 — summary counts are exact (attribution, not a gate)");
ok("1 EVIDENCED", summary.evidenced === 1);
ok("1 RECORDED-NO-EVIDENCE", summary.recordedNoEvidence === 1);
ok("1 FAILED", summary.failed === 1);
ok("1 UNMATCHED", summary.unmatched === 1);
ok("total = 4", summary.total === 4);

console.log("Case 9 — a patch without objectiveId is UNMATCHED (never a PASS)");
{
  const r = attributeObjectives(
    plan,
    { patches: [{ done_when: ["x"] }] },
    { executed: [] },
    evidenceProbe,
  );
  ok("missing objectiveId on patch ⇒ UNMATCHED", r.objectives[0].verdict === VERDICT.UNMATCHED);
}

console.log(`\nOBJECTIVE ATTRIBUTION — ${passed} assertions passed.`);
