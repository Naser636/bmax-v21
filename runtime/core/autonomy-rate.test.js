"use strict";

/*
 * Tests for autonomy-rate.js — the S1 reuse glue over autonomy-measure.js.
 * Run: node --test runtime/core/autonomy-rate.test.js
 * PURE/OFFLINE: plain data in, artifact body out. No filesystem / network / clock.
 *
 * The gate here is HONESTY, not a green build: the negative cases prove the builder fails closed
 * (measurable:false, autonomyPercent:null) rather than fabricating a percentage, and never credits
 * provider/human/unverified work to ODG.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { buildAutonomyRate } = require("./autonomy-rate");

// --- fixtures -------------------------------------------------------------------------------------

// Three ODG_CAPABILITY / ODG_EXECUTOR objectives, all EXECUTED (the real QUAL_CLEAN_GATEB shape).
function odgExecution() {
  return {
    mission: "FIXTURE",
    executed: [
      { objectiveId: "O1", status: "EXECUTED", authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR", humanMandatory: false },
      { objectiveId: "O2", status: "EXECUTED", authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR", humanMandatory: false },
    ],
  };
}
function declaredObjectives(ids) {
  return ids.map((id) => ({ id, authorization: { eligible: true, authorized: true } }));
}
// Attribution marking given objectiveIds EVIDENCED (the only way a unit is `verified`).
function attributionEvidenced(ids) {
  return { objectives: ids.map((objectiveId) => ({ objectiveId, verdict: "EVIDENCED" })) };
}

// --- POSITIVE: ODG authored+applied, EVIDENCED ⇒ counts toward the numerator -----------------------

test("POSITIVE: fully-declared ODG+verified work is measurable with a real numerator", () => {
  const rate = buildAutonomyRate({
    patchExecution: odgExecution(),
    planObjectives: declaredObjectives(["O1", "O2"]),
    attribution: attributionEvidenced(["O1", "O2"]),
  });
  assert.equal(rate.measure.measurable, true);
  assert.equal(rate.measure.denominator, 2);
  assert.equal(rate.measure.numerator, 2);
  assert.equal(rate.measure.autonomyPercent, 100);
  assert.equal(rate.attribution.source, "objective-attribution.json");
});

// --- HONEST BASELINE: ODG executed but NO attribution ⇒ measurable, numerator 0 (not verified) ------

test("ODG executed but no attribution artifact ⇒ measurable, numerator 0 (never counted as verified)", () => {
  const rate = buildAutonomyRate({
    patchExecution: odgExecution(),
    planObjectives: declaredObjectives(["O1", "O2"]),
    attribution: null, // objective-attribution.json absent on disk — the real current state
  });
  assert.equal(rate.measure.measurable, true);
  assert.equal(rate.measure.denominator, 2);
  assert.equal(rate.measure.numerator, 0, "no valid evidence ⇒ zero verified-autonomy, not a guess");
  assert.equal(rate.measure.autonomyPercent, 0);
  // DESCRIPTIVE ventilation still surfaces the 2 ODG-authored-but-unverified events for observability.
  assert.equal(rate.description.counts.odgExecutedVerified, 0);
  assert.equal(rate.description.counts.unknownOrUnverified, 2);
  assert.equal(rate.attribution.source, null);
});

// --- NEGATIVE: no patch-execution artifact ⇒ not measurable, null %, description present -----------

test("NEGATIVE: absent patch-execution ⇒ measurable:false, autonomyPercent null, no fabricated number", () => {
  const rate = buildAutonomyRate({ patchExecution: null, planObjectives: declaredObjectives(["O1"]) });
  assert.equal(rate.measure.measurable, false);
  assert.equal(rate.measure.autonomyPercent, null);
  assert.equal(rate.measure.denominator, null);
  assert.ok(typeof rate.measure.reason === "string" && rate.measure.reason.length > 0);
  assert.ok(rate.description, "description is always present (descriptive, no denominator)");
  assert.equal(rate.description.total, 0);
});

// --- NEGATIVE: missing eligibility declaration ⇒ NON_MEASURABLE (never inferred) -------------------

test("NEGATIVE: an objective without an authorization declaration ⇒ measurable:false", () => {
  const plan = [
    { id: "O1", authorization: { eligible: true, authorized: true } },
    { id: "O2" }, // no authorization declaration ⇒ eligibility unprovable
  ];
  const rate = buildAutonomyRate({ patchExecution: odgExecution(), planObjectives: plan, attribution: attributionEvidenced(["O1", "O2"]) });
  assert.equal(rate.measure.measurable, false);
  assert.equal(rate.measure.autonomyPercent, null);
  assert.match(rate.measure.reason, /eligibility declarations incomplete/);
  assert.match(rate.measure.reason, /O2/);
});

// --- NEGATIVE: provider-authored DONE work is EXTERNAL, never the ODG numerator --------------------

test("NEGATIVE: provider-authored work is attributed EXTERNAL, never ODG", () => {
  const exec = {
    mission: "FIXTURE",
    executed: [
      { objectiveId: "O1", status: "EXECUTED", authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR", humanMandatory: false },
      { objectiveId: "O2", status: "EXECUTED", authoredBy: "PROVIDER", appliedBy: "ODG_EXECUTOR", humanMandatory: false },
    ],
  };
  const rate = buildAutonomyRate({
    patchExecution: exec,
    planObjectives: declaredObjectives(["O1", "O2"]),
    attribution: attributionEvidenced(["O1", "O2"]),
  });
  assert.equal(rate.measure.measurable, true);
  assert.equal(rate.measure.denominator, 2);
  assert.equal(rate.measure.numerator, 1, "only the ODG-authored+verified unit is the numerator");
  assert.equal(rate.measure.categories.OPERATOR_OR_EXTERNAL, 1, "the provider unit is external");
  assert.equal(rate.measure.autonomyPercent, 50);
  // Descriptive ventilation separates ODG-verified from external.
  assert.equal(rate.description.counts.odgExecutedVerified, 1);
  assert.equal(rate.description.counts.external, 1);
});

// --- NEGATIVE: ODG-authored but applied by a non-ODG component ⇒ not end-to-end autonomous ---------

test("NEGATIVE: ODG-authored but applied by a non-ODG applicator ⇒ external, not the numerator", () => {
  const exec = {
    mission: "FIXTURE",
    executed: [
      { objectiveId: "O1", status: "EXECUTED", authoredBy: "ODG_CAPABILITY", appliedBy: "SOMEONE_ELSE", humanMandatory: false },
    ],
  };
  const rate = buildAutonomyRate({
    patchExecution: exec,
    planObjectives: declaredObjectives(["O1"]),
    attribution: attributionEvidenced(["O1"]),
  });
  assert.equal(rate.measure.numerator, 0);
  assert.equal(rate.measure.categories.OPERATOR_OR_EXTERNAL, 1);
});

// --- DETERMINISM: same inputs ⇒ byte-identical artifact body (generatedAt is isolated to the writer) -

test("DETERMINISM: identical inputs yield an identical artifact body", () => {
  const mk = () => buildAutonomyRate({ patchExecution: odgExecution(), planObjectives: declaredObjectives(["O1", "O2"]), attribution: null });
  assert.equal(JSON.stringify(mk()), JSON.stringify(mk()));
});

// --- PROVENANCE: source artifacts are recorded verbatim -------------------------------------------

test("PROVENANCE: sourceArtifacts are carried through unchanged", () => {
  const sourceArtifacts = [
    { path: "runtime/generated/patch-execution.json", present: true },
    { path: "runtime/generated/objective-attribution.json", present: false },
  ];
  const rate = buildAutonomyRate({ patchExecution: odgExecution(), planObjectives: declaredObjectives(["O1", "O2"]), sourceArtifacts });
  assert.deepEqual(rate.sourceArtifacts, sourceArtifacts);
  assert.equal(rate.mission, "FIXTURE");
});
