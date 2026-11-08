#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 22 (CENTRAL ARCHITECTURE — world-research gap) — CHAMPION-CHALLENGER ARBITER. PURE, deterministic.
 * World reference: champion-challenger deployment (a challenger is promoted ONLY when it demonstrably outperforms the
 * incumbent on shared KPIs — TELUS Digital 2026; 2026 Singapore Consensus on Global AI Safety, arXiv 2608.14611) and
 * ACES "Skill Lift" (arXiv 2608.20614, Aug-2026 — candidates judged against each other on a FIXED shared scorer, not
 * each vs a static baseline). ODG's evolution-loop BASELINE_COMPARE evaluates ONE candidate at a time against the
 * static protected baseline and forwards each independently to PROMOTION_REVIEW — there is no N-way comparative
 * selection (grep-verified: no tournament/selectBest/incumbent improvement-selection). This adds that: given the SET
 * of challengers that each independently reached PROMOTION_REVIEW, it selects the single best NON-REGRESSING,
 * integrity-clean, independently-verified winner to forward — or KEEP_CHAMPION if none strictly beats the incumbent.
 * It COMPOSES existing modules only (no new engine/sandbox/evaluator) and takes NO promotion decision itself:
 * selfAuthorized:false, grantsNoPromotion:true — promotion stays external via evolution-loop.applyExternalPromotion.
 */

const BASE = require("./improvement-baseline");            // measureDelta — champion vs challenger, metric-by-metric
const MI = require("./meta-intelligence");                 // assessIntegrity — metric-gaming/evaluator-capture/contamination
const CL = require("./compounding-loop");                  // rewardHackingCheck — spec-gaming / leakage / self-cert
const IND = require("./evaluator-independence");           // auditIndependence — Builder≠Verifier (COMPROMISED ⇒ out)
const SIG = require("./eval-significance");                 // significanceGate — a directional lift must not be sampling noise

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function signalsOf(c: any): any { return isObj(c) && isObj(c.baseline) ? c.baseline : (isObj(c) && isObj(c.signals) ? { signals: c.signals } : {}); }

/** assessChallenger(champion, challenger, senseMap) -> one challenger's clean verdict vs the incumbent. */
function assessChallenger(champion: any, challenger: any, senseMap: any): any {
  const delta = BASE.measureDelta(signalsOf(champion), signalsOf(challenger), senseMap);
  const disq: string[] = [];
  // fail-closed INTEGRITY gates — a "win" that is gamed/leaked/self-certified does NOT qualify.
  const integrity = MI.assessIntegrity(isObj(challenger.integritySignals) ? challenger.integritySignals : {});
  // fail-closed: a confirmed OR suspected integrity concern blocks FORWARDING (declining to promote is not an
  // accusation under §63 — it is withholding pending investigation). SUSPECTED and DETECTED both disqualify.
  if (integrity.overall === "DETECTED" || integrity.overall === "SUSPECTED") disq.push(`integrity ${integrity.overall} (gaming/capture/contamination)`);
  const rh = CL.rewardHackingCheck(isObj(challenger.rewardSignals) ? challenger.rewardSignals : {});
  if (rh.clean === false) disq.push("reward-hacking: " + arr(rh.flags).join("; "));
  const indep = IND.auditIndependence(isObj(challenger.actors) ? challenger.actors : {});
  if (indep.verdict === "COMPROMISED") disq.push("evaluator independence COMPROMISED");
  // REGRESSION gate — disqualify any challenger regressing ANY champion metric (champion-challenger invariant).
  if (delta.summary.regressed > 0) disq.push(`regresses ${delta.summary.regressed} champion metric(s)`);
  // OPTIONAL STATISTICAL-SIGNIFICANCE gate (STREAM 2026): if the challenger carries eval evidence, a directional
  // lift must ALSO be statistically significant (not sampling noise) to qualify. Backward-compatible: absent evidence
  // ⇒ the directional lift stands (the caller declared no sampled eval to test).
  let significance: any = null;
  if (isObj(challenger.significanceEvidence)) {
    significance = SIG.significanceGate(challenger.significanceEvidence);
    if (significance.verdict !== "IMPROVEMENT") disq.push(`lift not statistically significant (${significance.verdict}) — may be sampling noise`);
  }
  // STRICTLY-BEATS gate — must improve at least one metric with zero regressions.
  const strictlyBeats = delta.summary.improved > 0 && delta.summary.regressed === 0;
  const lift = delta.summary.improved - delta.summary.regressed;   // clean aggregate lift (ACES "Skill Lift")
  return Object.freeze({
    id: typeof challenger.id === "string" ? challenger.id : "",
    qualifies: disq.length === 0 && strictlyBeats,
    strictlyBeats, lift, disqualifiers: Object.freeze(disq),
    delta: delta.summary, integrity: integrity.overall, rewardClean: rh.clean, independence: indep.verdict,
    significance: significance ? significance.verdict : "NOT_PROVIDED",
  });
}

