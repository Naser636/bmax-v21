// @ts-nocheck
// reliability-dora-demonstrator — SLO→PREPARE-response→DORA→recurrence composition. autoApply is ALWAYS false;
// DORA keys stay null (honest) when unobserved; an incident ⇒ a CRITICAL PREPARED (not applied) response; an
// unknown SLO ⇒ INSUFFICIENT_EVIDENCE gap; honesty/determinism/bad-input fail-closed.
"use strict";
const assert = require("assert");
const D = require("./reliability-dora-demonstrator.js");
const SLOT = require("./slo-targets.js");

let n = 0; const ok = (name, cond) => { n++; assert.ok(cond, name); };
const sloId = SLOT.SLO_TARGETS[0].id; // a REAL configured SLO id (SLO_TARGETS is an array); empty SLI ⇒ INSUFFICIENT_EVIDENCE (honest)

// (1) a configured SLO + empty run/ledger ⇒ PREPARED, autoApply false, DORA keys honest-null.
(() => {
  const r = D.runReliabilityEvidence({ sloId, sli: {}, run: { transitions: [] }, ledger: { incidents: {} } });
  ok("base: verdict PREPARED", r.ok && r.verdict === D.VERDICT.PREPARED);
  ok("base: autoApply ALWAYS false", r.summary.autoApply === false);
  // ALL FOUR DORA keys must be honest-null when unobserved (never fabricated from completions).
  const k = r.summary.fourKeys;
  for (const key of ["deploymentFrequency", "leadTimeForChanges", "changeFailureRate", "timeToRestore"]) {
    ok(`base: ${key} unobserved/null (never fabricated)`, k[key].observed === false && k[key].value === null);
  }
  ok("base: recurrence NONE", r.summary.recurrenceVerdict === "NONE");
})();

// (2) unknown SLO id ⇒ INSUFFICIENT_EVIDENCE + gap.
(() => {
  const r = D.runReliabilityEvidence({ sloId: "no-such-slo", sli: {} });
  ok("unknown-slo: INSUFFICIENT_EVIDENCE", r.summary.sloStatus === "INSUFFICIENT_EVIDENCE");
  ok("unknown-slo: a not-evaluable gap reported", r.gaps.some((g) => /not evaluable|insufficient/i.test(g)));
})();

// (3) an INCIDENT ⇒ a CRITICAL response is PREPARED (never auto-applied).
(() => {
  const r = D.runReliabilityEvidence({ sloId, sli: {}, incident: true });
  ok("incident: autoApply still false", r.summary.autoApply === false);
  ok("incident: severity CRITICAL prepared", r.summary.responseSeverity === "CRITICAL");
  ok("incident: a PREPARED-not-applied gap reported", r.gaps.some((g) => /PLANNED, not applied|PREPARED/i.test(g)));
})();

// (4) observed deployments (run.deployments[], the source DORA actually reads) ⇒ deploymentFrequency observed.
(() => {
  const run = { deployments: [{ at: "2026-11-01T00:00:00Z" }, { at: "2026-11-01T01:00:00Z" }] };
  const r = D.runReliabilityEvidence({ sloId, sli: {}, run });
  const df = r.summary.fourKeys.deploymentFrequency;
  ok("dora: deploymentFrequency observed:true with a denominator when deployments supplied", df.observed === true && typeof df.denominator === "number" && df.denominator > 0);
})();

// (5) HONESTY + bad-input + determinism.
(() => {
  const r = D.runReliabilityEvidence({ sloId, sli: {} });
  ok("honesty: basis RELIABILITY_EVIDENCE_PREPARE_NOT_APPLY", r.basis === "RELIABILITY_EVIDENCE_PREPARE_NOT_APPLY");
  ok("honesty: note says PREPARE-not-APPLY + autoApply always false", /PREPARE-not-APPLY/i.test(r.note) && /autoApply is always false/i.test(r.note));
  ok("bad-input: non-object ⇒ INVALID_INPUT", D.runReliabilityEvidence(null).code === "INVALID_INPUT");
  const a = D.runReliabilityEvidence({ sloId, sli: {} }); const b = D.runReliabilityEvidence({ sloId, sli: {} });
  ok("determinism: identical sloStatus + autoApply", a.summary.sloStatus === b.summary.sloStatus && a.summary.autoApply === b.summary.autoApply);
})();

console.log(`reliability-dora-demonstrator: ${n} checks passed`);
