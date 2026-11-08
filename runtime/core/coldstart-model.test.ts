#!/usr/bin/env node
"use strict";
const assert = require("assert");
const M = require("./coldstart-model");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5-E / COLDSTART MODEL");
// correctness gates adoption: a faster but unsafe strategy is NOT adoptable.
{
  const unsafe = M.projectGate({ suiteCount: 369, coldStartMs: 180, workMs: 80, workers: 7, cores: 8, correctnessPreserved: false });
  const safe = M.projectGate({ suiteCount: 369, coldStartMs: 1850, workMs: 80, workers: 7, cores: 8, correctnessPreserved: true });
  check(unsafe.parallelMs < safe.parallelMs, "bundled strategy is faster on paper");
  check(unsafe.adoptable === false && safe.adoptable === true, "but only the correctness-preserving strategy is ADOPTABLE (§4)");
}
// worker cap at cores.
{
  const p = M.projectGate({ suiteCount: 100, coldStartMs: 1000, workers: 20, cores: 8, correctnessPreserved: true });
  check(p.effectiveWorkers === 8 && p.reasons.some((r: any) => /capped/.test(r)), "workers capped at cores (no over-subscription)");
}
check(M.recommendWorkers(8) === 7, "recommendWorkers leaves one core for OS");
check(M.recommendWorkers(1) === 1, "min 1 worker");
// compareStrategies picks the best ADOPTABLE, not the fastest overall.
{
  const c = M.compareStrategies({ suiteCount: 369, workMs: 80, cores: 8 });
  check(c.bestAdoptable.strategy === "TSX_PER_SUITE", "best ADOPTABLE = TSX_PER_SUITE (bundled rejected)");
  check(c.ranked.find((r: any) => r.strategy === "NODE_BUNDLED").adoptable === false, "NODE_BUNDLED marked not adoptable");
  check(c.recommendedWorkers === 7, "recommends 7 workers on 8 cores");
}
// reconciliation: serial ≈ 683s for 369 suites at 1.85s.
{
  const p = M.projectGate({ suiteCount: 369, coldStartMs: 1850, workMs: 0, workers: 1, cores: 8, correctnessPreserved: true });
  check(Math.abs(p.serialMs - 682650) < 1, `serial ≈ 683s (got ${p.serialMs}ms)`);
}
check(M.COLDSTART_MODEL_CONTRACT.invariants.some((i: any) => /speed never excuses masking/i.test(i)), "contract: speed never excuses masking");
console.log(failures === 0 ? "ALL PASS — V5-E COLDSTART MODEL" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
