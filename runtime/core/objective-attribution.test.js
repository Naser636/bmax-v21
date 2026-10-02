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

console.log("Case 10 — declared-proof OBSERVATION via the existing registry (read-only; NOT done_when proof)");
{
  // Injected fakes = the existing capability-probes mechanism, hermetically: build-green passes,
  // typescript-green fails; only those two names are "registered".
  const known = (name) => name === "build-green" || name === "typescript-green";
  const run = (name) => (name === "build-green" ? { ok: true, detail: "fake build green" } : { ok: false, detail: "fake not green" });
  const evProbe = (p) => p === "a.json";

  const plan10 = { objectives: [{ id: "OBJ-1" }, { id: "OBJ-2" }, { id: "OBJ-3" }, { id: "OBJ-4" }, { id: "OBJ-5" }] };
  const patch10 = { patches: [
    { objectiveId: "OBJ-1", done_when: ["x"], proof: "build-green" },      // bound, PASSES; Path A EVIDENCED
    { objectiveId: "OBJ-2", done_when: ["x"], proof: "typescript-green" }, // bound, FAILS
    { objectiveId: "OBJ-3", done_when: ["x"], proof: "no-such-probe" },    // unknown ⇒ MISSING
    { objectiveId: "OBJ-4", done_when: ["x"] },                            // no proof ⇒ NONE
    { objectiveId: "OBJ-5", done_when: ["x"], proof: "build-green" },      // MIS-BINDING: passes but Path A = RECORDED
  ] };
  const exec10 = { executed: [
    { objectiveId: "OBJ-1", status: "EXECUTED", evidence: "a.json" },
    { objectiveId: "OBJ-2", status: "RECORDED" },
    { objectiveId: "OBJ-3", status: "RECORDED" },
    { objectiveId: "OBJ-4", status: "RECORDED" },
    { objectiveId: "OBJ-5", status: "RECORDED" },
  ] };

  const r = attributeObjectives(plan10, patch10, exec10, evProbe, run, known, { fake: true });
  const m = Object.fromEntries(r.objectives.map((o) => [o.objectiveId, o]));

  // a. bound existing probe is executed and observed
  ok("a: OBJ-1 declared proof observed PROBE-PASSED", m["OBJ-1"].declaredProof.observed === "PROBE-PASSED");
  ok("a: observation carries the probe's detail (executed via registry)", m["OBJ-1"].declaredProof.detail === "fake build green");

  // b. a passing probe is NOT labelled PROVEN / done_when-satisfied / SUCCESS / VERIFIED
  {
    const blob = JSON.stringify(r).toLowerCase();
    ok("b: no 'proven' anywhere", !blob.includes("proven"));
    ok("b: no 'satisfied' anywhere", !blob.includes("satisfied"));
    ok("b: no 'verified' anywhere", !blob.includes("verified"));
    ok("b: no 'success' anywhere", !blob.includes("success"));
    ok("b: declaredProof carries the proxy-only note", /not a done_when proof/.test(m["OBJ-1"].declaredProof.note));
  }

  // c. failing probe recorded as failed
  ok("c: OBJ-2 observed PROBE-FAILED", m["OBJ-2"].declaredProof.observed === "PROBE-FAILED");

  // d. unknown probe recorded as missing / non-pass
  ok("d: OBJ-3 observed PROBE-MISSING", m["OBJ-3"].declaredProof.observed === "PROBE-MISSING");
  ok("d: unknown probe is never a pass", m["OBJ-3"].declaredProof.observed !== "PROBE-PASSED");

  // e. absent proof remains inert
  ok("e: OBJ-4 observed NO-PROOF-BINDING", m["OBJ-4"].declaredProof.observed === "NO-PROOF-BINDING");
  ok("e: OBJ-4 proof is null", m["OBJ-4"].declaredProof.proof === null);

  // f. done_when is never interpreted
  ok("f: doneWhenEvaluated stays false", r.objectives.every((o) => o.doneWhenEvaluated === false) && r.summary.doneWhenEvaluated === false);

  // g. Path A attribution is EXACTLY unchanged by proof consumption
  //    (compare verdicts to a proof-free 4-arg run of the same inputs).
  {
    const base = attributeObjectives(plan10, patch10, exec10, evProbe); // no proof params
    const sameVerdicts = r.objectives.every((o, i) => o.verdict === base.objectives[i].verdict);
    ok("g: proof consumption does not change any Path A verdict", sameVerdicts);
    ok("g: OBJ-1 verdict is EVIDENCED from Path A (evidence), not from the probe", m["OBJ-1"].verdict === VERDICT.EVIDENCED);
  }

  // mis-binding visibility: OBJ-5 probe PASSES but the objective is only RECORDED — the pass must
  // stay a declared-proof OBSERVATION and NEVER become an objective proof/verdict.
  ok("mis-bind: OBJ-5 probe observed PROBE-PASSED", m["OBJ-5"].declaredProof.observed === "PROBE-PASSED");
  ok("mis-bind: OBJ-5 Path A verdict stays RECORDED-NO-EVIDENCE", m["OBJ-5"].verdict === VERDICT.RECORDED_NO_EVIDENCE);
  ok("mis-bind: OBJ-5 is NOT EVIDENCED despite the probe pass", m["OBJ-5"].verdict !== VERDICT.EVIDENCED);

  // observation tallies are exact and separate from attribution counts
  ok("tallies: 2 proofPassed (OBJ-1, OBJ-5)", r.summary.proofPassed === 2);
  ok("tallies: 1 proofFailed", r.summary.proofFailed === 1);
  ok("tallies: 1 proofMissing", r.summary.proofMissing === 1);
  ok("tallies: 1 proofUnbound", r.summary.proofUnbound === 1);
}

console.log(`\nOBJECTIVE ATTRIBUTION — ${passed} assertions passed.`);
