#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 15 (Step 4) — TRANSVERSAL MÉTIER BENCHMARK SUITE. PURE, deterministic. A cross-cutting comparison that measures
 * each of the 10 métier improvements by its DETECTION EFFECTIVENESS — does the guard CATCH a PLANTED adversarial
 * problem? — NOT merely "its own tests pass" (§4 doctrine). For every métier it runs the module twice to verify
 * REPRODUCIBILITY (same input ⇒ identical verdict). It COMPOSES the 10 improvement modules (no new engine) and reports
 * an honest aggregate: detectionRate, reproducible, and any métier that failed to catch its planted case (a regression
 * signal). Dual export.
 */

const P1 = require("./p1-semantic-regression-guard");
const P2 = require("./p2-passk-reliability");
const P3 = require("./p3-dependency-trust-gate");
const P4 = require("./p4-distribution-drift");
const P6 = require("./p6-mutation-testing");
const P7 = require("./p7-burn-rate-alert");
const P8 = require("./p8-semver-enforcement");
const P9 = require("./p9-unit-economics");
const P12 = require("./p12-watermark");
const P15 = require("./p15-saga-compensation");

// Each probe plants an ADVERSARIAL case and returns { detected, run } where detected=true iff the guard caught it.
const PROBES = Object.freeze([
  { metier: "P1", run: () => P1.assess({ statedTestsPass: true, before: [{ input: 1, observedOutput: "a" }, { input: 2, observedOutput: "b" }], after: [{ input: 1, observedOutput: "a" }, { input: 2, observedOutput: "X" }] }), caught: (r: any) => r.verdict === "SEMANTIC_REGRESSION" },
  { metier: "P2", run: () => P2.passAtK({ t1: [true, false, true], t2: [true, true, true] }), caught: (r: any) => r.reliabilityDrop > 0 && r.flaky.includes("t1") },
  { metier: "P3", run: () => P3.vetDependency({ name: "expres", version: "^1.0.0", license: "MIT" }), caught: (r: any) => r.admit === false },
  { metier: "P4", run: () => P4.assessDrift(Array.from({ length: 100 }, (_, i) => (i < 90 ? "a" : "b")), Array.from({ length: 100 }, (_, i) => (i < 10 ? "a" : "b"))), caught: (r: any) => r.gate === "FAIL" },
  { metier: "P6", run: () => P6.runMutationTest({ original: (a: number, b: number) => a + b, oracle: (fn: any) => fn(2, 3) === 5, mutants: [{ id: "const5", fn: () => 5 }] }), caught: (r: any) => r.survived >= 1 },
  { metier: "P7", run: () => P7.evaluateAlert({ slo: 0.999, longErrorRate: 0.02, shortErrorRate: 0.02, burnThreshold: 14.4 }), caught: (r: any) => r.fire === true },
  { metier: "P8", run: () => P8.enforce({ oldContract: { version: "1.0.0", requiredIn: ["id"], inputSchema: { id: "number" } }, newContract: { version: "1.1.0", requiredIn: ["id", "tok"], inputSchema: { id: "number", tok: "string" } } }), caught: (r: any) => r.verdict === "SEMVER_VIOLATION" },
  { metier: "P9", run: () => P9.unitEconomics({ observedCostEur: 5, attempts: 20, successes: 0 }), caught: (r: any) => r.viable === false },
  { metier: "P12", run: () => P12.processEvents([{ id: "a", ts: 10 }, { id: "b", ts: 30 }, { id: "c", ts: 12 }], { allowedLatenessMs: 5 }), caught: (r: any) => r.dropped >= 1 },
  { metier: "P15", run: () => P15.runSaga([{ id: "a", forward: () => true, compensate: () => true }, { id: "b", forward: () => false, compensate: () => true }]), caught: (r: any) => r.status === "COMPENSATED" },
]);

/** runSuite() -> { total, detected, detectionRate, reproducible, results, misses }. */
function runSuite(): any {
  const results: any[] = []; let detected = 0; let reproducible = 0;
  for (const p of PROBES) {
    const r1 = p.run(); const r2 = p.run();
    const didCatch = p.caught(r1) === true;
    const repro = JSON.stringify(r1) === JSON.stringify(r2);
    if (didCatch) detected++;
    if (repro) reproducible++;
    results.push({ metier: p.metier, detected: didCatch, reproducible: repro });
  }
  const total = PROBES.length;
  const misses = results.filter((r) => !r.detected).map((r) => r.metier);
  return Object.freeze({
    total, detected, detectionRate: Number((detected / total).toFixed(4)),
    reproducible: reproducible === total, reproducibleCount: reproducible,
    results: Object.freeze(results), misses: Object.freeze(misses),
    note: "detection = the guard CAUGHT its planted adversarial case (not merely 'its own tests pass', §4); every probe is run twice for reproducibility",
  });
}

const METIER_BENCHMARK_CONTRACT = Object.freeze({
  id: "V124-METIER-BENCHMARK-SUITE",
  source: "SÉRIE 15 Step-4 — transversal métier benchmark (detection effectiveness + reproducibility)",
  composes: Object.freeze(["P1", "P2", "P3", "P4", "P6", "P7", "P8", "P9", "P12", "P15"]),
  notAuthority: "a composition benchmark measuring detection effectiveness; it introduces no new capability",
  invariants: Object.freeze([
    "each métier is scored by whether it CATCHES a planted adversarial case — not by passing its own tests (§4)",
    "every probe is run twice; reproducible iff the two verdicts are byte-identical",
    "a métier that fails to catch its planted case is a MISS (regression signal), surfaced",
    "composes the 10 improvement modules; no new engine",
  ]),
});

module.exports = { PROBES, runSuite, METIER_BENCHMARK_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...METIER_BENCHMARK_CONTRACT, suite: runSuite() }, null, 2) + "\n"); }

export {};