/** arbitrate({champion, challengers, senseMap}) -> ranked decision dossier. Fail-closed; takes NO promotion decision. */
function arbitrate(input: any): any {
  const o = isObj(input) ? input : {};
  const champion = isObj(o.champion) ? o.champion : null;
  const challengers = arr(o.challengers).filter(isObj);
  if (!champion) return Object.freeze({ decision: "KEEP_CHAMPION", winner: null, reason: "no champion provided (fail-closed)", ranked: Object.freeze([]), selfAuthorized: false, grantsNoPromotion: true });

  const assessed = challengers.map((c) => assessChallenger(champion, c, o.senseMap));
  const qualifying = assessed.filter((a) => a.qualifies);
  // deterministic selection: largest clean lift, then stable lexicographic id order.
  const ranked = qualifying.slice().sort((a, b) => (b.lift - a.lift) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const winner = ranked.length > 0 ? ranked[0] : null;

  return Object.freeze({
    // champion-challenger invariant: forward a challenger ONLY if one strictly beats the incumbent; else KEEP_CHAMPION.
    decision: winner ? "PROMOTE_CHALLENGER" : "KEEP_CHAMPION",
    winner: winner ? winner.id : null,
    reason: winner ? `challenger ${winner.id} strictly beats the champion (lift ${winner.lift}, 0 regressions, integrity-clean, independent)` : "no surviving challenger strictly beats the champion (fail-closed KEEP_CHAMPION)",
    ranked: Object.freeze(ranked),
    disqualified: Object.freeze(assessed.filter((a) => !a.qualifies)),
    // this module forwards a candidate; it NEVER promotes. Promotion stays external via evolution-loop.applyExternalPromotion.
    selfAuthorized: false, grantsNoPromotion: true,
  });
}

const CHAMPION_CHALLENGER_CONTRACT = Object.freeze({
  id: "V124-CHAMPION-CHALLENGER-ARBITER",
  source: "SÉRIE 22 central architecture — champion-challenger / ACES Skill-Lift N-way selection (TELUS 2026; arXiv 2608.14611, 2608.20614)",
  reuses: Object.freeze(["improvement-baseline.measureDelta", "meta-intelligence.assessIntegrity", "compounding-loop.rewardHackingCheck", "evaluator-independence.auditIndependence", "eval-significance.significanceGate (optional noise gate)", "forwards to evolution-loop.applyExternalPromotion (external)"]),
  notAuthority: "selects the best non-regressing challenger to FORWARD; it takes no promotion decision and creates no authorizer",
  invariants: Object.freeze([
    "N-way comparative selection on a FIXED shared metric set (not 1-vs-static-baseline) — closes the gap evolution-loop lacks",
    "a challenger regressing ANY champion metric is disqualified (champion-challenger invariant)",
    "a challenger failing integrity (DETECTED or SUSPECTED), reward-hacking (not clean), or independence (COMPROMISED) is not forwarded — fail-closed, not an accusation (§63)",
    "no surviving challenger strictly beats the champion ⇒ KEEP_CHAMPION (no winner forwarded)",
    "if a challenger carries sampled eval evidence, its directional lift must be statistically SIGNIFICANT (not noise) to qualify (STREAM 2026); absent evidence ⇒ directional lift stands (backward-compatible)",
    "deterministic selection: largest clean lift, stable id tie-break; no clock/random",
    "grantsNoPromotion:true, selfAuthorized:false — promotion stays EXTERNAL via evolution-loop.applyExternalPromotion",
  ]),
});

module.exports = { assessChallenger, arbitrate, CHAMPION_CHALLENGER_CONTRACT };

if (require.main === module) {
  const demo = arbitrate({
    champion: { id: "champ", baseline: { signals: { successRate: 0.80, latencyMs: 200 } } },
    challengers: [
      { id: "b", baseline: { signals: { successRate: 0.90, latencyMs: 200 } }, actors: { builder: { id: "x" }, verifier: { id: "y" } } },
      { id: "a", baseline: { signals: { successRate: 0.85, latencyMs: 180 } }, actors: { builder: { id: "x" }, verifier: { id: "y" } } },
    ],
    senseMap: { latencyMs: "lower" },
  });
  process.stdout.write(JSON.stringify({ ...CHAMPION_CHALLENGER_CONTRACT, demo: { decision: demo.decision, winner: demo.winner } }, null, 2) + "\n");
}

export {};
