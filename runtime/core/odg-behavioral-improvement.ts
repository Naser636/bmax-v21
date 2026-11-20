#!/usr/bin/env node
"use strict";
/*
 * V327 §2 — BEHAVIORAL-IMPROVEMENT MEASUREMENT (does accumulated experience actually improve decisions, or just pile up?).
 * PURE, deterministic, fail-closed, read-only over the EXISTING native-build-outcome store (NO parallel memory). The
 * calibrated-P gives a POINT reliability and belief-refresh gives AGE-based staleness; neither answers the directive's core
 * question: across SUCCESSIVE missions of the same class, is ODG getting better, plateauing, or REGRESSING? Accumulating
 * data is not learning — this measures the behavioral trend and flags memory that is not paying off.
 *
 * measureImprovement(orderedOutcomes, opts): over a key's VERIFIED SUCCESS/FAILURE outcomes in append order, split into an
 * EARLY and a RECENT window and compare acceptance rates; detect a RECURRING failure signature (the same failure repeating
 * = stuck / a false rule learned, not improvement). Verdict: IMPROVING | PLATEAU | PLATEAU_LOW | REGRESSING |
 * INSUFFICIENT_DATA, with honest sample sizes and a recommendation (trust / re-probe / escalate). No clock/network
 * (ordering is the given append order; `at` optional and not required).
 */

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const MIN_PER_WINDOW = 5;          // each of early/recent must have ≥ this many verified outcomes (else INSUFFICIENT_DATA)
const DELTA = 0.2;                 // |recentRate - earlyRate| ≥ this is a meaningful trend (else PLATEAU)
const LOW_RATE = 0.5;              // a plateau at/below this is PLATEAU_LOW (memory not producing results)
const RECUR_MIN = 3;               // a failure signature repeating ≥ this in the recent window = recurring error / false rule

function signatureOf(o: any): string {
  if (!isObj(o)) return "UNSPECIFIED";
  for (const k of ["reason", "why", "signature", "evidence"]) if (typeof o[k] === "string" && o[k]) return o[k];
  return "UNSPECIFIED";
}

/**
 * measureImprovement(outcomes, opts?) -> frozen verdict. outcomes: native-build-outcome records
 *   [{ type, outcome:"SUCCESS"|"FAILURE"|"UNKNOWN", independentlyVerified, reason?/evidence?, at? }] in APPEND order.
 *   opts: { key? (scope to a native-build class `type`), minPerWindow?, delta?, recurMin? }.
 * Only INDEPENDENTLY-VERIFIED SUCCESS/FAILURE are counted (UNKNOWN censored — never a fabricated trend).
 */
