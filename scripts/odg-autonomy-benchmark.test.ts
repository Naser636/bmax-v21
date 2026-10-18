#!/usr/bin/env node
// @ts-nocheck — L5/L6 bulk test migration: runtime-compat under tsx proven; this suppresses
// tsc typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";
/* ODG autonomy benchmark v1 tests — determinism/repeatability, anti-false-success, honest not-measurable. */
const assert = require("assert");
const { runBenchmark, SCENARIOS, BENCHMARK_VERSION, provenance } = require("./odg-autonomy-benchmark.js");
const { KIND, ACTOR } = require("../runtime/core/autonomy-measure.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }

// 1 — deterministic + repeatable: same versioned input ⇒ identical score + provenance.
{
  const a = runBenchmark(), b = runBenchmark();
  ok("repeatable: identical autonomyPercent", a.result.autonomyPercent === b.result.autonomyPercent);
  ok("repeatable: identical provenance hash", a.inputProvenance === b.inputProvenance);
  ok("versioned", a.benchmarkVersion === BENCHMARK_VERSION);
}
// 2 — the known contract score (denominator excludes the unauthorized unit).
{
  const r = runBenchmark().result;
  ok("measurable", r.measurable === true);
  ok("denominator = 8 eligible-authorized (unauthorized S9 excluded)", r.denominator === 8);
  ok("numerator = 2 (only genuine ODG-verified)", r.numerator === 2);
  ok("autonomyPercent = 25", r.autonomyPercent === 25);
}
// 3 — ANTI-FALSE-SUCCESS: none of the non-autonomous classes inflate the numerator.
{
  const c = runBenchmark().result.categories;
  ok("unverified ODG work NOT in numerator", c.ODG_EXECUTED_UNVERIFIED === 1);
  ok("provider + externally-applied counted OPERATOR_OR_EXTERNAL (not ODG)", c.OPERATOR_OR_EXTERNAL === 2);
  ok("blocked counted as blocked (not autonomous)", c.BLOCKED_REFUSED_FAILED === 1);
  ok("human-mandatory excluded from numerator", c.HUMAN_MANDATORY === 1);
  ok("RECORDED no-op counted NOT_EXECUTED (never autonomous success)", c.NOT_EXECUTED === 1);
  // the numerator equals ONLY the verified-ODG count — nothing leaks in.
  ok("numerator == ODG_EXECUTED_VERIFIED exactly", runBenchmark().result.numerator === c.ODG_EXECUTED_VERIFIED);
}
// 4 — honest NOT-MEASURABLE propagation: a duplicate id ⇒ not measurable (never a fabricated score).
{
  const dup = SCENARIOS.concat([{ ...SCENARIOS[0] }]); // duplicate id
  const r = runBenchmark(dup).result;
  ok("duplicate id ⇒ not measurable (no fabricated percent)", r.measurable === false && r.autonomyPercent === null);
}
// 5 — ambiguous unit ⇒ not measurable (fail-closed, never silently bucketed).
{
  const amb = SCENARIOS.concat([{ id: "Sx-amb", kind: KIND.ACTION, actor: ACTOR.ODG, status: "DONE", verified: true, eligible: true, authorized: true, humanMandatory: false, ambiguous: true }]);
  const r = runBenchmark(amb).result;
  ok("ambiguous unit ⇒ not measurable", r.measurable === false);
}
// 6 — provenance changes iff the scenario set changes (tamper-evident).
{
  const changed = SCENARIOS.map((s, i) => (i === 0 ? { ...s, verified: false } : s));
  ok("mutating a scenario changes the provenance hash", provenance(SCENARIOS) !== provenance(changed));
}

console.log(`\nodg-autonomy-benchmark v1 — ${passed} assertions passed.`);
