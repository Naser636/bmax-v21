#!/usr/bin/env node
"use strict";
const assert = require("assert");
const G = require("./global-improvement-engine");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 14 Step-4 — GLOBAL IMPROVEMENT ENGINE");

// observe composes the real diagnostic + scorecard.
{
  const s = G.observe({ primitivesPresent: 9, professionsProven: 15, registerAccepted: 258 });
  check(isObj(s.coverage) && typeof s.scorecardOverall === "string", "observe returns coverage + scorecard overall");
  check(Array.isArray(s.uncoveredLibraries), "observe surfaces uncovered library modules (evidence)");
}
function isObj(v: any) { return v !== null && typeof v === "object" && !Array.isArray(v); }

// §2 HONEST TAXONOMY: an empty result is NO_FINDING, NOT HEALTHY.
{
  // a measured coverage gap ⇒ DEGRADED + a ranked target.
  const withGap = G.analyzeGaps({ measured: true, honest: true, uncoveredLibraries: ["x"], forecast: ["gates: 0/7"] });
  check(withGap.status === "DEGRADED" && withGap.targets.some((t: any) => t.kind === "COVERAGE"), "a measured coverage gap ⇒ DEGRADED + COVERAGE target");

  // measured + no gaps + integrity, but NO demonstrated controls ⇒ NO_FINDING (NOT healthy).
  const clean = G.analyzeGaps({ measured: true, honest: true, uncoveredLibraries: [], forecast: [] });
  check(clean.status === "NO_FINDING", "measured + no gaps WITHOUT demonstrated controls ⇒ NO_FINDING (not HEALTHY — §2 correction)");

  // HEALTHY only with demonstrated sufficient controls.
  const healthy = G.analyzeGaps({ measured: true, honest: true, uncoveredLibraries: [], forecast: [] }, { healthCriteriaMet: true });
  check(healthy.status === "HEALTHY", "measured + no gaps + demonstrated controls ⇒ HEALTHY");

  // no measurement ⇒ NOT_MEASURED (never HEALTHY by default).
  check(G.analyzeGaps({ measured: false }).status === "NOT_MEASURED", "no measurement ⇒ NOT_MEASURED (an empty/absent scan is not health)");

  // measured but integrity flag off ⇒ UNKNOWN (cannot trust).
  check(G.analyzeGaps({ measured: true, honest: false, uncoveredLibraries: [] }).status === "UNKNOWN", "measured but integrity off ⇒ UNKNOWN");
}

// cycle: RETAIN only on measured gain + no regression; else ROLLBACK (fail-closed).
{
  check(G.cycle({ detail: "t" }, { baseline: 10, after: 12, regression: false }).decision === "RETAIN", "before→after gain, no regression ⇒ RETAIN");
  check(G.cycle({ detail: "t" }, { baseline: 10, after: 12, regression: true }).decision === "ROLLBACK", "a regression ⇒ ROLLBACK even with a gain (fail-closed)");
  check(G.cycle({ detail: "t" }, { baseline: 10, after: 9 }).decision === "ROLLBACK", "no gain ⇒ ROLLBACK");
  check(G.cycle({ detail: "t" }, { baseline: 10, after: 20 }).selfPromoted === false, "no self-promotion");
}

// maturity: the loop is mapped to existing mechanisms; it creates no second engine.
{
  const m = G.maturity();
  check(m.stages.length === 14 && m.stages[0] === "GLOBAL_OBSERVATION" && m.stages[13] === "RETAIN_OR_ROLLBACK", "14-stage loop GLOBAL_OBSERVATION→RETAIN/ROLLBACK");
  check(m.composes.length >= 3, "composes codebase-diagnostic + scorecard + self-improvement");
}

check(G.GLOBAL_IMPROVEMENT_ENGINE_CONTRACT.invariants.some((i: any) => /NO self-promotion/.test(i)), "contract documents no self-promotion");

console.log(failures === 0 ? "ALL PASS — SÉRIE 14 Step-4 GLOBAL IMPROVEMENT ENGINE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
