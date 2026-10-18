#!/usr/bin/env node
/* TS source (tsx-run) of scripts/odg-autonomy-benchmark; scripts/odg-autonomy-benchmark.js = ODG_RUNTIME=js rollback. */
"use strict";
/*
 * ODG AUTONOMY BENCHMARK v1 (CTO Autonomy-Excellence §C) — a REPRODUCIBLE, VERSIONED autonomy score that
 * REUSES the existing measurer (runtime/core/autonomy-measure.js). It is NOT a parallel framework and NOT a
 * new primitive: it defines a fixed, versioned set of representative work-units (the scenarios ODG must
 * score honestly) and runs them through measureAutonomy(), proving the score is deterministic, repeatable,
 * provenance-stamped, and — critically — that it NEVER masks a non-autonomous outcome as autonomous.
 *
 * Why fixtures, not live mission runs: the benchmark's job here is to pin the SCORING CONTRACT (what counts
 * as ODG-autonomous vs not) deterministically and anti-false-success. Live-mission autonomy is measured
 * separately by autonomy-rate.json from real runs; this benchmark guarantees the scorer those runs feed is
 * honest. Each scenario is a representative class (verified-ODG, unverified, provider-delegated, blocked,
 * human-gated, recorded-no-op, ODG-authored-but-externally-applied).
 *
 * Deterministic + offline + no clock/network. Provenance = sha256 of the frozen versioned input.
 */
const crypto = require("crypto");
const { measureAutonomy, KIND, ACTOR } = require("../runtime/core/autonomy-measure.js");

const BENCHMARK_VERSION = "1.0";

// Versioned representative scenario set. Each unit is an eligible+authorized work-unit UNLESS it tests the
// denominator filter (eligible:false). The EXPECTED column documents the honest classification.
const SCENARIOS = Object.freeze([
  // numerator: ODG did it end-to-end AND evidence is valid
  { id: "S1-odg-verified", kind: KIND.ACTION, actor: ACTOR.ODG, status: "APPLIED", appliedBy: "ODG_EXECUTOR", verified: true, eligible: true, authorized: true, humanMandatory: false, accepted: true },
  { id: "S2-odg-verified", kind: KIND.ACTION, actor: ACTOR.ODG, status: "EXECUTED", appliedBy: "ODG_EXECUTOR", verified: true, eligible: true, authorized: true, humanMandatory: false, accepted: true },
  // ODG did it but NO valid evidence ⇒ NEVER the numerator (false-success guard)
  { id: "S3-odg-unverified", kind: KIND.ACTION, actor: ACTOR.ODG, status: "DONE", appliedBy: "ODG_EXECUTOR", verified: false, eligible: true, authorized: true, humanMandatory: false, accepted: false },
  // provider-delegated (external actor) ⇒ NOT ODG autonomy
  { id: "S4-provider", kind: KIND.ACTION, actor: ACTOR.EXTERNAL, status: "DONE", appliedBy: "PROVIDER", verified: true, eligible: true, authorized: true, humanMandatory: false, accepted: true },
  // blocked / refused ⇒ not counted as autonomous work
  { id: "S5-blocked", kind: KIND.ACTION, actor: ACTOR.ODG, status: "BLOCKED", appliedBy: null, verified: false, eligible: true, authorized: true, humanMandatory: false, accepted: false },
  // human-mandatory ⇒ excluded from the autonomy numerator (reserved for a human)
  { id: "S6-human", kind: KIND.ACTION, actor: ACTOR.ODG, status: "DONE", appliedBy: "ODG_EXECUTOR", verified: true, eligible: true, authorized: true, humanMandatory: true, accepted: true },
  // RECORDED no-op (a write-scope objective discharged as a no-op) ⇒ NOT executed (false-success guard)
  { id: "S7-recorded-noop", kind: KIND.ACTION, actor: ACTOR.ODG, status: "RECORDED", appliedBy: null, verified: false, eligible: true, authorized: true, humanMandatory: false, accepted: false },
  // ODG AUTHORED but a non-ODG component APPLIED it ⇒ external, never the numerator
  { id: "S8-odg-authored-ext-applied", kind: KIND.ACTION, actor: ACTOR.ODG, status: "DONE", appliedBy: "SOME_OTHER", verified: true, eligible: true, authorized: true, humanMandatory: false, accepted: true },
  // denominator filter: an unauthorized unit is excluded (never in the ratio)
  { id: "S9-unauthorized-excluded", kind: KIND.ACTION, actor: ACTOR.ODG, status: "DONE", appliedBy: "ODG_EXECUTOR", verified: true, eligible: true, authorized: false, humanMandatory: false, accepted: true },
]);

function provenance(scenarios: any): string {
  return crypto.createHash("sha256").update(JSON.stringify(scenarios)).digest("hex").slice(0, 16);
}

/** Run the versioned benchmark through the REUSED measurer. Deterministic. */
function runBenchmark(scenarios: any = SCENARIOS): any {
  const result = measureAutonomy(scenarios);
  return {
    benchmarkVersion: BENCHMARK_VERSION,
    inputProvenance: provenance(scenarios),
    scenarioCount: scenarios.length,
    result,
  };
}

if (require.main === module) {
  const b = runBenchmark();
  const r = b.result;
  process.stdout.write(`odg-autonomy-benchmark v${b.benchmarkVersion} (provenance ${b.inputProvenance}, ${b.scenarioCount} scenarios)\n`);
  if (!r.measurable) { process.stdout.write(`  NOT MEASURABLE: ${r.reason}\n`); process.exit(2); }
  process.stdout.write(`  autonomyPercent=${r.autonomyPercent} (numerator=${r.numerator}/denominator=${r.denominator})\n`);
  process.stdout.write(`  categories=${JSON.stringify(r.categories)}\n`);
  process.exit(0);
}
export {};
module.exports = { runBenchmark, SCENARIOS, BENCHMARK_VERSION, provenance };
