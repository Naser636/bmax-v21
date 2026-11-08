#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 22 (cross-cutting EVAL INTEGRITY — world-research gap) — STATISTICAL SIGNIFICANCE / UNCERTAINTY. PURE,
 * deterministic, CLOSED-FORM (no bootstrap, no random, no clock). World reference: the 2026 reporting standards
 * require every eval claim to carry its sampling uncertainty — STREAM (arXiv 2508.09853, Aug-2026): "the evaluation
 * summary MUST include an appropriate measure of statistical uncertainty (a confidence interval or standard error)";
 * Rank-Intervals / Ranking-Uncertainty (arXiv 2606.08679 / 2607.16259, 2026): "overlapping confidence intervals mean
 * benchmarks cannot determine which model is better". ODG computes point estimates everywhere (capability-taxonomy
 * .computeVerifiedSuccessRate even emits the literal unfulfilled string "report confidence interval") but NO module
 * attaches an error bar or tests whether a measured delta exceeds sampling noise (grep-verified absent). This supplies
 * the closed-form primitives — Wilson 95% score interval, two-proportion z-test, paired McNemar — so a rate is
 * reported WITH its interval and a delta is credited as an improvement ONLY when it is statistically significant.
 * Composes capability-taxonomy / eval-metrics / k-eval / improvement-baseline outputs; hardens champion-challenger
 * (whose strictlyBeats is direction-only). Fail-closed: n=0 ⇒ NO_DATA; CI includes 0 ⇒ INCONCLUSIVE. Dual export.
 */

const Z95 = 1.959963984540054;      // standard normal 97.5th percentile (two-sided 95%)
const CHISQ_1DF_95 = 3.841458820694124; // χ² critical, 1 df, α=0.05 (McNemar)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function round(n: number): number { return Number(n.toFixed(6)); }
function validCount(s: any, n: any): boolean { return Number.isFinite(s) && Number.isFinite(n) && n > 0 && s >= 0 && s <= n; }

/** wilsonInterval(successes, n) -> { rate, lo, hi, halfWidth, n, verdict }. Fail-closed: n<=0 or invalid ⇒ NO_DATA. */
function wilsonInterval(successes: any, n: any): any {
  if (!validCount(successes, n)) return Object.freeze({ rate: null, lo: null, hi: null, halfWidth: null, n: Number.isFinite(n) ? n : 0, verdict: "NO_DATA", note: "n must be > 0 and 0 <= successes <= n (fail-closed)" });
  const p = successes / n; const z2 = Z95 * Z95; const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (Z95 / denom) * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));
  const lo = Math.max(0, center - margin); const hi = Math.min(1, center + margin);
  return Object.freeze({ rate: round(p), lo: round(lo), hi: round(hi), halfWidth: round((hi - lo) / 2), n, verdict: "OK", note: "Wilson 95% score interval (closed-form)" });
}

/** twoProportionZ(a{successes,n}, b{successes,n}) -> unpaired difference-CI + z-test. verdict DIFFERENT|INCONCLUSIVE|NO_DATA. */
function twoProportionZ(a: any, b: any): any {
  const A = isObj(a) ? a : {}; const B = isObj(b) ? b : {};
  if (!validCount(A.successes, A.n) || !validCount(B.successes, B.n)) return Object.freeze({ diff: null, z: null, ciLo: null, ciHi: null, significant: false, verdict: "NO_DATA", note: "both groups need n>0 and valid successes (fail-closed)" });
  const p1 = A.successes / A.n; const p2 = B.successes / B.n; const diff = p1 - p2;
  const seDiff = Math.sqrt(p1 * (1 - p1) / A.n + p2 * (1 - p2) / B.n);
  const ciLo = diff - Z95 * seDiff; const ciHi = diff + Z95 * seDiff;
  const pooled = (A.successes + B.successes) / (A.n + B.n);
  const sePool = Math.sqrt(pooled * (1 - pooled) * (1 / A.n + 1 / B.n));
  const z = sePool > 0 ? diff / sePool : 0;
  const significant = ciLo > 0 || ciHi < 0;   // 95% difference-CI excludes 0
  return Object.freeze({ diff: round(diff), z: round(z), ciLo: round(ciLo), ciHi: round(ciHi), significant, verdict: significant ? "DIFFERENT" : "INCONCLUSIVE", direction: diff > 0 ? "a>b" : diff < 0 ? "a<b" : "equal", note: "two-proportion z-test + 95% difference CI (unpaired)" });
}

