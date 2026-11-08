#!/usr/bin/env node
"use strict";
const assert = require("assert");
const SL = require("./study-steps-ledger");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §77–§79 — SEVEN CTO STUDY STEPS LEDGER");

// POSITIVE: the built-in ledger is well-formed, fail-closed, honest.
{
  const v = SL.verifyLedger();
  check(v.ok === true && v.count === 7 && v.distinct === 7 && v.contiguousOrder === true, "exactly 7 steps in contiguous official order 1..7");
  check(v.transversalPreservationAll === true, "§78: every step carries transversal preservation");
  check(v.provenCount === 0 && v.byStatus.DOCUMENTED_NOT_VERIFIED === 7, "no step PROVEN on documentation (all DOCUMENTED_NOT_VERIFIED, honest)");
  check(v.unsound.length === 0, "no unsound step");
}

// honesty: verbatim intitulés NOT_RECOVERABLE (not fabricated); §78 + §79 are recorded as recoverable.
{
  check(SL.STEPS.every((s: any) => /NOT_RECOVERABLE_VERBATIM/.test(s.intitule)), "all seven intitulés marked NOT_RECOVERABLE (index-only), not fabricated");
  check(SL.OPERATIONAL_CORRECTION.recoverable === true && /TRANSVERSAL/i.test(SL.OPERATIONAL_CORRECTION.correction), "§78 operational correction (preservation transversal) recorded");
  check(/STUDY steps/i.test(SL.NATURE.nature), "§79 nature (study steps distinct from execution campaigns) recorded");
}

// NEGATIVE: a step missing the transversal-preservation flag is rejected (§78).
{
  const bad = { id: "STEP_X", officialOrder: 3, transversalPreservation: false, status: "DOCUMENTED_NOT_VERIFIED", verifier: "v" };
  const r = SL.checkStep(bad);
  check(r.ok === false && r.problems.some((p: any) => /transversal preservation/.test(p)), "NEGATIVE: step without transversal preservation ⇒ rejected");
}

// NEGATIVE: an out-of-range order is rejected.
{
  const r = SL.checkStep({ id: "STEP_Y", officialOrder: 9, transversalPreservation: true, status: "PARTIAL", verifier: "v" });
  check(r.ok === false && r.problems.some((p: any) => /1\.\.7/.test(p)), "NEGATIVE: officialOrder outside 1..7 ⇒ rejected");
}

// ADVERSARIAL: a step claiming PROVEN without an explicit demonstration ⇒ rejected (§103, no doc-only pass).
{
  const r = SL.checkStep({ id: "STEP_Z", officialOrder: 1, transversalPreservation: true, status: "PROVEN", verifier: "v" });
  check(r.ok === false && r.problems.some((p: any) => /PROVEN requires an explicit demonstration/.test(p)), "ADVERSARIAL: PROVEN without demonstration ⇒ rejected (documentation is not proof)");
  // but PROVEN WITH an explicit demonstration flag is accepted (sound path exists).
  const ok = SL.checkStep({ id: "STEP_Z", officialOrder: 1, transversalPreservation: true, status: "PROVEN", demonstrated: true, verifier: "v" });
  check(ok.ok === true, "sound path: PROVEN + demonstrated:true is accepted");
}

// NON-REGRESSION: contract documents the fail-closed + NOT_RECOVERABLE invariants.
check(SL.STUDY_STEPS_LEDGER_CONTRACT.invariants.some((i: any) => /NOT_RECOVERABLE/.test(i)) && SL.STUDY_STEPS_LEDGER_CONTRACT.invariants.some((i: any) => /TRANSVERSAL/.test(i)), "contract documents NOT_RECOVERABLE + transversal-preservation invariants");

console.log(failures === 0 ? "ALL PASS — V12.4 §77–§79 STUDY STEPS LEDGER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
