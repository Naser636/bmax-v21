// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
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

const { buildAutonomyRate, evaluateSLO } = require("./autonomy-rate");

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

// ──────────────────────────────────────────────────────────────────────────────────────────────────
// evaluateSLO — WITHIN / BREACH / INSUFFICIENT_EVIDENCE over a single SLI. Pure; no aggregate; never
// reads the deterministic benchmark; target MUST be a provenanced declared spec.
const PROV = { source: "governance/SLO.json#autonomy.verified", authoredBy: "CTO", rationale: "declared for test", declaredAt: "2026-10-18" };
const SPEC = (over = {}) => ({ target: 0.8, direction: "atLeast", minSampleN: 5, provenance: PROV, ...over });
const M = (over = {}) => ({ measurable: true, numerator: 9, denominator: 10, reason: null, ...over });

test("SLO T1 positive ⇒ WITHIN", () => {
  const r = evaluateSLO(M({ numerator: 9, denominator: 10 }), SPEC());
  assert.equal(r.status, "WITHIN"); assert.equal(r.actual, 0.9); assert.equal(r.sampleSize, 10);
});
test("SLO T2 negative ⇒ BREACH", () => {
  assert.equal(evaluateSLO(M({ numerator: 3, denominator: 10 }), SPEC()).status, "BREACH");
});
test("SLO T3 boundary actual==target (atLeast) ⇒ WITHIN (inclusive)", () => {
  assert.equal(evaluateSLO(M({ numerator: 8, denominator: 10 }), SPEC()).status, "WITHIN");
});
test("SLO T4 boundary atMost budget actual==target ⇒ WITHIN", () => {
  assert.equal(evaluateSLO(M({ numerator: 2, denominator: 10 }), SPEC({ target: 0.2, direction: "atMost" })).status, "WITHIN");
});
test("SLO T5 measurable:false ⇒ INSUFFICIENT_EVIDENCE (reason passthrough, actual null)", () => {
  const r = evaluateSLO({ measurable: false, reason: "null denominator — zero eligible units", numerator: null, denominator: null }, SPEC());
  assert.equal(r.status, "INSUFFICIENT_EVIDENCE"); assert.equal(r.actual, null); assert.match(r.reason, /zero eligible/);
});
test("SLO T6 small sample (real autonomy-rate.json N=1 < 5) ⇒ INSUFFICIENT_EVIDENCE", () => {
  const r = evaluateSLO(M({ numerator: 1, denominator: 1 }), SPEC());
  assert.equal(r.status, "INSUFFICIENT_EVIDENCE"); assert.match(r.reason, /N=1 below minimum 5/);
});
test("SLO T7 measurable:false AND small sample ⇒ INSUFFICIENT_EVIDENCE (measurable gate wins)", () => {
  const r = evaluateSLO({ measurable: false, reason: "no eligible units", numerator: null, denominator: 0 }, SPEC());
  assert.equal(r.status, "INSUFFICIENT_EVIDENCE"); assert.match(r.reason, /no eligible units/);
});
test("SLO T8 falsified numerator>denominator ⇒ INSUFFICIENT_EVIDENCE (never WITHIN)", () => {
  const r = evaluateSLO(M({ numerator: 11, denominator: 10 }), SPEC());
  assert.equal(r.status, "INSUFFICIENT_EVIDENCE"); assert.match(r.reason, /falsified/);
});
test("SLO T9 falsified negative count ⇒ INSUFFICIENT_EVIDENCE", () => {
  assert.equal(evaluateSLO(M({ numerator: -1, denominator: 10 }), SPEC()).status, "INSUFFICIENT_EVIDENCE");
  assert.equal(evaluateSLO(M({ numerator: 1, denominator: -5 }), SPEC()).status, "INSUFFICIENT_EVIDENCE");
});
test("SLO T10 tampered percent ignored — verdict recomputed from num/den", () => {
  // autonomyPercent lies (99) but numerator/denominator give 0.1 ⇒ BREACH, not WITHIN.
  const r = evaluateSLO(M({ numerator: 1, denominator: 10, autonomyPercent: 99 }), SPEC());
  assert.equal(r.status, "BREACH"); assert.equal(r.actual, 0.1);
});
test("SLO T11 spec without provenance ⇒ INSUFFICIENT_EVIDENCE (undeclared target refused)", () => {
  const r = evaluateSLO(M(), { target: 0.8, minSampleN: 5 }); // no provenance
  assert.equal(r.status, "INSUFFICIENT_EVIDENCE"); assert.match(r.reason, /undeclared target/);
});
test("SLO T11b spec without numeric target ⇒ INSUFFICIENT_EVIDENCE", () => {
  assert.equal(evaluateSLO(M(), { provenance: PROV }).status, "INSUFFICIENT_EVIDENCE");
});
test("SLO T12 SLI-2 adapter: unseen capability (uses 0 ⇒ measurable:false) ⇒ INSUFFICIENT_EVIDENCE not BREACH", () => {
  // guards capability-metrics successRate:0 false-zero for an unseen capability.
  const sli2 = { measurable: false, numerator: 0, denominator: 0, reason: "capability unseen (uses=0)" };
  assert.equal(evaluateSLO(sli2, SPEC({ target: 0.7 })).status, "INSUFFICIENT_EVIDENCE");
});
test("SLO T13 SLI-3 adapter: a BLOCKED suite breaches an atLeast-1.0 pass SLO", () => {
  // summarize: PASS 9 of total 10 with 1 BLOCKED ⇒ actual 0.9 < 1.0 ⇒ BREACH (blocked never counts as pass).
  const sli3 = { measurable: true, numerator: 9, denominator: 10 };
  assert.equal(evaluateSLO(sli3, SPEC({ target: 1.0, minSampleN: 1 })).status, "BREACH");
});
test("SLO T14 purity — frozen input not mutated; identical inputs ⇒ identical output", () => {
  const sli = Object.freeze(M()); const spec = Object.freeze(SPEC());
  const a = evaluateSLO(sli, spec); const b = evaluateSLO(sli, spec);
  assert.deepEqual(a, b);
});
test("SLO T15 no aggregate — two SLIs ⇒ two independent verdicts (never summed/averaged)", () => {
  const a = evaluateSLO(M({ numerator: 9, denominator: 10 }), SPEC());
  const b = evaluateSLO(M({ numerator: 1, denominator: 10 }), SPEC());
  assert.equal(a.status, "WITHIN"); assert.equal(b.status, "BREACH");
  // the function returns per-SLI only — there is no combined field.
  assert.ok(!("aggregate" in a) && !("aggregate" in b));
});
