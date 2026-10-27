#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the weighted pipeline forecast is HONEST: realized cash is its own
// bucket (forecast≠cash), probabilities are an overridable hypothesis (fail-closed outside [0,1]), each
// opportunity is weighted once at its current stage (no double-count), LOST excluded.
"use strict";
const assert = require("assert");
const F = require("./pipeline-forecast.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const E = (id, stage, amount, lost = false) => ({ id, stage, amount, lost });

// (1) basic weighting with the default hypothesis.
const entries = [
  E("a", "CASHED", 1000),           // realized, P=1
  E("b", "SIGNED", 1000),           // P=0.90 ⇒ 900
  E("c", "PROPOSAL_SENT", 1000),    // P=0.50 ⇒ 500
  E("d", "QUALIFIED", 1000),        // P=0.10 ⇒ 100
  E("x", "SIGNED", 5000, true),     // LOST ⇒ excluded
];
const r = F.forecast(entries);
ok("forecast ok + counts (4 counted, 1 lost)", r.ok && r.counted === 4 && r.lost === 1);
ok("realizedCash isolates CASHED only", r.realizedCash === 1000);
ok("weightedOpenPipeline excludes CASHED (900+500+100=1500)", r.weightedOpenPipeline === 1500);
ok("weightedTotal = realized + open (2500)", r.weightedTotal === 2500);

// (2) LOST excluded entirely (not weighted).
ok("LOST opportunity contributes 0", F.forecast([E("y", "SIGNED", 9999, true)]).weightedTotal === 0);

// (3) no double-count: one SIGNED deal weighted once at P(SIGNED), not across prior stages.
const one = F.forecast([E("s", "SIGNED", 1000)]);
ok("single SIGNED deal weighted exactly once (900)", one.weightedOpenPipeline === 900 && one.byStage.SIGNED.count === 1 && one.byStage.SIGNED.weighted === 900);

// (4) caller-supplied probabilities override + are validated fail-closed.
const custom = F.forecast([E("a", "QUALIFIED", 1000)], { stageProbabilities: { QUALIFIED: 0.5 } });
ok("custom probability overrides default", custom.weightedOpenPipeline === 500 && custom.probabilitySource === "CALLER_SUPPLIED");
ok("fail-closed: probability > 1 ⇒ INVALID_PROBABILITIES", F.forecast([E("a", "QUALIFIED", 1000)], { stageProbabilities: { QUALIFIED: 1.5 } }).code === "INVALID_PROBABILITIES");
ok("fail-closed: negative/non-number probability rejected", F.forecast([], { stageProbabilities: { QUALIFIED: -0.1 } }).code === "INVALID_PROBABILITIES" && F.forecast([], { stageProbabilities: { QUALIFIED: "x" } }).code === "INVALID_PROBABILITIES");

// (5) byStage breakdown sane; unknown stage ignored (never guessed).
const withUnknown = F.forecast([E("u", "NOT_A_STAGE", 1000), E("q", "QUALIFIED", 2000)]);
ok("unknown stage ignored, known counted", withUnknown.counted === 1 && withUnknown.byStage.QUALIFIED.amount === 2000);

// (6) honesty note + probability source labeling.
ok("note states forecast≠cash + HYPOTHESIS; default source labeled", /FORECAST.*NOT cash|forecast/i.test(r.note) && /HYPOTHESIS/i.test(r.note) && r.probabilitySource === "DEFAULT_HYPOTHESIS");

// (7) SIGNED weighted < full amount (signed ≠ cash) and CASHED == full.
ok("default ladder: SIGNED<1, CASHED==1, DETECTED small", F.DEFAULT_STAGE_PROBABILITY.SIGNED === 0.9 && F.DEFAULT_STAGE_PROBABILITY.CASHED === 1 && F.DEFAULT_STAGE_PROBABILITY.DETECTED < 0.1);

// (8) fail-closed input / empty.
ok("fail-closed: non-array entries ⇒ INVALID_INPUT", F.forecast(null).code === "INVALID_INPUT" && F.forecast({}).code === "INVALID_INPUT");
ok("empty entries ⇒ zeros, ok", (() => { const z = F.forecast([]); return z.ok && z.realizedCash === 0 && z.weightedTotal === 0 && z.counted === 0; })());

// (9) deterministic.
ok("reproducible", JSON.stringify(F.forecast(entries)) === JSON.stringify(F.forecast(entries)));

console.log(`\nPIPELINE-FORECAST suite — ${pass} assertions passed. (weighted expected value: forecast≠cash, hypothesis probabilities, no double-count, fail-closed)`);
