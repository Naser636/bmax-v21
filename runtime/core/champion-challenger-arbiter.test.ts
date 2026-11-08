#!/usr/bin/env node
"use strict";
const assert = require("assert");
const A = require("./champion-challenger-arbiter");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 22 — CHAMPION-CHALLENGER ARBITER");

const champ = { id: "champ", baseline: { signals: { successRate: 0.80, latencyMs: 200 } } };
const indep = { builder: { id: "x" }, verifier: { id: "y" } };
const sense = { latencyMs: "lower" };

// best NON-REGRESSING challenger wins on clean lift (not id order): "a" improves 2 metrics, "b" improves 1.
{
  const r = A.arbitrate({ champion: champ, senseMap: sense, challengers: [
    { id: "b", baseline: { signals: { successRate: 0.90, latencyMs: 200 } }, actors: indep },
    { id: "a", baseline: { signals: { successRate: 0.85, latencyMs: 180 } }, actors: indep },
  ] });
  check(r.decision === "PROMOTE_CHALLENGER" && r.winner === "a", `largest clean lift wins (a, lift 2), got ${r.winner}`);
  check(r.selfAuthorized === false && r.grantsNoPromotion === true, "selfAuthorized:false + grantsNoPromotion:true (promotion stays external)");
}

// no challenger strictly beats ⇒ KEEP_CHAMPION (fail-closed).
{
  const r = A.arbitrate({ champion: champ, senseMap: sense, challengers: [
    { id: "flat", baseline: { signals: { successRate: 0.80, latencyMs: 200 } }, actors: indep },
  ] });
  check(r.decision === "KEEP_CHAMPION" && r.winner === null, "no strict improvement ⇒ KEEP_CHAMPION");
}

// a challenger regressing ANY champion metric is disqualified (even if it improves another).
{
  const r = A.arbitrate({ champion: champ, senseMap: sense, challengers: [
    { id: "reg", baseline: { signals: { successRate: 0.95, latencyMs: 300 } }, actors: indep }, // better success, WORSE latency
  ] });
  check(r.decision === "KEEP_CHAMPION", "a regression on any metric ⇒ disqualified ⇒ KEEP_CHAMPION");
  check(r.disqualified.some((d: any) => d.id === "reg" && d.disqualifiers.some((x: any) => /regress/.test(x))), "regression recorded in disqualifiers");
}

// integrity DETECTED (hard manipulation marker) ⇒ disqualified.
{
  const r = A.arbitrate({ champion: champ, senseMap: sense, challengers: [
    { id: "gamed", baseline: { signals: { successRate: 0.99, latencyMs: 200 } }, actors: indep,
      integritySignals: { gaming: { metric: { before: 0.80, after: 0.99 }, manipulationMarker: true } } },
  ] });
  check(r.decision === "KEEP_CHAMPION" && r.disqualified.some((d: any) => d.id === "gamed" && /integrity DETECTED/.test(d.disqualifiers.join(""))), "integrity DETECTED challenger disqualified");
}

// integrity SUSPECTED (Goodhart: metric up, independent flat) ⇒ not forwarded (fail-closed, not an accusation).
{
  const r = A.arbitrate({ champion: champ, senseMap: sense, challengers: [
    { id: "goodhart", baseline: { signals: { successRate: 0.99, latencyMs: 200 } }, actors: indep,
      integritySignals: { gaming: { metric: { before: 0.80, after: 0.99 }, independentCheck: { before: 0.80, after: 0.80 } } } },
  ] });
  check(r.decision === "KEEP_CHAMPION" && r.disqualified.some((d: any) => d.id === "goodhart" && /SUSPECTED/.test(d.disqualifiers.join(""))), "integrity SUSPECTED challenger not forwarded (fail-closed)");
}

// reward-hacking (self-certification builder==validator) ⇒ disqualified.
{
  const r = A.arbitrate({ champion: champ, senseMap: sense, challengers: [
    { id: "selfcert", baseline: { signals: { successRate: 0.99, latencyMs: 200 } }, actors: indep,
      rewardSignals: { builder: "same", validator: "same" } },
  ] });
  check(r.disqualified.some((d: any) => d.id === "selfcert"), "reward-hacking self-cert challenger disqualified");
}

// COMPROMISED independence (builder==verifier) ⇒ disqualified.
{
  const r = A.arbitrate({ champion: champ, senseMap: sense, challengers: [
    { id: "nonindep", baseline: { signals: { successRate: 0.99, latencyMs: 200 } }, actors: { builder: { id: "z" }, verifier: { id: "z" } } },
  ] });
  check(r.decision === "KEEP_CHAMPION", "COMPROMISED independence ⇒ disqualified ⇒ KEEP_CHAMPION");
}

// determinism: identical input ⇒ identical decision.
{
  const inp = { champion: champ, senseMap: sense, challengers: [{ id: "a", baseline: { signals: { successRate: 0.85, latencyMs: 180 } }, actors: indep }] };
  check(JSON.stringify(A.arbitrate(inp)) === JSON.stringify(A.arbitrate(inp)), "deterministic: same input ⇒ same decision");
}

// fail-closed: no champion ⇒ KEEP_CHAMPION.
check(A.arbitrate({ challengers: [] }).decision === "KEEP_CHAMPION", "no champion ⇒ KEEP_CHAMPION (fail-closed)");
// SÉRIE 22 significance gate: a directional lift that is NOT statistically significant is disqualified when eval evidence is supplied.
{
  const r = A.arbitrate({ champion: champ, senseMap: sense, challengers: [
    { id: "noisy", baseline: { signals: { successRate: 0.85, latencyMs: 180 } }, actors: indep,
      significanceEvidence: { before: { successes: 9, n: 10 }, after: { successes: 10, n: 10 } } }, // 9/10→10/10 = noise
  ] });
  check(r.decision === "KEEP_CHAMPION" && r.disqualified.some((d: any) => d.id === "noisy" && /not statistically significant/.test(d.disqualifiers.join(""))), "directional lift that is sampling noise ⇒ disqualified (STREAM 2026)");
}
// significance gate: a directional lift that IS statistically significant qualifies.
{
  const r = A.arbitrate({ champion: champ, senseMap: sense, challengers: [
    { id: "real", baseline: { signals: { successRate: 0.85, latencyMs: 180 } }, actors: indep,
      significanceEvidence: { before: { successes: 10, n: 20 }, after: { successes: 18, n: 20 } } }, // significant
  ] });
  check(r.decision === "PROMOTE_CHALLENGER" && r.winner === "real", "statistically significant lift ⇒ PROMOTE_CHALLENGER");
}
// backward-compatible: no significanceEvidence ⇒ directional lift still stands.
check(A.arbitrate({ champion: champ, senseMap: sense, challengers: [{ id: "a", baseline: { signals: { successRate: 0.85, latencyMs: 180 } }, actors: indep }] }).decision === "PROMOTE_CHALLENGER", "no eval evidence ⇒ directional lift stands (backward-compatible)");

check(A.CHAMPION_CHALLENGER_CONTRACT.invariants.some((i: any) => /promotion stays EXTERNAL/.test(i)), "contract: promotion stays external");

console.log(failures === 0 ? "ALL PASS — SÉRIE 22 CHAMPION-CHALLENGER ARBITER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
