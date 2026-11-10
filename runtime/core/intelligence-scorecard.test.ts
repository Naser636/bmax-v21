#!/usr/bin/env node
"use strict";
const S = require("./intelligence-scorecard");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
const sc = S.buildScorecard([
  { name: "d-strong", value: 0.95, denominator: 40, dataKind: "real" },
  { name: "d-weak", value: 0.4, denominator: 30, dataKind: "real" },
  { name: "d-synthetic", value: 1.0, denominator: 7, dataKind: "synthetic" },
  { name: "d-unmeasured", value: 1.0, denominator: 0, dataKind: "real" },
]);
// (1) NO single global score.
check(!("globalScore" in sc) && !("overall" in sc) && /NO single global score/i.test(sc.summary.note), "no single global score (would mask weaknesses)");
// (2) the WEAKEST measurable dimension is surfaced (not averaged away).
check(sc.weakest && sc.weakest.name === "d-weak" && sc.weakest.value === 0.4, "weakest measurable dimension surfaced");
// (3) a no-denominator dimension ⇒ NOT_MEASURABLE (never scored favourably).
check(sc.notMeasurable.includes("d-unmeasured") && sc.dimensions.find((d: any) => d.name === "d-unmeasured").value === null, "no-denominator ⇒ NOT_MEASURABLE, value null");
// (4) SYNTHETIC is flagged, NOT presented as real operational performance.
{
  const synth = sc.dimensions.find((d: any) => d.name === "d-synthetic");
  check(synth.dataKind === "SYNTHETIC" && /NOT real operational performance/i.test(synth.note), "synthetic result flagged, not real operational performance");
  check(sc.nonRealDimensions.some((d: any) => d.name === "d-synthetic"), "non-real dimensions listed");
}
// (5) unknown data kind ⇒ UNSPECIFIED (not presented as real).
check(S.scoreDimension({ name: "x", value: 0.5, denominator: 10 }).dataKind === "UNSPECIFIED", "unknown data kind ⇒ UNSPECIFIED");
// (6) summary counts real-measured honestly.
check(sc.summary.realMeasured === 2 && sc.summary.notMeasurable === 1, "summary counts real-measured + not-measurable honestly");
// (7) prediction vs outcome comparison.
{
  check(S.comparePredictionToOutcome(0.9, 0.85, 0.1).within === true, "prediction within tolerance of outcome");
  check(S.comparePredictionToOutcome(0.9, 0.5, 0.1).within === false, "prediction far from outcome ⇒ not within");
  check(S.comparePredictionToOutcome("x", 0.5).error === null, "insufficient data ⇒ no comparison");
}
check(/NO single global score/i.test(JSON.stringify(S.INTELLIGENCE_SCORECARD_CONTRACT.invariants)), "contract: no global score");
check(/SYNTHETIC result is NOT real operational performance/i.test(JSON.stringify(S.INTELLIGENCE_SCORECARD_CONTRACT.invariants)), "contract: synthetic != real operational");
if (failures === 0) process.stdout.write("ALL PASS — V12.4 INTELLIGENCE SCORECARD\n");
process.exit(failures === 0 ? 0 : 1);
export {};
