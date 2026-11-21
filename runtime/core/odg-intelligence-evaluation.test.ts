#!/usr/bin/env node
"use strict";
/* Tests for odg-intelligence-evaluation (V361 §3/P2). Deterministic, zero fs/network. Proves: per-axis seeded evaluation of
 * the REAL brain (known answers ⇒ objective); NO global score; measured axes carry accuracy; axes needing real missions /
 * external benchmarks are NOT_MEASURED with a dependency; activity/tokens never counted as intelligence. */
const M = require("./odg-intelligence-evaluation.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const axis = (r: any, id: string) => r.axes.find((a: any) => a.id === id);

function main(): void {
  const r = M.evaluate();

  // NO global score (the load-bearing §3 honesty)
  check("NO global intelligence score (never fabricated)", r.globalScore === null && /NO global/.test(r.note));

  // the REAL brain solves the seeded reasoning problems correctly (objective, known answers)
  check("reasoning axis MEASURED incl genuine MULTI-HOP chains (real hybrid-reasoning on known verdicts)", r.seededEvals.reasoning.cases === 6 && r.seededEvals.reasoning.accuracy === 1 && axis(r, "causal-reasoning").accuracy === 1 && axis(r, "causal-reasoning").reproducible === true);
  check("multi-step-reasoning genuinely tested by ≥2-hop transitive chains (not single-hop only)", r.seededEvals.reasoning.details.some((d: any) => /MULTI-HOP/.test(d.case) && d.ok) && axis(r, "multi-step-reasoning").accuracy === 1);
  check("counts expose distinctEvals (7 measured axes derive from 4 seeded evals — breadth not overstated)", r.counts.distinctEvals === 4 && r.counts.measured === 7);
  // independent-verification measured by treating the integrity-inspector as the system-under-test over a seeded defect corpus
  check("independent-verification MEASURED: inspector CATCHES all seeded gaming (detectionRate 1.0, 0 FP, effective)", axis(r, "independent-verification").measurability === "MEASURED" && r.seededEvals.independentVerification.accuracy === 1 && r.seededEvals.independentVerification.falsePositives === 0 && r.seededEvals.independentVerification.effective === true);
  check("independent-verification protocol NAMES its narrow scope (integrity-gaming only, not broad verification)", /integrity-gaming detection ONLY/.test(axis(r, "independent-verification").protocol) && /broader verification NOT covered/.test(axis(r, "independent-verification").protocol));
  check("uncertainty/contradiction axis MEASURED via the same seeded reasoning eval", axis(r, "uncertainty-contradiction").measurability === "MEASURED" && typeof axis(r, "uncertainty-contradiction").accuracy === "number");
  check("decomposition axis MEASURED (seeded TRIVIAL/SIMPLE/META/COMPLEX correct)", r.seededEvals.decomposition.cases === 4 && r.seededEvals.decomposition.accuracy === 1 && axis(r, "decomposition").accuracy === 1);
  check("tool-use / decision axis MEASURED (seeded path selection correct)", r.seededEvals.pathSelection.accuracy === 1 && axis(r, "tool-use").accuracy === 1 && axis(r, "decision-quality").accuracy === 1);

  // speed/resource axis is MEASURED_ELSEWHERE (PR #838), not re-claimed here
  check("speed-resource axis MEASURED_ELSEWHERE (points to the real perf-profile PR, not re-measured)", axis(r, "speed-resource").measurability === "MEASURED_ELSEWHERE" && /#838/.test(axis(r, "speed-resource").via));

  // axes needing real missions / external benchmarks are NOT_MEASURED with a dependency (never fabricated)
  check("goal-understanding NOT_MEASURED with a named dependency", axis(r, "goal-understanding").measurability === "NOT_MEASURED" && /benchmark|owner|rubric/i.test(axis(r, "goal-understanding").dependency));
  check("learn-from-errors NOT_MEASURED (needs real outcomes over time)", axis(r, "learn-from-errors").measurability === "NOT_MEASURED" && /over time/.test(axis(r, "learn-from-errors").dependency));
  check("anticipation NOT_MEASURED (realized accuracy needs forecasts resolved over time)", axis(r, "anticipation").measurability === "NOT_MEASURED" && /over time/.test(axis(r, "anticipation").dependency));
  check("16 axes total; counts reconcile", r.counts.total === 16 && r.counts.measured + r.counts.measuredElsewhere + r.counts.notMeasured === 16);
  check("more axes NOT_MEASURED than measured (honest — most need real missions/benchmarks)", r.counts.notMeasured >= r.counts.measured);

  // determinism + frozen + contract
  const r2 = M.evaluate();
  check("deterministic (identical across runs)", JSON.stringify(r) === JSON.stringify(r2));
  check("frozen", Object.isFrozen(r) && Object.isFrozen(r.axes));
  check("contract: no global score; seeded objective; NOT_MEASURED w/ dependency; composes; no 2nd engine",
    /NO global intelligence score/.test(JSON.stringify(M.INTELLIGENCE_EVALUATION_CONTRACT.invariants)) &&
    /SEEDED ground truth/.test(JSON.stringify(M.INTELLIGENCE_EVALUATION_CONTRACT.invariants)) &&
    /NOT_MEASURED with the exact dependency/.test(JSON.stringify(M.INTELLIGENCE_EVALUATION_CONTRACT.invariants)) &&
    /no second reasoning/.test(JSON.stringify(M.INTELLIGENCE_EVALUATION_CONTRACT.invariants)) &&
    /odg-hybrid-reasoning/.test(JSON.stringify(M.INTELLIGENCE_EVALUATION_CONTRACT.reuses)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-intelligence-evaluation (V361 §3/P2: per-axis seeded evaluation of the real brain [reasoning/decomposition/path-selection accuracy = known-answer objective]; NO global score; axes needing real missions/external benchmarks NOT_MEASURED with dependency; activity/tokens≠intelligence; composes canonical components, no 2nd engine)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
