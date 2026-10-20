#!/usr/bin/env node
/* TS source (tsx-run). Lot E of ODG_TOOL_EXCELLENCE_AND_ROADMAP_COMPLETION_V1. */
"use strict";
/*
 * ODG TOOL-EXCELLENCE PERF BASELINE (master Lot E) — a REPRODUCIBLE micro-benchmark of the PURE paths this
 * master mission touched/created: objective-authorization.stampObjectives (Lot A), financial-reconciliation
 * .reconcile (Lot D path), compliance-evidence-pack.buildEvidencePack (Lot F). REUSES latency-measure.js
 * (percentiles + the anti-illusion "thin sample ⇒ not generalizable" guard) — NO new measurement engine.
 *
 * HONEST SCOPE (stated, not implied): this is a warm-process, single-machine MICRO-benchmark of pure
 * in-memory functions. It establishes a reproducible LOCAL baseline (p50/p95). It is NOT an SLA, NOT a
 * cross-machine claim, and NOT a "world-class" verdict — latency-measure flags any sub-minN run as
 * descriptive-only. No clock-sensitive assertion, no network, no fs writes unless --out is given.
 */
const path = require("path");
const ROOT = process.cwd();
const LM: any = require(path.join(ROOT, "runtime", "core", "latency-measure.js"));
const OA: any = require(path.join(ROOT, "runtime", "core", "objective-authorization.js"));
const FR: any = require(path.join(ROOT, "runtime", "core", "financial-reconciliation.js"));
const EU: any = require(path.join(ROOT, "runtime", "core", "economic-unit.js"));
const CEP: any = require(path.join(ROOT, "runtime", "core", "compliance-evidence-pack.js"));

const BENCH_VERSION = "1.0";
function argN(name: string, def: number): number { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def; }
const ITERS = Math.max(1, argN("--iters", 300));
const WARMUP = Math.max(0, argN("--warmup", 50));

const eur = (n: number) => EU.quantity("EUR", "ASSET", n, 2);
// Representative, fixed inputs (no randomness — reproducible).
const OBJECTIVES = [
  { id: "o1", goal: "refactor the mission loader for clarity" },
  { id: "o2", goal: "deploy the service to production" },
  { id: "o3", goal: "pay the supplier invoice" },
  { id: "o4", goal: "add a unit test for the parser" },
];
const RECON = { signed: eur(1100000), invoiced: eur(400000), collected: eur(400000), costs: eur(150000), pipeline: eur(2000000) };
const LOCK = { "": { version: "1.0.0" }, "node_modules/a": { version: "1.0.0" }, "node_modules/b": { version: "2.0.0" }, "node_modules/c": { version: "3.0.0" } };
const PACK_IN = { repoName: "bench", sourceCommit: "deadbeef", lockPackages: LOCK, artifactName: "bench@1", artifactBytes: "ARTIFACT-BENCH" };

const CASES: Array<{ name: string; fn: () => void }> = [
  { name: "objective-authorization.stampObjectives(4)", fn: () => OA.stampObjectives(OBJECTIVES) },
  { name: "financial-reconciliation.reconcile", fn: () => FR.reconcile(RECON) },
  { name: "compliance-evidence-pack.buildEvidencePack(unsigned)", fn: () => CEP.buildEvidencePack(PACK_IN) },
];

function sampleMs(fn: () => void): number { const t0 = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t0) / 1e6; }

const report: any = { _type: "odg/tool-excellence-perf-baseline/v1", benchVersion: BENCH_VERSION, iters: ITERS, warmup: WARMUP, node: process.version, cases: {} };
console.log("======================================");
console.log("ODG TOOL-EXCELLENCE PERF BASELINE (micro-benchmark — local, warm process; NOT an SLA)");
console.log(`iters=${ITERS} warmup=${WARMUP} node=${process.version}`);
console.log("======================================");
for (const c of CASES) {
  for (let i = 0; i < WARMUP; i++) c.fn();            // JIT warmup — excluded from samples
  const samples: number[] = [];
  for (let i = 0; i < ITERS; i++) samples.push(sampleMs(c.fn));
  const s = LM.summarizeSamples(samples, 20);          // anti-illusion: <20 ⇒ descriptive only
  report.cases[c.name] = s;
  if (s.measurable) console.log(`${c.name}\n  n=${s.n} p50=${s.medianMs.toFixed(4)}ms p95=${s.p95Ms.toFixed(4)}ms min=${s.minMs.toFixed(4)} max=${s.maxMs.toFixed(4)} (generalizable within this host)`);
  else console.log(`${c.name}\n  NOT GENERALIZABLE — ${s.reason}`);
}
const outI = process.argv.indexOf("--out");
if (outI >= 0 && process.argv[outI + 1]) { require("fs").writeFileSync(process.argv[outI + 1], JSON.stringify(report, null, 2)); console.log("\nwritten:", process.argv[outI + 1]); }
console.log("======================================");
export {};
