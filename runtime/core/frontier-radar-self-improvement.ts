#!/usr/bin/env node
"use strict";

/*
 * V5 PHASE 6 / M-CH4-02 (Frontier Radar self-improvement — program §6.6 / D-19). PURE, deterministic. Measures the
 * radar's OWN performance each cycle against supplied ground truth — relevance (precision), noise (false-positive
 * rate), miss rate (known innovations the radar failed to surface) — compares to the prior cycle, and PROPOSES
 * classifier/strategy improvements. Critically (§6.6): the radar may improve its methods but it CANNOT modify its own
 * authorizations — every improvement is PROPOSED (selfAuthorized:false), never self-applied. REUSES meta-intelligence
 * (metric-gaming lens) so the radar cannot claim an improvement that is gamed/contaminated. Fail-closed: insufficient
 * ground truth ⇒ NOT_MEASURED (honest NO_FINDING/NOT_MEASURED taxonomy), never a fabricated improvement. Dual export.
 */

const MI = require("./meta-intelligence");             // assessIntegrity — guard the radar's own improvement claims

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function round(n: number): number { return Number(n.toFixed(4)); }

/**
 * assessRadarCycle({ discoveries, groundTruth, priorMetrics, integritySignals }) ->
 *   { measurable, metrics, deltaVsPrior, proposals, selfAuthorized, note }.
 *   discoveries: [{ id, relevant? }] — what the radar surfaced this cycle (relevant: caller-verified truth).
 *   groundTruth: { knownRelevant: [ids], knownMissed: [ids] } — the evaluation key.
 *   priorMetrics: { relevance, noise, missRate } — last cycle, for comparison.
 * Fail-closed: no verified ground truth ⇒ measurable:false (NOT_MEASURED), never a fabricated improvement.
 */
function assessRadarCycle(input: any): any {
  const o = isObj(input) ? input : {};
  const discoveries = arr(o.discoveries).filter(isObj);
  const gt = isObj(o.groundTruth) ? o.groundTruth : {};
  const knownMissed = arr(gt.knownMissed);
  const verified = discoveries.filter((d) => typeof d.relevant === "boolean");

  if (verified.length === 0) return Object.freeze({ measurable: false, metrics: null, deltaVsPrior: null, proposals: Object.freeze([]), selfAuthorized: false, note: "no verified discoveries (relevant flag) ⇒ NOT_MEASURED — radar performance not fabricated" });

  const relevantCount = verified.filter((d) => d.relevant === true).length;
  const relevance = round(relevantCount / verified.length);          // precision
  const noise = round(1 - relevance);                                 // false-positive rate
  const surfaced = relevantCount; const missed = knownMissed.length;
  const missRate = (surfaced + missed) > 0 ? round(missed / (surfaced + missed)) : 0;
  const metrics = Object.freeze({ relevance, noise, missRate, verified: verified.length });

  // delta vs prior cycle (improvement must be demonstrated, not assumed).
  let deltaVsPrior: any = null;
  if (isObj(o.priorMetrics)) {
    const p = o.priorMetrics;
    deltaVsPrior = Object.freeze({ relevance: round(relevance - (p.relevance || 0)), noise: round(noise - (p.noise || 0)), missRate: round(missRate - (p.missRate || 0)) });
  }

  // integrity guard — a radar "improvement" that is metric-gamed/contaminated is not credited.
  const integrity = MI.assessIntegrity(isObj(o.integritySignals) ? o.integritySignals : {});
  const gamed = integrity.overall === "DETECTED" || integrity.overall === "SUSPECTED";

  // PROPOSED improvements (never self-applied; the radar cannot modify its own authorizations).
  const proposals: any[] = [];
  if (!gamed) {
    if (noise > 0.3) proposals.push({ kind: "tighten-classifier", reason: `noise ${noise} > 0.3`, status: "PROPOSED" });
    if (missRate > 0.2) proposals.push({ kind: "broaden-sources", reason: `miss rate ${missRate} > 0.2`, status: "PROPOSED" });
    if (deltaVsPrior && deltaVsPrior.relevance < 0) proposals.push({ kind: "revert-last-classifier-change", reason: "relevance regressed vs prior cycle", status: "PROPOSED" });
  } else {
    proposals.push({ kind: "withhold-improvement", reason: `integrity ${integrity.overall} — improvement claim not credited`, status: "PROPOSED" });
  }

  return Object.freeze({
    measurable: true, metrics, deltaVsPrior,
    integrity: integrity.overall,
    proposals: Object.freeze(proposals),
    selfAuthorized: false,            // §6.6: the radar cannot modify its own authorizations
    note: "radar self-measurement; improvements are PROPOSED only (never self-applied); a gamed improvement claim is withheld",
  });
}

const RADAR_SELF_IMPROVEMENT_CONTRACT = Object.freeze({
  id: "V5-FRONTIER-RADAR-SELF-IMPROVEMENT",
  source: "ODG Master program §6.6 / D-19 — Radar self-improvement (own benchmarks + error memory)",
  reuses: Object.freeze(["meta-intelligence.assessIntegrity (metric-gaming guard on the radar's own claims)", "operates on frontier-radar outputs; extends it"]),
  notAuthority: "measures the radar and PROPOSES improvements; it applies nothing and cannot modify its own authorizations",
  invariants: Object.freeze([
    "measures relevance (precision) + noise (false-positive rate) + miss rate against supplied ground truth",
    "every improvement is PROPOSED (selfAuthorized:false) — the radar never self-applies and never modifies its own authorizations (§6.6)",
    "a gamed/contaminated improvement claim (meta-intelligence DETECTED/SUSPECTED) is WITHHELD, not credited",
    "fail-closed: no verified ground truth ⇒ NOT_MEASURED (measurable:false) — radar performance never fabricated",
    "improvement must be DEMONSTRATED vs the prior cycle; a relevance regression ⇒ a revert proposal",
    "pure/deterministic: discoveries + ground truth in → metrics + proposals out; no clock/random/network",
  ]),
});

module.exports = { assessRadarCycle, RADAR_SELF_IMPROVEMENT_CONTRACT };

if (require.main === module) {
  const demo = assessRadarCycle({ discoveries: [{ id: "a", relevant: true }, { id: "b", relevant: false }, { id: "c", relevant: true }], groundTruth: { knownMissed: ["z"] }, priorMetrics: { relevance: 0.5, noise: 0.5, missRate: 0.3 } });
  process.stdout.write(JSON.stringify({ ...RADAR_SELF_IMPROVEMENT_CONTRACT, demo: { metrics: demo.metrics, proposals: demo.proposals.length, selfAuthorized: demo.selfAuthorized } }, null, 2) + "\n");
}

export {};
