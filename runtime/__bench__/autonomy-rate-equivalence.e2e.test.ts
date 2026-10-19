#!/usr/bin/env node
/*
 * LOT autonomy-rate — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, PURE (no fs/network/clock): build:runtime compiles runtime/core/autonomy-rate.ts
 * → runtime/dist/core/autonomy-rate.js; build-dist-closure co-locates its dep (autonomy-measure.js — a TS
 * port) in dist/core so the compiled module resolves require("./autonomy-measure"). buildAutonomyRate is a
 * pure function of its inputs ⇒ BYTE-IDENTICAL across the whole gating matrix.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/autonomy-rate-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "autonomy-rate.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "autonomy-rate.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT autonomy-rate — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/autonomy-rate.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/autonomy-rate.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "autonomy-measure.js")), "prerequisite: dep autonomy-measure.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.buildAutonomyRate === "function" && typeof ts.buildAutonomyRate === "function", "both export buildAutonomyRate");

// A measurable scenario: one eligible+authorized ODG objective, executed + EVIDENCED attribution.
const planObjectives = [{ id: "o1", authorization: { eligible: true, authorized: true } }];
const patchExecution = { mission: "M1", executed: [{ objectiveId: "o1", status: "APPLIED", authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }] };
const attribution = { objectives: [{ objectiveId: "o1", verdict: "EVIDENCED" }] };

const CASES: Array<[string, any]> = [
  ["non-object inputs ⇒ safe defaults", 42],
  ["no patchExecution ⇒ notMeasurable(no artifact)", { planObjectives }],
  ["executed not array ⇒ notMeasurable(no artifact)", { patchExecution: { mission: "M1", executed: "x" }, planObjectives }],
  ["no planObjectives ⇒ notMeasurable(no plan)", { patchExecution }],
  ["incomplete eligibility ⇒ notMeasurable(incomplete)", { patchExecution, planObjectives: [{ id: "o1" }] }],
  ["measurable: eligible+evidenced", { patchExecution, planObjectives, attribution }],
  ["measurable but no attribution ⇒ numerator 0", { patchExecution, planObjectives }],
  ["mission derived from patchExecution.mission", { patchExecution, planObjectives, attribution }],
  ["explicit mission overrides", { mission: "EXPLICIT", patchExecution, planObjectives, attribution }],
  ["sourceArtifacts recorded verbatim", { patchExecution, planObjectives, attribution, sourceArtifacts: [{ path: "a.json", present: true }] }],
  ["runComplete false (declared id not executed)", { patchExecution: { mission: "M1", executed: [] }, planObjectives, attribution }],
];
for (const [label, inputs] of CASES) {
  check(EQ(js.buildAutonomyRate(inputs), ts.buildAutonomyRate(inputs)), `buildAutonomyRate ${label}: BYTE-IDENTICAL`);
}

// Spot-checks on the real shape (not just equality).
const notM = js.buildAutonomyRate({ planObjectives });
check(notM.measure.measurable === false && notM.measure.autonomyPercent === null && /no patch-execution/.test(notM.measure.reason), "notMeasurable shape: measurable false + null percent + reason");
const m = js.buildAutonomyRate({ patchExecution, planObjectives, attribution });
check(m.mission === "M1" && m.description !== undefined && /DESCRIPTIVE ventilation/.test(m.note), "measurable result carries mission + description + honesty note");
check(js.buildAutonomyRate({ mission: "EXPLICIT", patchExecution, planObjectives }).mission === "EXPLICIT", "explicit mission wins over patchExecution.mission");

// evaluateSLO parity (.js ≡ .ts): both export it; identical verdict across WITHIN / BREACH / INSUFFICIENT.
check(typeof js.evaluateSLO === "function" && typeof ts.evaluateSLO === "function", "both export evaluateSLO");
const PROV = { source: "governance/SLO.json#x", authoredBy: "CTO", rationale: "test", declaredAt: "2026-10-18" };
for (const [sli, spec, label] of [
  [{ measurable: true, numerator: 9, denominator: 10 }, { target: 0.8, direction: "atLeast", minSampleN: 5, provenance: PROV }, "WITHIN"],
  [{ measurable: true, numerator: 1, denominator: 10 }, { target: 0.8, minSampleN: 5, provenance: PROV }, "BREACH"],
  [{ measurable: true, numerator: 1, denominator: 1 }, { target: 0.8, minSampleN: 5, provenance: PROV }, "INSUFFICIENT small-sample"],
  [{ measurable: false, reason: "no eligible units" }, { target: 0.8, minSampleN: 5, provenance: PROV }, "INSUFFICIENT measurable:false"],
  [{ measurable: true, numerator: 11, denominator: 10 }, { target: 0.8, minSampleN: 5, provenance: PROV }, "INSUFFICIENT falsified"],
  [{ measurable: true, numerator: 9, denominator: 10 }, { target: 0.8, minSampleN: 5 }, "INSUFFICIENT no-provenance"],
]) {
  check(EQ(js.evaluateSLO(sli, spec), ts.evaluateSLO(sli, spec)), `evaluateSLO ${label}: BYTE-IDENTICAL`);
}

console.log(failures === 0 ? "ALL PASS — LOT autonomy-rate EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
