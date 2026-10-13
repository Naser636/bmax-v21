"use strict";

/*
 * Tests for autonomy-measure.js — PURE/OFFLINE Phase-03 autonomy-share calculator.
 * Run: node --test runtime/core/autonomy-measure.test.js
 * No filesystem/network/clock. The reuse test drives the REAL objective-attribution core with injected
 * hermetic probes so nothing touches disk.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { measureAutonomy, fromAttribution, fromExecution, describeExecution, eligibilityFromObjectives, CATEGORY, ACTOR, KIND, AUTHORED_BY } = require("./autonomy-measure");
const attribution = require("./objective-attribution");
const pm = require("./patch-memory");
const finalReport = require("./final-report");

// A well-formed ODG-executed-and-verified ACTION unit; override fields per test.
const unit = (over = {}) => ({
  id: "o1", eligible: true, authorized: true, actor: ACTOR.ODG, status: "EXECUTED",
  kind: KIND.ACTION, verified: true, humanMandatory: false, accepted: false, ...over,
});

test("normal case: ratio = ODG-executed-verified / eligible denominator", () => {
  const r = measureAutonomy([
    unit({ id: "a" }),                                             // ODG verified
    unit({ id: "b", verified: false }),                           // ODG unverified
    unit({ id: "c", actor: ACTOR.OPERATOR }),                     // operator
    unit({ id: "d", status: "BLOCKED" }),                         // blocked
    unit({ id: "e", humanMandatory: true }),                      // human mandatory
  ]);
  assert.equal(r.measurable, true);
  assert.equal(r.denominator, 5);
  assert.equal(r.numerator, 1);
  assert.equal(r.autonomyPercent, 20); // 1/5
  assert.equal(r.categories[CATEGORY.ODG_EXECUTED_VERIFIED], 1);
  assert.equal(r.categories[CATEGORY.ODG_EXECUTED_UNVERIFIED], 1);
  assert.equal(r.categories[CATEGORY.OPERATOR_OR_EXTERNAL], 1);
  assert.equal(r.categories[CATEGORY.BLOCKED_REFUSED_FAILED], 1);
  assert.equal(r.categories[CATEGORY.HUMAN_MANDATORY], 1);
});

test("null denominator: no eligible-authorized units ⇒ not measurable", () => {
  const r = measureAutonomy([unit({ eligible: false }), unit({ id: "x", authorized: false })]);
  assert.equal(r.measurable, false);
  assert.equal(r.autonomyPercent, null);
  assert.match(r.reason, /null denominator/);
  assert.equal(r.denominator, 0);
  assert.equal(r.excluded, 2);
});

test("empty input ⇒ not measurable (null denominator), never 0% or 100%", () => {
  const r = measureAutonomy([]);
  assert.equal(r.measurable, false);
  assert.equal(r.autonomyPercent, null);
});

test("non-array input ⇒ not measurable", () => {
  for (const bad of [null, undefined, {}, "x", 7]) {
    assert.equal(measureAutonomy(bad).measurable, false);
  }
});

test("missing / malformed data ⇒ not measurable (fail-closed), no misleading percent", () => {
  assert.match(measureAutonomy([{ id: "a" }]).reason, /malformed/);                       // missing booleans
  assert.match(measureAutonomy([unit({ status: 123 })]).reason, /malformed/);             // bad status type
  assert.match(measureAutonomy([unit({ kind: "NOPE" })]).reason, /malformed/);            // bad kind
  assert.match(measureAutonomy([unit({ actor: "ROBOT" })]).reason, /malformed/);          // bad actor
  assert.equal(measureAutonomy([unit({ verified: "yes" })]).measurable, false);           // non-boolean verified
});

test("duplicate ids ⇒ not measurable (a step is never counted twice)", () => {
  const r = measureAutonomy([unit({ id: "dup" }), unit({ id: "dup" })]);
  assert.equal(r.measurable, false);
  assert.match(r.reason, /duplicate work unit id: dup/);
});

test("a PLAN / INTENTION / DECLARATION is never counted as executed ODG work", () => {
  for (const k of [KIND.PLAN, KIND.INTENTION, KIND.DECLARATION]) {
    const r = measureAutonomy([unit({ kind: k })]); // ODG + EXECUTED + verified, but not an ACTION
    assert.equal(r.measurable, true);
    assert.equal(r.numerator, 0, `${k} must not count as executed`);
    assert.equal(r.categories[CATEGORY.ODG_EXECUTED_VERIFIED], 0);
    assert.equal(r.categories[CATEGORY.NOT_EXECUTED], 1);
    assert.equal(r.autonomyPercent, 0);
  }
});

test("a result without VALID evidence is not counted as a verified ODG step", () => {
  const r = measureAutonomy([unit({ verified: false })]); // ODG executed but no valid evidence
  assert.equal(r.numerator, 0);
  assert.equal(r.categories[CATEGORY.ODG_EXECUTED_VERIFIED], 0);
  assert.equal(r.categories[CATEGORY.ODG_EXECUTED_UNVERIFIED], 1);
  assert.equal(r.distinctions.evidenceValid, 0);
  assert.equal(r.distinctions.completed, 1); // completed != evidence-valid
});

test("failures and blocked/refused are their own category, never numerator", () => {
  for (const s of ["FAILED", "BLOCKED", "REFUSED"]) {
    const r = measureAutonomy([unit({ status: s })]);
    assert.equal(r.categories[CATEGORY.BLOCKED_REFUSED_FAILED], 1);
    assert.equal(r.numerator, 0);
  }
});

test("human-mandatory wins over status (mandatory human intervention is preserved, not hidden)", () => {
  const r = measureAutonomy([unit({ humanMandatory: true, status: "EXECUTED" })]);
  assert.equal(r.categories[CATEGORY.HUMAN_MANDATORY], 1);
  assert.equal(r.numerator, 0); // never silently converted to ODG autonomy to inflate the %
});

test("ambiguous data (done work with no actor, or ambiguous flag) ⇒ not measurable", () => {
  assert.match(measureAutonomy([unit({ actor: null })]).reason, /ambiguous|done work without an actor/);
  assert.match(measureAutonomy([unit({ ambiguous: true })]).reason, /ambiguous/);
});

test("distinct counts: completed vs accepted vs evidence-valid are not conflated", () => {
  const r = measureAutonomy([
    unit({ id: "a", verified: true, accepted: false }),  // completed + evidence-valid, not accepted
    unit({ id: "b", verified: false, accepted: true }),  // completed + accepted, no evidence
  ]);
  assert.equal(r.distinctions.completed, 2);
  assert.equal(r.distinctions.evidenceValid, 1);
  assert.equal(r.distinctions.accepted, 1);
});

test("excluded (ineligible/unauthorized) units never enter the denominator", () => {
  const r = measureAutonomy([unit({ id: "a" }), unit({ id: "b", authorized: false })]);
  assert.equal(r.denominator, 1);
  assert.equal(r.excluded, 1);
  assert.equal(r.autonomyPercent, 100); // 1/1 eligible; the excluded one is not counted either way
});

test("result is frozen (immutable record)", () => {
  const r = measureAutonomy([unit()]);
  assert.throws(() => { r.autonomyPercent = 999; });
});

test("REUSE: real objective-attribution output composes through fromAttribution → measureAutonomy", () => {
  // Build synthetic EXPECTED (patch-plan) + ACTUAL (patch-execution) for 4 objectives.
  const patch = { patches: [
    { objectiveId: "ev", done_when: [], proof: null },
    { objectiveId: "noev", done_when: [], proof: null },
    { objectiveId: "fail", done_when: [], proof: null },
    { objectiveId: "dup", done_when: [], proof: null },
  ] };
  const execution = { executed: [
    { objectiveId: "ev", status: "EXECUTED", evidence: "ev-good" },
    { objectiveId: "noev", status: "EXECUTED", evidence: "" },
    { objectiveId: "fail", status: "FAILED", evidence: null },
    { objectiveId: "dup", status: "EXECUTED", evidence: "x" },
    { objectiveId: "dup", status: "EXECUTED", evidence: "y" }, // ambiguous join ⇒ INCONSISTENT
  ] };
  // Hermetic injected probes: evidence valid only for "ev-good"; no declared-proof registry touched.
  const attr = attribution.attributeObjectives(
    null, patch, execution,
    (p) => p === "ev-good",
    () => ({ ok: false }), () => false, {},
  );
  assert.equal(attr.summary.evidenced, 1);
  assert.equal(attr.summary.inconsistent, 1);

  const meta = {
    ev:   { eligible: true, authorized: true, actor: ACTOR.ODG, kind: KIND.ACTION, humanMandatory: false },
    noev: { eligible: true, authorized: true, actor: ACTOR.ODG, kind: KIND.ACTION, humanMandatory: false },
    fail: { eligible: true, authorized: true, actor: ACTOR.ODG, kind: KIND.ACTION, humanMandatory: false },
    dup:  { eligible: true, authorized: true, actor: ACTOR.ODG, kind: KIND.ACTION, humanMandatory: false },
  };
  const units = fromAttribution(attr, meta);
  // The INCONSISTENT objective becomes an ambiguous unit ⇒ the whole measurement is not measurable.
  const r = measureAutonomy(units);
  assert.equal(r.measurable, false);
  assert.match(r.reason, /ambiguous/);

  // Remove the ambiguous objective ⇒ measurable: ev (verified) / {ev,noev,fail} = 1/3 = 33.3%.
  const clean = units.filter((u) => u.id !== "dup");
  const r2 = measureAutonomy(clean);
  assert.equal(r2.measurable, true);
  assert.equal(r2.denominator, 3);
  assert.equal(r2.numerator, 1);
  assert.equal(r2.autonomyPercent, 33.3);
  assert.equal(r2.categories[CATEGORY.ODG_EXECUTED_UNVERIFIED], 1); // noev: executed, no evidence
  assert.equal(r2.categories[CATEGORY.BLOCKED_REFUSED_FAILED], 1);  // fail
});

test("missing attribution metadata for an objective ⇒ not measurable", () => {
  const attr = { objectives: [{ objectiveId: "x", verdict: "EVIDENCED", status: "EXECUTED" }] };
  const units = fromAttribution(attr, {}); // no meta for "x" ⇒ eligibility unprovable (F2)
  const r = measureAutonomy(units);
  assert.equal(r.measurable, false);
});

// --- F1: status vocabulary — an unknown/typo status must never be silently bucketed NOT_EXECUTED ---
test("F1 negative: an unknown/typo status ⇒ not measurable (never a silent NOT_EXECUTED percentage)", () => {
  const r = measureAutonomy([unit({ status: "EXECUTEDD" })]); // typo of EXECUTED
  assert.equal(r.measurable, false);
  assert.equal(r.autonomyPercent, null);
  assert.match(r.reason, /unrecognized|status/i);
});

test("F1 positive: every authorized status is recognized and measured", () => {
  for (const s of ["EXECUTED", "APPLIED", "DONE", "FAILED", "BLOCKED", "REFUSED", "RECORDED", "DEFERRED", "PENDING", "RUNNING"]) {
    assert.equal(measureAutonomy([unit({ status: s })]).measurable, true, `status ${s} must be recognized`);
  }
});

// --- F2: eligibility must be PROVEN by metadata; unknown metadata is read as proof of NEITHER side ---
test("F2 negative: missing metadata on a FAILED objective ⇒ not measurable (no defaulted eligibility)", () => {
  const attr = { objectives: [{ objectiveId: "f", verdict: "FAILED", status: "FAILED" }] };
  const r = measureAutonomy(fromAttribution(attr, {})); // no meta — cannot prove eligibility
  assert.equal(r.measurable, false);
  assert.match(r.reason, /ambiguous|unprovable/i);
});

test("F2 negative: partial metadata (eligible without authorized) ⇒ not measurable", () => {
  const attr = { objectives: [{ objectiveId: "p", verdict: "EVIDENCED", status: "EXECUTED" }] };
  const r = measureAutonomy(fromAttribution(attr, { p: { eligible: true, actor: ACTOR.ODG, kind: KIND.ACTION } }));
  assert.equal(r.measurable, false);
});

test("F2 negative: contradictory metadata (eligible true, authorized false) ⇒ not measurable", () => {
  const attr = { objectives: [{ objectiveId: "c", verdict: "EVIDENCED", status: "EXECUTED" }] };
  const r = measureAutonomy(fromAttribution(attr, { c: { eligible: true, authorized: false, actor: ACTOR.ODG, kind: KIND.ACTION } }));
  assert.equal(r.measurable, false);
});

test("F2 positive: complete metadata (eligible AND authorized) ⇒ measurable", () => {
  const attr = { objectives: [{ objectiveId: "ok", verdict: "EVIDENCED", status: "EXECUTED" }] };
  const r = measureAutonomy(fromAttribution(attr, { ok: { eligible: true, authorized: true, actor: ACTOR.ODG, kind: KIND.ACTION } }));
  assert.equal(r.measurable, true);
  assert.equal(r.numerator, 1);
});

test("F2: an EXPLICIT eligible:false is a justified exclusion, not ambiguity (measurement still possible)", () => {
  const attr = { objectives: [
    { objectiveId: "in", verdict: "EVIDENCED", status: "EXECUTED" },
    { objectiveId: "out", verdict: "EVIDENCED", status: "EXECUTED" },
  ] };
  const r = measureAutonomy(fromAttribution(attr, {
    in: { eligible: true, authorized: true, actor: ACTOR.ODG, kind: KIND.ACTION },
    out: { eligible: false }, // explicitly out of scope ⇒ excluded, never poisons the measurement
  }));
  assert.equal(r.measurable, true);
  assert.equal(r.denominator, 1);
  assert.equal(r.excluded, 1);
});

// ===== CTO Phase-03 instrumentation: fromExecution() + authoredBy / appliedBy semantics =====
const exec = (entries) => ({ executed: entries });
const evidenced = (...ids) => ({ objectives: ids.map((objectiveId) => ({ objectiveId, verdict: "EVIDENCED" })) });
const eligAll = (...ids) => Object.fromEntries(ids.map((id) => [id, { eligible: true, authorized: true }]));

test("INSTR-1: ODG-authored, ODG-applied, verified ⇒ contributes to the autonomy numerator", () => {
  const u = fromExecution(
    exec([{ objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR" }]),
    evidenced("a"), eligAll("a"));
  const r = measureAutonomy(u);
  assert.equal(r.measurable, true);
  assert.equal(r.numerator, 1);
  assert.equal(r.autonomyPercent, 100);
});

test("INSTR-2: PROVIDER-authored but ODG-applied + verified ⇒ never autonomous (external)", () => {
  const u = fromExecution(
    exec([{ objectiveId: "p", status: "APPLIED", authoredBy: AUTHORED_BY.PROVIDER, appliedBy: "ODG_EXECUTOR" }]),
    evidenced("p"), eligAll("p"));
  const r = measureAutonomy(u);
  assert.equal(r.measurable, true);
  assert.equal(r.numerator, 0);
  assert.equal(r.categories[CATEGORY.OPERATOR_OR_EXTERNAL], 1);
});

test("INSTR-3: CONTRACT or UNKNOWN origin ⇒ not measurable, never numerator", () => {
  for (const a of [AUTHORED_BY.CONTRACT, AUTHORED_BY.UNKNOWN]) {
    const u = fromExecution(
      exec([{ objectiveId: "c", status: "APPLIED", authoredBy: a, appliedBy: "ODG_EXECUTOR" }]),
      evidenced("c"), eligAll("c"));
    assert.equal(measureAutonomy(u).measurable, false, `${a} must be non-measurable`);
  }
});

test("INSTR-4/5: memory replay — no provenance ⇒ UNKNOWN; proven provenance retained, never requalified", () => {
  const os2 = require("node:os"), fs2 = require("node:fs"), p2 = require("node:path");
  const tmp = fs2.mkdtempSync(p2.join(os2.tmpdir(), "pm-prov-"));
  const cwd0 = process.cwd();
  try {
    process.chdir(tmp); // sandbox the cwd-relative autonomy-store ⇒ real store untouched
    const edits = [{ target: "x.txt", content: "y" }];
    pm.record({ goal: "g1", edits, authoredBy: AUTHORED_BY.PROVIDER, mission: "M" });
    assert.equal(pm.recall({ goal: "g1" }).authoredBy, "PROVIDER");
    pm.record({ goal: "g1", edits, mission: "M" }); // re-record WITHOUT provenance
    assert.equal(pm.recall({ goal: "g1" }).authoredBy, "PROVIDER", "retained, never erased or requalified");
    pm.record({ goal: "g2", edits, mission: "M" }); // historical entry with no provenance
    assert.equal(pm.recall({ goal: "g2" }).authoredBy, "UNKNOWN", "no provenance ⇒ UNKNOWN, never assumed ODG");
  } finally {
    process.chdir(cwd0);
  }
});

test("INSTR-6: appliedBy != ODG_EXECUTOR ⇒ not autonomous even if ODG-authored", () => {
  const u = fromExecution(
    exec([{ objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "SOMETHING_ELSE" }]),
    evidenced("a"), eligAll("a"));
  const r = measureAutonomy(u);
  assert.equal(r.numerator, 0);
  assert.equal(r.categories[CATEGORY.OPERATOR_OR_EXTERNAL], 1);
});

test("INSTR-7: missing eligibility proof ⇒ fail-closed, not measurable", () => {
  const u = fromExecution(
    exec([{ objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR" }]),
    evidenced("a"), {});
  assert.equal(measureAutonomy(u).measurable, false);
});

test("INSTR-8: terminal status without valid evidence ⇒ not verified, not numerator", () => {
  const u = fromExecution(
    exec([{ objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR" }]),
    null, eligAll("a")); // no attribution ⇒ nothing verified
  const r = measureAutonomy(u);
  assert.equal(r.measurable, true);
  assert.equal(r.numerator, 0);
  assert.equal(r.categories[CATEGORY.ODG_EXECUTED_UNVERIFIED], 1);
});

test("INSTR-9: refusal / blocked / failed / escalate ⇒ never an autonomous success", () => {
  const u = fromExecution(
    exec([
      { objectiveId: "b", status: "BLOCKED", authoredBy: AUTHORED_BY.ODG_RULES, appliedBy: null },
      { objectiveId: "f", status: "FAILED", authoredBy: AUTHORED_BY.ODG_RULES, appliedBy: null },
      { objectiveId: "h", status: "BLOCKED", authoredBy: AUTHORED_BY.ODG_RULES, appliedBy: null, humanMandatory: true },
    ]),
    evidenced("b", "f", "h"), eligAll("b", "f", "h"));
  const r = measureAutonomy(u);
  assert.equal(r.measurable, true);
  assert.equal(r.numerator, 0);
  assert.equal(r.categories[CATEGORY.BLOCKED_REFUSED_FAILED], 2);
  assert.equal(r.categories[CATEGORY.HUMAN_MANDATORY], 1);
});

test("INSTR-10: duplicate objectiveId join ⇒ no double attribution (not measurable)", () => {
  const u = fromExecution(
    exec([
      { objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR" },
      { objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR" },
    ]),
    evidenced("a"), eligAll("a"));
  assert.equal(measureAutonomy(u).measurable, false);
});

test("INSTR-11: DUPLICATE replay has no fresh effect ⇒ not counted as executed", () => {
  const u = fromExecution(
    exec([{ objectiveId: "d", status: "DUPLICATE", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: null }]),
    evidenced("d"), eligAll("d"));
  const r = measureAutonomy(u);
  assert.equal(r.measurable, true);
  assert.equal(r.numerator, 0);
  assert.equal(r.categories[CATEGORY.NOT_EXECUTED], 1);
});

test("INSTR-12: a global % only when every eligible unit is cleanly attributed (full denominator)", () => {
  const u = fromExecution(
    exec([
      { objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR" },
      { objectiveId: "p", status: "APPLIED", authoredBy: AUTHORED_BY.PROVIDER, appliedBy: "ODG_EXECUTOR" },
      { objectiveId: "b", status: "BLOCKED", authoredBy: AUTHORED_BY.ODG_RULES, appliedBy: null },
    ]),
    evidenced("a", "p"), eligAll("a", "p", "b"));
  const r = measureAutonomy(u);
  assert.equal(r.measurable, true);
  assert.equal(r.denominator, 3);
  assert.equal(r.numerator, 1);
  assert.equal(r.autonomyPercent, 33.3);
});

// ===== CTO Phase-03: learn-time provenance forwarding, RECORDED no-op, contract→results reconciliation =====

test("PROV-A1: post-release-learning forwards proven authoredBy from APPLIED evidence; absent ⇒ omitted (no fabrication)", () => {
  const prl = require("./post-release-learning");
  const report = { mission: "M", validated: true };
  const execution = { mission: "M", executed: [
    { objectiveId: "o1", status: "APPLIED", authoredBy: "PROVIDER", goal: "g1", files: [{ target: "a.txt", mode: "content" }] },
    { objectiveId: "o2", status: "APPLIED", goal: "g2", files: [{ target: "b.txt", mode: "content" }] }, // no authoredBy
  ] };
  const lr = prl.buildLearnReport("M", { report, execution });
  const byId = Object.fromEntries(lr.objectives.map((o) => [o.objectiveId, o]));
  assert.equal(byId.o1.authoredBy, "PROVIDER", "proven provenance forwarded");
  assert.ok(!("authoredBy" in byId.o2), "absent provenance NOT fabricated from APPLIED status");
});

test("PROV-A2: capability-learning forwards authoredBy to patch-memory; absent ⇒ UNKNOWN (never requalified to ODG)", () => {
  const cl = require("./capability-learning");
  const os2 = require("node:os"), fs2 = require("node:fs"), p2 = require("node:path");
  const tmp = fs2.mkdtempSync(p2.join(os2.tmpdir(), "cl-prov-"));
  const cwd0 = process.cwd();
  try {
    process.chdir(tmp); // sandbox the cwd-relative store ⇒ the real patch-memory store is untouched
    cl.learn({ mission: "M", validated: true, objectives: [
      { objectiveId: "o1", goal: "gp", edits: [{ target: "a.txt", mode: "content" }], authoredBy: "PROVIDER" },
      { objectiveId: "o2", goal: "gu", edits: [{ target: "b.txt", mode: "content" }] }, // no provenance
    ] });
    assert.equal(pm.recall({ goal: "gp" }).authoredBy, "PROVIDER", "retained through learn→record→recall");
    assert.equal(pm.recall({ goal: "gu" }).authoredBy, "UNKNOWN", "absent ⇒ UNKNOWN, never ODG");
  } finally {
    process.chdir(cwd0);
  }
});

test("NOOP-B: a RECORDED no-op projects to NOT_EXECUTED (no author required), never the numerator", () => {
  const r = measureAutonomy(fromExecution(exec([{ objectiveId: "r", status: "RECORDED" }]), evidenced(), eligAll("r")));
  assert.equal(r.measurable, true);
  assert.equal(r.numerator, 0);
  assert.equal(r.categories[CATEGORY.NOT_EXECUTED], 1);
});

test("DENOM-D: contract objective absent from results ⇒ NOT_EXECUTED only when the run is KNOWN-complete", () => {
  const r = measureAutonomy(fromExecution(
    exec([{ objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR" }]),
    evidenced("a"), eligAll("a", "missing"), { runComplete: true }));
  assert.equal(r.measurable, true);
  assert.equal(r.denominator, 2);
  assert.equal(r.numerator, 1);
  assert.equal(r.categories[CATEGORY.NOT_EXECUTED], 1); // the 'missing' contract objective
});

test("DENOM-E: contract objective absent + run NOT complete (early stop) ⇒ NON_MEASURABLE", () => {
  const u = fromExecution(
    exec([{ objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR" }]),
    evidenced("a"), eligAll("a", "missing")); // no runComplete
  assert.equal(measureAutonomy(u).measurable, false);
});

test("DENOM-F: a recorded result whose objective has NO eligibility proof ⇒ denominator incomplete ⇒ NON_MEASURABLE", () => {
  const u = fromExecution(
    exec([
      { objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR" },
      { objectiveId: "b", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR" },
    ]),
    evidenced("a", "b"), eligAll("a"), { runComplete: true }); // 'b' has no eligibility proof
  assert.equal(measureAutonomy(u).measurable, false);
});

test("DENOM-G: partial run — no % is derived from executed[] alone when the contract denominator is unproven", () => {
  const u = fromExecution(
    exec([{ objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR" }]),
    evidenced("a"), {}); // no eligibility map at all
  assert.equal(measureAutonomy(u).measurable, false);
});

test("DENOM-H: inconsistent join (same objectiveId recorded twice) ⇒ no double attribution ⇒ NON_MEASURABLE", () => {
  const u = fromExecution(
    exec([
      { objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR" },
      { objectiveId: "a", status: "APPLIED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR" },
    ]),
    evidenced("a"), eligAll("a"));
  assert.equal(measureAutonomy(u).measurable, false);
});

// ===== CTO Phase-03: descriptive ventilation (describeExecution) =====

test("DESC-1: describeExecution buckets each category and flags inconsistent joins (no double count)", () => {
  const d = describeExecution(exec([
    { objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR" }, // ODG verified
    { objectiveId: "p", status: "APPLIED", authoredBy: AUTHORED_BY.PROVIDER, appliedBy: "ODG_EXECUTOR" },         // external
    { objectiveId: "x", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "OTHER" },          // ODG-authored, applied by other ⇒ external
    { objectiveId: "b", status: "BLOCKED", authoredBy: AUTHORED_BY.ODG_RULES },                                    // blocked
    { objectiveId: "h", status: "BLOCKED", authoredBy: AUTHORED_BY.ODG_RULES, humanMandatory: true },             // human
    { objectiveId: "r", status: "RECORDED" },                                                                      // not-executed
    { objectiveId: "dp", status: "DUPLICATE", authoredBy: AUTHORED_BY.ODG_CAPABILITY },                           // not-executed (replay)
    { objectiveId: "c", status: "APPLIED", authoredBy: AUTHORED_BY.CONTRACT, appliedBy: "ODG_EXECUTOR" },         // unknown/unverified (CONTRACT on DONE)
    { objectiveId: "c", status: "APPLIED", authoredBy: AUTHORED_BY.CONTRACT },                                    // inconsistent join (dup id)
  ]), evidenced("a")); // only 'a' verified
  assert.equal(d.counts.odgExecutedVerified, 1);
  assert.equal(d.counts.external, 2);
  assert.equal(d.counts.blockedFailed, 1);
  assert.equal(d.counts.humanMandatory, 1);
  assert.equal(d.counts.notExecuted, 2);
  assert.equal(d.counts.unknownOrUnverified, 1);
  assert.equal(d.inconsistent, 1);
});

test("DESC-2: an ODG-authored DONE without valid evidence is unknown/unverified, not ODG-verified", () => {
  const d = describeExecution(exec([{ objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR" }]), null); // no attribution ⇒ unverified
  assert.equal(d.counts.odgExecutedVerified, 0);
  assert.equal(d.counts.unknownOrUnverified, 1);
});

// ===== CTO Phase-03: final-report integration (autonomySection — additive, non-authoritative) =====

const planObj = (...ids) => ({ objectives: ids.map((id) => ({ id, goal: id })) });
const patchObj = (...ids) => ({ patches: ids.map((id) => ({ objectiveId: id })) });

test("FR-1: the autonomy section is present and headed", () => {
  const lines = finalReport.autonomySection(planObj("a"), patchObj("a"),
    exec([{ objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR", evidence: "e" }]),
    { objectiveCoverage: true }, () => true);
  assert.equal(lines[0], "## Autonomy (measured — non-authoritative)");
});

test("FR-2: complete coverage but NO explicit eligibility ⇒ % NON_MEASURABLE (never fabricated, never 0%)", () => {
  const md = finalReport.autonomySection(planObj("a"), patchObj("a"),
    exec([{ objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR", evidence: "e" }]),
    { objectiveCoverage: true }, () => true).join("\n");
  assert.match(md, /Autonomy %: \*\*NON_MEASURABLE\*\*/);
  assert.match(md, /declaration|per-objective proof/i);
  assert.ok(!/Autonomy %: \*\*0%/.test(md), "never present 0% as proof of no autonomy");
  assert.match(md, /Run coverage \(runComplete signal\): complete/);
});

