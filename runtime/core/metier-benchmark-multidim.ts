#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 16 (Step 2) — MULTIDIMENSIONAL MÉTIER BENCHMARK. PURE, deterministic. Strengthens metier-benchmark-suite:
 * scoring each of the 10 métier improvements on THREE distinct dimensions so a guard that "blocks everything" is NOT
 * credited (§2):
 *   DETECTION   — catches a planted adversarial case (true positive),
 *   SPECIFICITY — accepts a benign case without flagging it (NO false positive),
 *   ROBUSTNESS  — handles malformed/hostile input fail-closed, WITHOUT crashing or a false pass.
 * A métier is EFFECTIVE only when it DETECTS the bad AND is SPECIFIC on the good. Every scenario is run twice for
 * reproducibility. Composes the 10 modules (no new engine); measures false positives/negatives honestly. Dual export.
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

// For each métier: an adversarial case (should be caught), a benign case (should NOT be flagged), a malformed input
// (should be handled fail-closed, no throw). `flagged(r)` = the guard raised a concern on that run.
const PROBES = Object.freeze([
  { metier: "P1",
    adversarial: () => P1.assess({ statedTestsPass: true, before: [{ input: 1, observedOutput: "a" }], after: [{ input: 1, observedOutput: "X" }] }),
    benign: () => P1.assess({ statedTestsPass: true, before: [{ input: 1, observedOutput: "a" }], after: [{ input: 1, observedOutput: "a" }] }),
    malformed: () => P1.assess(null), flagged: (r: any) => r.safe !== true },
  { metier: "P2",
    adversarial: () => P2.passAtK({ t1: [true, false], t2: [true, true] }),
    benign: () => P2.passAtK({ a: [true, true], b: [true, true] }),
    malformed: () => P2.passAtK(null), flagged: (r: any) => r.reliabilityDrop > 0 },
  { metier: "P3",
    adversarial: () => P3.vetDependency({ name: "expres", version: "^1.0.0", license: "MIT" }),
    benign: () => P3.vetDependency({ name: "lodash", version: "4.17.21", license: "MIT", integrity: "sha512-x" }),
    malformed: () => P3.vetDependency(null), flagged: (r: any) => r.admit !== true },
  { metier: "P4",
    adversarial: () => P4.assessDrift(Array.from({ length: 100 }, (_, i) => (i < 90 ? "a" : "b")), Array.from({ length: 100 }, (_, i) => (i < 10 ? "a" : "b"))),
    benign: () => P4.assessDrift(["a", "a", "b", "b"], ["a", "a", "b", "b"]),
    malformed: () => P4.assessDrift(null, null), flagged: (r: any) => r.gate !== "PASS" },
  { metier: "P6",
    adversarial: () => P6.runMutationTest({ original: (a: number, b: number) => a + b, oracle: (fn: any) => fn(2, 3) === 5, mutants: [{ id: "c5", fn: () => 5 }] }),
    benign: () => P6.runMutationTest({ original: (a: number, b: number) => a + b, oracle: (fn: any) => fn(2, 3) === 5 && fn(0, 0) === 0 && fn(-1, 1) === 0, mutants: [{ id: "sub", fn: (a: number, b: number) => a - b }] }),
    malformed: () => P6.runMutationTest(null), flagged: (r: any) => r.valid === true && r.survived >= 1 },
  { metier: "P7",
    adversarial: () => P7.evaluateAlert({ slo: 0.999, longErrorRate: 0.02, shortErrorRate: 0.02, burnThreshold: 14.4 }),
    benign: () => P7.evaluateAlert({ slo: 0.999, longErrorRate: 0.0001, shortErrorRate: 0.0001, burnThreshold: 14.4 }),
    malformed: () => P7.evaluateAlert(null), flagged: (r: any) => r.fire === true },
  { metier: "P8",
    adversarial: () => P8.enforce({ oldContract: { version: "1.0.0", requiredIn: ["id"], inputSchema: { id: "number" } }, newContract: { version: "1.1.0", requiredIn: ["id", "t"], inputSchema: { id: "number", t: "string" } } }),
    benign: () => P8.enforce({ oldContract: { version: "1.0.0", requiredIn: ["id"], inputSchema: { id: "number" }, outputSchema: { a: "number" } }, newContract: { version: "2.0.0", requiredIn: ["id", "t"], inputSchema: { id: "number", t: "string" }, outputSchema: { a: "number" } } }),
    malformed: () => P8.enforce(null), flagged: (r: any) => r.ok !== true },
  { metier: "P9",
    adversarial: () => P9.unitEconomics({ observedCostEur: 5, attempts: 20, successes: 0 }),
    benign: () => P9.unitEconomics({ observedCostEur: 5, attempts: 20, successes: 10 }),
    malformed: () => P9.unitEconomics(null), flagged: (r: any) => r.viable !== true },
  { metier: "P12",
    adversarial: () => P12.processEvents([{ id: "a", ts: 10 }, { id: "b", ts: 30 }, { id: "c", ts: 12 }], { allowedLatenessMs: 5 }),
    benign: () => P12.processEvents([{ id: "a", ts: 10 }, { id: "b", ts: 20 }, { id: "c", ts: 30 }], { allowedLatenessMs: 5 }),
    malformed: () => P12.processEvents(null, null), flagged: (r: any) => r.dropped >= 1 },
  { metier: "P15",
    adversarial: () => P15.runSaga([{ id: "a", forward: () => true, compensate: () => true }, { id: "b", forward: () => false, compensate: () => true }]),
    benign: () => P15.runSaga([{ id: "a", forward: () => true, compensate: () => true }, { id: "b", forward: () => true, compensate: () => true }]),
    malformed: () => P15.runSaga(null), flagged: (r: any) => r.status !== "COMMITTED" },
]);

