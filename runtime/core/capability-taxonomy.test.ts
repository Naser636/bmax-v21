#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the broad-IT capability baseline is HONEST: all 18 categories A–R present;
// ZERO marked PROVEN (nothing client-validated); no fabricated success rate; VERIFIED_SUCCESS_RATE fail-closes to
// NO_DATA with no attempts; false-successes excluded from the numerator; abstention counted; the 50% target is
// reported UNMET/UNMEASURED (not inflated).
"use strict";
const assert = require("assert");
const T = require("./capability-taxonomy.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) taxonomy completeness A–R (18) with required fields.
const cats = T.TAXONOMY.map(t => t.cat).join("");
ok("18 categories A–R present with coverage + evidence + measuredSuccessRate fields", T.TAXONOMY.length === 18 && cats === "ABCDEFGHIJKLMNOPQR" && T.TAXONOMY.every(t => t.coverage && Array.isArray(t.evidence) && ("measuredSuccessRate" in t)));

// (2) HONEST: 0 categories PROVEN (nothing client-validated); no measured success rate anywhere.
const s = T.summary();
ok("0 PROVEN as client service; anyMeasuredSuccessRate false", s.provenAsClientService === 0 && s.anyMeasuredSuccessRate === false && T.TAXONOMY.every(t => t.measuredSuccessRate === null));
ok("headline reports 50% UNMET + UNMEASURED; baseline NO_DATA", /50% target is UNMET and UNMEASURED/i.test(s.headline) && /NO_DATA/.test(s.baseline));
ok("strongest area honestly flagged SYNTHETIC (K)", T.TAXONOMY.find(t => t.cat === "K").note.toLowerCase().includes("synthetic"));

// (3) PARTIAL categories carry own-repo evidence (not empty claims); NO_DATA carry none.
ok("PARTIAL categories have evidence; NO_DATA have none", T.TAXONOMY.filter(t => t.coverage === "PARTIAL").every(t => t.evidence.length > 0 && /own-repo/.test(t.evidenceScope)) && T.TAXONOMY.filter(t => t.coverage === "NO_DATA").every(t => t.evidence.length === 0));

// (4) VERIFIED_SUCCESS_RATE: fail-closed NO_DATA when nothing attempted.
ok("no attempts ⇒ NO_DATA (not 0%, not 100%)", T.computeVerifiedSuccessRate([]).status === "NO_DATA" && T.computeVerifiedSuccessRate([{ eligible: true, attempted: false }]).status === "NO_DATA");

// (5) MEASURED: false-successes excluded from the numerator; abstention counted.
const results = [
  { eligible: true, attempted: true, independentlyVerified: true },
  { eligible: true, attempted: true, independentlyVerified: true, falseSuccess: true },   // claims pass but false ⇒ NOT counted
  { eligible: true, attempted: true, independentlyVerified: false },
  { eligible: true, attempted: false },                                                   // abstained
  { eligible: false, attempted: true, independentlyVerified: true },                       // ineligible ⇒ ignored
];
const m = T.computeVerifiedSuccessRate(results);
ok("measured: numerator excludes false-success; denominator = eligible attempted", m.status === "MEASURED" && m.denominator === 3 && m.numerator === 1 && m.verifiedSuccessRate === 0.333);
ok("false-success rate + abstention reported separately; small sample flagged", m.falseSuccessRate > 0 && m.abstentionRate > 0 && /WIDE/.test(m.uncertainty));

// (6) baseline protocol freezes the definition + leakage/contamination rules.
ok("baseline protocol: metric + sealed separation + no-train-on-held-out + abstention", /VERIFIED_SUCCESS_RATE/.test(T.BASELINE_PROTOCOL.metric) && T.BASELINE_PROTOCOL.separation.includes("sealed/held-out") && T.BASELINE_PROTOCOL.rules.some(r => /held-out answers/.test(r)));

// (7) not rigged: a genuinely all-verified sample yields a high rate (harness can report success honestly).
const allGood = T.computeVerifiedSuccessRate(Array.from({ length: 25 }, () => ({ eligible: true, attempted: true, independentlyVerified: true })));
ok("all-verified large sample ⇒ 1.0 (not hardcoded to fail)", allGood.verifiedSuccessRate === 1 && allGood.sampleSize === 25 && !/WIDE/.test(allGood.uncertainty));

console.log(`\nCAPABILITY-TAXONOMY suite — ${pass} assertions passed. (A–R taxonomy; 0 PROVEN; NO_DATA baseline; false-success excluded; honest)`);