test("FR-3: incomplete coverage ⇒ no complete-denominator conclusion; absent objectives not assumed non-executed", () => {
  const md = finalReport.autonomySection(planObj("a", "b"), patchObj("a"),
    exec([{ objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR", evidence: "e" }]),
    { objectiveCoverage: false }, () => true).join("\n");
  assert.match(md, /Autonomy %: \*\*NON_MEASURABLE\*\*/);
  assert.match(md, /INCOMPLETE — absent objectives are NOT assumed non-executed/);
});

test("FR-4: descriptive breakdown classifies ODG / external / blocked / human / not-executed / unknown", () => {
  const md = finalReport.autonomySection(planObj("a", "p", "b", "h", "r"), patchObj("a", "p", "b", "h", "r"),
    exec([
      { objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR", evidence: "e" },
      { objectiveId: "p", status: "APPLIED", authoredBy: AUTHORED_BY.PROVIDER, appliedBy: "ODG_EXECUTOR" },
      { objectiveId: "b", status: "FAILED", authoredBy: AUTHORED_BY.ODG_RULES },
      { objectiveId: "h", status: "BLOCKED", authoredBy: AUTHORED_BY.ODG_RULES, humanMandatory: true },
      { objectiveId: "r", status: "RECORDED" },
    ]),
    { objectiveCoverage: true }, (p) => p === "e").join("\n");
  assert.match(md, /ODG-executed\+verified 1 /);
  assert.match(md, /external 1 /);
  assert.match(md, /blocked\/refused\/failed 1 /);
  assert.match(md, /human-mandatory 1 /);
  assert.match(md, /not-executed 1 /);
});

test("FR-5: autonomySection is PURE — it never mutates its input artifacts", () => {
  const pe = Object.freeze(exec([Object.freeze({ objectiveId: "a", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR", evidence: "e" })]));
  const report = { validated: true, status: "SUCCESS", checks: { objectiveCoverage: true } };
  const before = JSON.stringify(report);
  finalReport.autonomySection(planObj("a"), patchObj("a"), pe, report.checks, () => true); // frozen input ⇒ throws if mutated
  assert.equal(JSON.stringify(report), before, "report/validated untouched (non-authoritative)");
});

test("FR-6: missing patch-execution ⇒ 'not available', no misleading percentage, report still compatible", () => {
  const lines = finalReport.autonomySection(planObj("a"), null, null, {}, () => false);
  assert.equal(lines[0], "## Autonomy (measured — non-authoritative)");
  assert.match(lines.join("\n"), /not available/);
  assert.ok(!/Autonomy %: \*\*\d/.test(lines.join("\n")), "no numeric % emitted on missing data");
});

// ===== CTO Phase-03: explicit per-objective eligibility contract + loader passthrough =====

const cp = require("node:child_process");
function runLoader(contract) {
  const os2 = require("node:os"), fs2 = require("node:fs"), p2 = require("node:path");
  const dir = fs2.mkdtempSync(p2.join(os2.tmpdir(), "ldr-"));
  fs2.mkdirSync(p2.join(dir, "runtime", "missions"), { recursive: true });
  fs2.mkdirSync(p2.join(dir, "runtime", "generated"), { recursive: true });
  fs2.writeFileSync(p2.join(dir, "runtime", "missions", "TEST.json"), JSON.stringify(contract));
  const r = cp.spawnSync(process.execPath, [p2.join(process.cwd(), "runtime", "core", "mission-loader.js"), "TEST"], { cwd: dir, encoding: "utf8" });
  let plan = null;
  try { plan = JSON.parse(fs2.readFileSync(p2.join(dir, "runtime", "generated", "mission-plan.json"), "utf8")); } catch { /* left null */ }
  return { status: r.status, plan };
}

test("LOADER-1: objective.authorization is passed through to mission-plan verbatim", () => {
  const { status, plan } = runLoader({ mission: "TEST", objectives: [{ id: "O1", goal: "g", authorization: { eligible: true, authorized: true } }] });
  assert.equal(status, 0);
  assert.deepEqual(plan.objectives[0].authorization, { eligible: true, authorized: true });
});

test("LOADER-2: legacy objective without authorization keeps its historical shape (no key added, still loads)", () => {
  const { status, plan } = runLoader({ mission: "TEST", objectives: [{ id: "O1", goal: "g" }] });
  assert.equal(status, 0);
  assert.ok(!("authorization" in plan.objectives[0]));
});

test("ELIG-1: complete valid declarations ⇒ map + complete", () => {
  const { map, complete, missing } = eligibilityFromObjectives([
    { id: "A", authorization: { eligible: true, authorized: true } },
    { id: "B", authorization: { eligible: true, authorized: false } },
  ]);
  assert.equal(complete, true);
  assert.deepEqual(map.A, { eligible: true, authorized: true });
  assert.deepEqual(map.B, { eligible: true, authorized: false });
  assert.equal(missing.length, 0);
});

test("ELIG-2: a missing declaration ⇒ incomplete (never defaulted eligible)", () => {
  const { complete, missing } = eligibilityFromObjectives([
    { id: "A", authorization: { eligible: true, authorized: true } }, { id: "B" },
  ]);
  assert.equal(complete, false);
  assert.deepEqual(missing, ["B"]);
});

test("ELIG-3: justified exclusion (excluded+reason) ⇒ eligible:false, out of denominator, complete", () => {
  const { map, complete } = eligibilityFromObjectives([{ id: "X", authorization: { excluded: true, reason: "out of scope" } }]);
  assert.equal(complete, true);
  assert.deepEqual(map.X, { eligible: false, authorized: false });
});

test("ELIG-4: exclusion without reason, or excluded+eligible contradiction ⇒ ambiguous (incomplete)", () => {
  assert.equal(eligibilityFromObjectives([{ id: "X", authorization: { excluded: true } }]).complete, false);
  assert.equal(eligibilityFromObjectives([{ id: "X", authorization: { excluded: true, reason: "r", eligible: true } }]).complete, false);
});

test("ELIG-5: non-boolean eligibility/authorization ⇒ ambiguous (incomplete)", () => {
  assert.equal(eligibilityFromObjectives([{ id: "X", authorization: { eligible: "yes", authorized: true } }]).complete, false);
});

test("SCEN-50: complete run — 1 ODG-verified + 1 eligible-not-executed + 1 excluded ⇒ 50% (only with valid proofs)", () => {
  const { map, complete } = eligibilityFromObjectives([
    { id: "A", authorization: { eligible: true, authorized: true } },
    { id: "B", authorization: { excluded: true, reason: "out of scope" } },
    { id: "C", authorization: { eligible: true, authorized: true } },
  ]);
  assert.equal(complete, true);
  const r = measureAutonomy(fromExecution(exec([
    { objectiveId: "A", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR" },
    { objectiveId: "B", status: "RECORDED" },
    { objectiveId: "C", status: "RECORDED" },
  ]), evidenced("A"), map, { runComplete: true }));
  assert.equal(r.measurable, true);
  assert.equal(r.denominator, 2);
  assert.equal(r.numerator, 1);
  assert.equal(r.autonomyPercent, 50);
});

test("AUTHZ-DECL: authorized=true declared but the action was BLOCKED ⇒ never an autonomous success", () => {
  const { map } = eligibilityFromObjectives([{ id: "A", authorization: { eligible: true, authorized: true } }]);
  const r = measureAutonomy(fromExecution(exec([{ objectiveId: "A", status: "BLOCKED", authoredBy: AUTHORED_BY.ODG_RULES }]), evidenced(), map, { runComplete: true }));
  assert.equal(r.numerator, 0);
  assert.equal(r.categories[CATEGORY.BLOCKED_REFUSED_FAILED], 1);
});

test("FR-DECL-1: complete declarations + complete coverage ⇒ % emitted in the final report", () => {
  const plan = { objectives: [
    { id: "A", goal: "A", authorization: { eligible: true, authorized: true } },
    { id: "C", goal: "C", authorization: { eligible: true, authorized: true } },
  ] };
  const md = finalReport.autonomySection(plan, patchObj("A", "C"),
    exec([
      { objectiveId: "A", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR", evidence: "e" },
      { objectiveId: "C", status: "RECORDED" },
    ]),
    { objectiveCoverage: true }, (p) => p === "e").join("\n");
  assert.match(md, /Autonomy %: \*\*50%\*\*/);
});

test("FR-DECL-2: one objective lacking a declaration ⇒ NON_MEASURABLE (never 0%)", () => {
  const plan = { objectives: [
    { id: "A", goal: "A", authorization: { eligible: true, authorized: true } },
    { id: "B", goal: "B" }, // no declaration
  ] };
  const md = finalReport.autonomySection(plan, patchObj("A", "B"),
    exec([
      { objectiveId: "A", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR", evidence: "e" },
      { objectiveId: "B", status: "RECORDED" },
    ]),
    { objectiveCoverage: true }, (p) => p === "e").join("\n");
  assert.match(md, /NON_MEASURABLE/);
  assert.ok(!/0%/.test(md));
});

test("FR-DECL-3: legacy contract without authorization ⇒ NON_MEASURABLE, descriptive breakdown still shown", () => {
  const md = finalReport.autonomySection({ objectives: [{ id: "A", goal: "A" }] }, patchObj("A"),
    exec([{ objectiveId: "A", status: "EXECUTED", authoredBy: AUTHORED_BY.ODG_CAPABILITY, appliedBy: "ODG_EXECUTOR", evidence: "e" }]),
    { objectiveCoverage: true }, (p) => p === "e").join("\n");
  assert.match(md, /NON_MEASURABLE/);
  assert.match(md, /Descriptive breakdown/);
});
