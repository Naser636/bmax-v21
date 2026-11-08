#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P = require("./performance-observability");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5-E WAVE-2 / PERFORMANCE OBSERVABILITY");
// record run captures dimensions.
{
  const r = P.recordRun({ durationSamples: [187, 190, 188], cpuSamples: [50, 55, 52], memSamples: [400, 410], workers: 7, coldStartMs: 1850, suiteCount: 377 });
  check(r.duration.status === "MEASURED" && r.duration.p50 === 188 && r.workers === 7, "records duration P50 + workers");
  check(r.cpu.status === "MEASURED" && r.memory.status === "MEASURED", "records CPU + memory");
}
// reproducible gain (low variance, enough samples) ⇒ credited.
{
  const r = P.compareReproducible({ before: { durationSamples: [187, 190, 188, 186] }, after: { durationSamples: [5.3, 5.1, 5.4, 5.2] } });
  check(r.reproducible === true && r.met75 === true && r.reductionPct > 90, `reproducible ~97% gain credited (got ${r.reductionPct})`);
}
// too few samples ⇒ NOT_REPRODUCIBLE (not credited).
{
  const r = P.compareReproducible({ before: { durationSamples: [187] }, after: { durationSamples: [5] } });
  check(r.reproducible === false && r.reductionPct === null, "single sample ⇒ NOT_REPRODUCIBLE (not credited)");
}
// high variance ⇒ NOT_REPRODUCIBLE (noisy one-off not credited).
{
  const r = P.compareReproducible({ before: { durationSamples: [100, 400, 120, 380] }, after: { durationSamples: [5, 50, 6, 48] }, maxVarianceRatio: 1.5 });
  check(r.reproducible === false, "high variance ⇒ NOT_REPRODUCIBLE");
}
// variance ratio.
check(P.varianceRatio(P.recordRun({ durationSamples: [100, 100, 100] }).duration) === 1, "stable samples ⇒ variance ratio 1");
check(P.PERFORMANCE_OBSERVABILITY_CONTRACT.invariants.some((i: any) => /noisy one-off is never a credited gain/i.test(i)), "contract: noisy one-off never credited");
console.log(failures === 0 ? "ALL PASS — V5-E WAVE-2 PERFORMANCE OBSERVABILITY" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