/** mcnemarPaired(beforeBools, afterBools) -> paired test on the SAME cases. verdict SIGNIFICANT|INCONCLUSIVE*|NO_CHANGE|NO_DATA. */
function mcnemarPaired(beforeBools: any, afterBools: any): any {
  const bf = Array.isArray(beforeBools) ? beforeBools : null; const af = Array.isArray(afterBools) ? afterBools : null;
  if (!bf || !af || bf.length === 0 || bf.length !== af.length) return Object.freeze({ b: 0, c: 0, chiSq: null, significant: false, verdict: "NO_DATA", note: "need two equal-length non-empty paired boolean arrays (fail-closed)" });
  let b = 0; let c = 0;   // b: before pass & after fail (regressed); c: before fail & after pass (fixed)
  for (let i = 0; i < bf.length; i++) { const bv = bf[i] === true; const av = af[i] === true; if (bv && !av) b++; else if (!bv && av) c++; }
  const nDisc = b + c;
  if (nDisc === 0) return Object.freeze({ b, c, chiSq: 0, significant: false, verdict: "NO_CHANGE", direction: "none", note: "no discordant pairs — the two precisions agree on every case" });
  const chiSq = Math.pow(Math.abs(b - c) - 1, 2) / nDisc;   // continuity-corrected McNemar
  const significant = chiSq > CHISQ_1DF_95;
  const lowPower = nDisc < 10;
  return Object.freeze({ b, c, chiSq: round(chiSq), significant, verdict: significant ? "SIGNIFICANT" : (lowPower ? "INCONCLUSIVE_LOW_POWER" : "INCONCLUSIVE"), direction: c > b ? "improved" : c < b ? "regressed" : "balanced", note: "paired McNemar χ² (1 df, continuity-corrected); α=0.05 critical 3.8415" });
}

/** significanceGate({before, after}) -> is a measured delta a REAL improvement (not noise)? Fail-closed to INCONCLUSIVE.
 * paired per-case arrays (before.cases/after.cases) ⇒ McNemar; else counts {successes,n} ⇒ two-proportion z. */
function significanceGate(input: any): any {
  const o = isObj(input) ? input : {}; const before = isObj(o.before) ? o.before : {}; const after = isObj(o.after) ? o.after : {};
  if (Array.isArray(before.cases) && Array.isArray(after.cases)) {
    const m = mcnemarPaired(before.cases, after.cases);
    if (m.verdict === "NO_DATA") return gate("NO_DATA", false, "mcnemar", m, "insufficient paired data");
    const improvement = m.significant && m.direction === "improved";
    const regression = m.significant && m.direction === "regressed";
    return gate(improvement ? "IMPROVEMENT" : regression ? "REGRESSION" : "INCONCLUSIVE", m.significant, "mcnemar", m, improvement ? "significant paired improvement" : regression ? "significant paired regression" : "delta not distinguishable from noise at this N");
  }
  const t = twoProportionZ({ successes: after.successes, n: after.n }, { successes: before.successes, n: before.n });
  if (t.verdict === "NO_DATA") return gate("NO_DATA", false, "two-proportion-z", t, "insufficient data (n=0)");
  const improvement = t.significant && t.diff > 0;   // after − before > 0 and CI excludes 0
  const regression = t.significant && t.diff < 0;
  return gate(improvement ? "IMPROVEMENT" : regression ? "REGRESSION" : "INCONCLUSIVE", t.significant, "two-proportion-z", t, improvement ? "significant improvement (95% diff-CI excludes 0)" : regression ? "significant regression" : "95% difference CI includes 0 — not an improvement, only noise");
}

function gate(verdict: string, significant: boolean, method: string, detail: any, reason: string): any { return Object.freeze({ verdict, significant, method, detail, reason }); }

const EVAL_SIGNIFICANCE_CONTRACT = Object.freeze({
  id: "V124-EVAL-SIGNIFICANCE",
  source: "SÉRIE 22 eval-integrity — statistical uncertainty (STREAM arXiv 2508.09853; rank-intervals 2606.08679/2607.16259, 2026)",
  reuses: Object.freeze(["capability-taxonomy.computeVerifiedSuccessRate (fulfils its 'report confidence interval')", "eval-metrics.confusionMatrix", "k-eval.runBeforeAfter (paired)", "improvement-baseline.measureDelta", "hardens champion-challenger-arbiter (direction-only ⇒ significance-gated)"]),
  notAuthority: "reports closed-form intervals/tests; it takes no decision and fabricates no data",
  invariants: Object.freeze([
    "a success rate is reported WITH its Wilson 95% interval; n=0 ⇒ NO_DATA (never a fabricated rate or CI)",
    "a measured delta is an IMPROVEMENT only when statistically significant (95% difference-CI excludes 0, or paired McNemar χ²>3.8415) AND positively directed; else INCONCLUSIVE — noise is never a win",
    "paired before/after on the SAME cases uses McNemar (the correct paired test); independent groups use the two-proportion z-test",
    "closed-form only (Wilson score + two-proportion z + continuity-corrected McNemar); no bootstrap, no random, no clock; fail-closed on invalid counts",
  ]),
});

module.exports = { wilsonInterval, twoProportionZ, mcnemarPaired, significanceGate, EVAL_SIGNIFICANCE_CONTRACT, Z95, CHISQ_1DF_95 };

if (require.main === module) {
  process.stdout.write(JSON.stringify({ ...EVAL_SIGNIFICANCE_CONTRACT, demo: { wilson: wilsonInterval(18, 20), gate: significanceGate({ before: { successes: 10, n: 20 }, after: { successes: 18, n: 20 } }).verdict } }, null, 2) + "\n");
}

export {};
