// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention (see autonomy-rate.test.ts).
// latency-measure — correct percentiles, thin-sample ⇒ not generalizable, falsified sample rejected, per-category independence, parity.
const assert = require("assert");
const TS = require("./latency-measure.ts");
const JS = require("./latency-measure.js");

let n = 0;
const t = (name: any, fn: any) => { fn(); n++; console.log("ok  " + name); };

// 1. Known percentiles (type-7 inclusive interpolation) on 1..10.
t("percentile p50/p95 on 1..10 (interpolated)", () => {
  const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.strictEqual(TS.percentile(a, 0.5), 5.5);          // median of 10 evens
  assert.ok(Math.abs(TS.percentile(a, 0.95) - 9.55) < 1e-9); // 0.95*(9)=8.55 -> a[8]+0.55*(a[9]-a[8])=9+0.55
  assert.strictEqual(TS.percentile(a, 0), 1);
  assert.strictEqual(TS.percentile(a, 1), 10);
  assert.strictEqual(TS.percentile([], 0.5), null);
  assert.strictEqual(TS.percentile([42], 0.95), 42);
});

// 2. Sufficient sample ⇒ measurable with median+p95+uncertainty.
t("sufficient sample ⇒ measurable median+p95", () => {
  const samples = Array.from({ length: 20 }, (_: any, i: any) => (i + 1) * 10); // 10..200
  const s = TS.summarizeSamples(samples, 20);
  assert.strictEqual(s.measurable, true);
  assert.strictEqual(s.n, 20);
  assert.strictEqual(s.minMs, 10);
  assert.strictEqual(s.maxMs, 200);
  assert.ok(s.p95Ms >= s.medianMs);
  assert.strictEqual(s.uncertainty.generalizable, true);
});

// 3. Thin sample ⇒ NOT generalizable (measurable:false) but numbers exposed as descriptive.
t("thin sample ⇒ measurable:false + descriptive (no fake baseline)", () => {
  const s = TS.summarizeSamples([100, 200, 300], 20);
  assert.strictEqual(s.measurable, false);
  assert.ok(/below minimum 20/.test(s.reason));
  assert.ok(s.descriptive && s.descriptive.medianMs === 200);
});

// 4. Falsified sample (negative / NaN / non-number) is rejected, not coerced.
t("falsified sample rejected", () => {
  assert.strictEqual(TS.summarizeSamples([1, -5, 3], 1).measurable, false);
  assert.strictEqual(TS.summarizeSamples([1, NaN, 3], 1).measurable, false);
  assert.strictEqual(TS.summarizeSamples([1, "x", 3], 1).measurable, false);
  assert.strictEqual(TS.summarizeSamples("nope", 1).measurable, false);
  assert.strictEqual(TS.summarizeSamples([], 1).measurable, false);
});

// 5. Per-category independence: a thin category stays INSUFFICIENT; it never borrows another's sample.
t("per-category independence", () => {
  const big = Array.from({ length: 25 }, (_: any, i: any) => i + 1);
  const out = TS.summarizeLatencyByCategory({ engineering: big, research: [5, 6] }, 20);
  assert.strictEqual(out.engineering.measurable, true);
  assert.strictEqual(out.research.measurable, false);
  assert.ok(/below minimum/.test(out.research.reason));
});

// 6. Dual-port parity.
t("TS/JS parity", () => {
  const big = Array.from({ length: 30 }, (_: any, i: any) => (i * 7) % 11);
  assert.deepStrictEqual(TS.summarizeSamples(big, 20), JS.summarizeSamples(big, 20));
  assert.deepStrictEqual(TS.summarizeLatencyByCategory({ a: big, b: [1, 2] }, 20), JS.summarizeLatencyByCategory({ a: big, b: [1, 2] }, 20));
  assert.strictEqual(TS.percentile(big.slice().sort((x: any, y: any) => x - y), 0.95), JS.percentile(big.slice().sort((x: any, y: any) => x - y), 0.95));
});

console.log(`\nALL PASS — latency-measure (${n} tests)`);