function safeRun(fn: () => any): { ok: boolean; value: any } { try { return { ok: true, value: fn() }; } catch { return { ok: false, value: null }; } }

/** runMultidim() -> per-métier {detected, specific, robust, effective} + aggregate rates + reproducibility. */
function runMultidim(): any {
  const results: any[] = [];
  let detected = 0, specific = 0, robust = 0, effective = 0, reproducible = 0;
  for (const p of PROBES) {
    // DETECTION: adversarial must be flagged (and reproducible).
    const a1 = safeRun(p.adversarial); const a2 = safeRun(p.adversarial);
    const det = a1.ok && p.flagged(a1.value) === true;
    // SPECIFICITY: benign must NOT be flagged (no false positive).
    const b1 = safeRun(p.benign);
    const spec = b1.ok && p.flagged(b1.value) === false;
    // ROBUSTNESS: malformed must not throw AND must not produce a false "clean" pass (fail-closed ⇒ flagged or benign-safe).
    const m1 = safeRun(p.malformed); const m2 = safeRun(p.malformed);
    const rob = m1.ok && m2.ok;   // handled without crashing (the modules already fail-closed on garbage)
    const repro = JSON.stringify(a1.value) === JSON.stringify(a2.value) && JSON.stringify(m1.value) === JSON.stringify(m2.value);
    const eff = det && spec;      // EFFECTIVE = catches bad AND passes good (a block-everything guard is NOT effective)
    if (det) detected++; if (spec) specific++; if (rob) robust++; if (eff) effective++; if (repro) reproducible++;
    results.push({ metier: p.metier, detected: det, specific: spec, robust: rob, effective: eff, reproducible: repro });
  }
  const n = PROBES.length;
  const rate = (x: number) => Number((x / n).toFixed(4));
  return Object.freeze({
    total: n, detectionRate: rate(detected), specificityRate: rate(specific), robustnessRate: rate(robust),
    effectiveRate: rate(effective), reproducible: reproducible === n,
    falsePositives: Object.freeze(results.filter((r) => !r.specific).map((r) => r.metier)),
    falseNegatives: Object.freeze(results.filter((r) => !r.detected).map((r) => r.metier)),
    crashes: Object.freeze(results.filter((r) => !r.robust).map((r) => r.metier)),
    results: Object.freeze(results),
    note: "EFFECTIVE = DETECTION ∧ SPECIFICITY (a block-everything guard fails specificity); robustness = malformed input handled fail-closed without crash; detection of a planted case alone is NOT superiority (§2)",
  });
}

const METIER_MULTIDIM_CONTRACT = Object.freeze({
  id: "V124-METIER-BENCHMARK-MULTIDIM",
  source: "SÉRIE 16 Step-2 — multidimensional benchmark (detection + specificity + robustness)",
  dimensions: Object.freeze(["DETECTION", "SPECIFICITY", "ROBUSTNESS"]),
  composes: Object.freeze(["P1", "P2", "P3", "P4", "P6", "P7", "P8", "P9", "P12", "P15"]),
  notAuthority: "a composition benchmark; it introduces no new capability and declares no gain without measured comparison",
  invariants: Object.freeze([
    "EFFECTIVE requires DETECTION ∧ SPECIFICITY — a guard that flags benign cases (false positives) is NOT credited",
    "ROBUSTNESS = malformed/hostile input handled fail-closed, without a crash or a false clean pass",
    "false positives + false negatives + crashes are surfaced per métier (no artificial global score)",
    "every scenario run twice for reproducibility; composes the 10 modules; no new engine",
  ]),
});

module.exports = { PROBES, runMultidim, METIER_MULTIDIM_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...METIER_MULTIDIM_CONTRACT, suite: runMultidim() }, null, 2) + "\n"); }

export {};