function measureImprovement(outcomes: any, opts: any = {}): any {
  const o = isObj(opts) ? opts : {};
  const minW = Number.isFinite(o.minPerWindow) && o.minPerWindow > 0 ? Math.floor(o.minPerWindow) : MIN_PER_WINDOW;
  const delta = Number.isFinite(o.delta) && o.delta > 0 ? o.delta : DELTA;
  const recurMin = Number.isFinite(o.recurMin) && o.recurMin > 0 ? Math.floor(o.recurMin) : RECUR_MIN;
  const wantKey = typeof o.key === "string" ? o.key : null;
  const all = Array.isArray(outcomes) ? outcomes.filter(isObj) : [];
  const scoped = wantKey === null ? all : all.filter((x: any) => x.type === wantKey);
  // keep verified decided outcomes, in order (UNKNOWN / unverified censored)
  const decided = scoped.filter((x: any) => (x.outcome === "SUCCESS" || x.outcome === "FAILURE") && x.independentlyVerified === true);

  if (decided.length < minW * 2)
    return freeze({ verdict: "INSUFFICIENT_DATA", improving: false, samples: freeze({ decided: decided.length, needed: minW * 2 }), earlyRate: null, recentRate: null, delta: null, recurringFailure: null, recommendation: "accumulate more verified outcomes before trusting a trend (fail-closed)", note: `need ≥${minW * 2} verified outcomes; have ${decided.length}` });

  const half = Math.floor(decided.length / 2);
  const early = decided.slice(0, half);
  const recent = decided.slice(decided.length - half); // the most recent `half` (ignores a middle odd item)
  const rate = (w: any[]) => w.filter((x) => x.outcome === "SUCCESS").length / w.length;
  const earlyRate = rate(early), recentRate = rate(recent);
  const d = recentRate - earlyRate;

  // recurring-failure signature in the recent window (stuck / a false rule — same failure, no learning)
  const recentFails = recent.filter((x) => x.outcome === "FAILURE");
  const counts: any = {};
  for (const f of recentFails) { const s = signatureOf(f); counts[s] = (counts[s] || 0) + 1; }
  let topSig: any = null, topN = 0;
  for (const s of Object.keys(counts)) if (counts[s] > topN) { topN = counts[s]; topSig = s; }
  const recurringFailure = topN >= recurMin ? freeze({ signature: topSig, count: topN, ofRecent: recent.length }) : null;

  let verdict: string, recommendation: string, improving = false;
  if (d >= delta) { verdict = "IMPROVING"; improving = true; recommendation = "memory is paying off — trust the calibrated belief; keep executing locally"; }
  else if (d <= -delta) { verdict = "REGRESSING"; recommendation = "recent outcomes are WORSE than early ones — a false rule may have formed or the class got harder; RE-PROBE / escalate rather than trust the old belief"; }
  else if (recentRate <= LOW_RATE) { verdict = "PLATEAU_LOW"; recommendation = "flat and low — accumulating more local attempts is not improving results (memory cost > gain); ESCALATE or decompose"; }
  else { verdict = "PLATEAU"; recommendation = "flat but acceptable — trust the belief; no extra probing needed"; }

  return freeze({
    verdict, improving,
    earlyRate: Number(earlyRate.toFixed(4)), recentRate: Number(recentRate.toFixed(4)), delta: Number(d.toFixed(4)),
    recurringFailure,
    samples: freeze({ decided: decided.length, earlyN: early.length, recentN: recent.length }),
    recommendation,
    note: recurringFailure ? `trend ${verdict}; a recurring failure signature repeats ${topN}× in the recent window (possible false rule / stuck) — treat the belief as behaviorally obsolete` : `trend ${verdict} (early ${earlyRate.toFixed(2)} → recent ${recentRate.toFixed(2)})`,
  });
}

const BEHAVIORAL_IMPROVEMENT_CONTRACT = Object.freeze({
  id: "V327-BEHAVIORAL-IMPROVEMENT",
  purpose: "§2 — measure whether accumulated experience actually IMPROVES decisions across successive missions (behavioral trend), not merely grows: early-vs-recent acceptance rate + recurring-failure (false-rule) detection; flags memory that is not paying off (PLATEAU_LOW/REGRESSING) so decisions can re-probe/escalate",
  reuses: Object.freeze(["native-build-outcome accumulated outcomes (read-only; NO parallel memory)", "complements odg-calibrated-psuccess (point reliability) and odg-belief-refresh (age staleness) — this is TREND, a distinct facet of obsolescence"]),
  invariants: Object.freeze([
    "only INDEPENDENTLY-VERIFIED SUCCESS/FAILURE counted; UNKNOWN censored — no fabricated trend",
    "INSUFFICIENT_DATA until ≥ 2×minPerWindow verified outcomes (fail-closed; a trend is never asserted from thin data)",
    "measures improvement, not just quantity: IMPROVING only on a meaningful positive delta; PLATEAU_LOW/REGRESSING explicitly flag memory whose cost exceeds its gain",
    "recurring-failure signature detection surfaces a learned FALSE rule / stuck class (same failure repeating) ⇒ behaviorally obsolete ⇒ re-probe/escalate",
    "PURE/deterministic/frozen; read-only over the existing store; no clock/network (append order; `at` optional)",
  ]),
});

module.exports = { measureImprovement, signatureOf, BEHAVIORAL_IMPROVEMENT_CONTRACT };
export {};
