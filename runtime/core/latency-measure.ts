/**
 * latency-measure — per-mission-category latency summary (CTO §3 / §5.2: median + p95 + uncertainty).
 *
 * PURE: samples in (ms), summary out. No clock/fs/network. This is the MEASUREMENT half of the MISSION_LATENCY
 * SLO (slo-targets): the target stays null (measurement-only) until a real baseline is observed — this module
 * computes that baseline honestly, and refuses to generalize a thin sample (INSUFFICIENT_EVIDENCE below minN),
 * mirroring the anti-illusion discipline in `evaluateSLO`.
 *
 * Percentile: inclusive linear interpolation (type-7 / Excel PERCENTILE.INC) on the sorted sample.
 */

function percentile(sortedAsc: any, p: any): any {
  const a = Array.isArray(sortedAsc) ? sortedAsc : [];
  const n = a.length;
  if (n === 0) return null;
  if (n === 1) return a[0];
  const clamp = p < 0 ? 0 : p > 1 ? 1 : p;
  const rank = clamp * (n - 1); // 0-based fractional index
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return a[lo];
  const frac = rank - lo;
  return a[lo] + (a[hi] - a[lo]) * frac;
}

/**
 * Summarize one array of latency samples (ms). Returns n/min/median/p95/max, OR a measurable:false view with
 * INSUFFICIENT_EVIDENCE when the sample is empty, non-finite-polluted, or below minSampleN. Negative/NaN samples
 * are rejected as falsified (never silently dropped into a misleading median).
 */
function summarizeSamples(samplesMs: any, minSampleN: any = 20): any {
  const raw = Array.isArray(samplesMs) ? samplesMs : null;
  if (!raw) return { measurable: false, reason: "samples is not an array", n: 0 };
  // Reject falsified data rather than coerce it (invariant: no misleading number).
  for (const x of raw) {
    if (typeof x !== "number" || !Number.isFinite(x) || x < 0) {
      return { measurable: false, reason: `falsified sample (${String(x)}) — not a finite non-negative ms`, n: raw.length };
    }
  }
  const n = raw.length;
  if (n === 0) return { measurable: false, reason: "empty sample", n: 0 };
  const sorted = raw.slice().sort((x: any, y: any) => x - y);
  const summary = {
    n,
    minMs: sorted[0],
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted[n - 1],
  };
  if (n < minSampleN) {
    // The numbers are computable but NOT generalizable — expose them as DESCRIPTIVE with an explicit flag.
    return { measurable: false, reason: `sample N=${n} below minimum ${minSampleN} — descriptive only`, descriptive: summary, n };
  }
  return { measurable: true, reason: null, ...summary, uncertainty: { minSampleN, generalizable: true } };
}

/**
 * Summarize latency per mission category: { categoryName: number[] (ms) } -> { categoryName: summary }.
 * Each category is summarized independently (a category below minN is INSUFFICIENT_EVIDENCE, not borrowed from
 * another category's sample).
 */
function summarizeLatencyByCategory(samplesByCategory: any, minSampleN: any = 20): any {
  const src = samplesByCategory && typeof samplesByCategory === "object" && !Array.isArray(samplesByCategory) ? samplesByCategory : {};
  const out: any = {};
  for (const cat of Object.keys(src)) out[cat] = summarizeSamples(src[cat], minSampleN);
  return out;
}

module.exports = { percentile, summarizeSamples, summarizeLatencyByCategory };
export {};
