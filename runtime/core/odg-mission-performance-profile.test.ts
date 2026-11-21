#!/usr/bin/env node
"use strict";
/* Tests for odg-mission-performance-profile (V361 §2/P1). Deterministic, zero fs/network. Proves: per-stage latency +
 * bottleneck; thin stage ⇒ NOT_MEASURED; a before/after gain credited ONLY when reproducible; regression surfaced; totals +
 * call counts; composes latency-measure + performance-observability. */
const M = require("./odg-mission-performance-profile.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const lat = (n: number, base: number) => Array.from({ length: n }, (_, k) => base + (k % 4 === 0 ? 2 : 0)); // low variance

function main(): void {
  // a 3-stage mission; stage "plan" is the bottleneck (largest median)
  const p = M.profileMission({ mission: "M1", stages: [
    { stage: "route", latencyMs: lat(24, 10), modelCalls: 0, toolCalls: 1 },
    { stage: "plan", latencyMs: lat(24, 80), modelCalls: 1, toolCalls: 0 },
    { stage: "build", latencyMs: lat(24, 30), modelCalls: 1, toolCalls: 2 },
  ] }, { minSampleN: 20 });
  check("verdict PROFILED (measured, no baseline)", p.verdict === "PROFILED" && p.totals.measuredStages === 3);
  check("per-stage medians measured; bottleneck = plan (largest median)", p.stages.find((s: any) => s.stage === "plan").median >= 80 && p.bottleneck === "plan");
  check("totals: sum-of-stage-medians + call counts", p.totals.totalMedianMs >= 118 && p.totals.modelCalls === 2 && p.totals.toolCalls === 3);

  // thin stage ⇒ NOT_MEASURED for that stage (never generalized)
  const thin = M.profileMission({ mission: "M2", stages: [{ stage: "x", latencyMs: [10, 11, 12] }] }, { minSampleN: 20 });
  check("thin stage ⇒ NOT measurable; mission verdict NOT_MEASURED", thin.stages[0].measurable === false && thin.verdict === "NOT_MEASURED" && thin.totals.totalMedianMs === null);

  // reproducible IMPROVEMENT vs baseline (after reproducibly faster)
  const imp = M.profileMission({ mission: "M3", stages: [{ stage: "plan", latencyMs: lat(24, 40) }], baseline: { stages: [{ stage: "plan", latencyMs: lat(24, 100) }] } });
  check("reproducible faster vs baseline ⇒ IMPROVED (gain credited)", imp.verdict === "IMPROVED" && imp.comparison.improvedStages === 1 && imp.comparison.perStage[0].reductionPct > 0);

  // reproducible REGRESSION surfaced (not hidden)
  const reg = M.profileMission({ mission: "M4", stages: [{ stage: "plan", latencyMs: lat(24, 150) }], baseline: { stages: [{ stage: "plan", latencyMs: lat(24, 100) }] } });
  check("reproducible slower vs baseline ⇒ REGRESSED (surfaced, not hidden)", reg.verdict === "REGRESSED" && reg.comparison.regressedStages === 1);

  // a NOISY after (measurable n but high variance) ⇒ NOT reproducible ⇒ no credited gain
  const noisyLat = Array.from({ length: 24 }, (_, k) => (k < 16 ? 10 : 60)); // 24 samples; p50≈10, p95≈60 ⇒ variance ratio ≫ 1.5
  const noisy = M.profileMission({ mission: "M5", stages: [{ stage: "plan", latencyMs: noisyLat }], baseline: { stages: [{ stage: "plan", latencyMs: lat(24, 100) }] } });
  check("noisy high-variance after ⇒ NOT reproducible ⇒ NO_REPRODUCIBLE_CHANGE (no credited gain)", noisy.comparison.perStage[0].reproducible === false && noisy.verdict === "NO_REPRODUCIBLE_CHANGE");

  // frozen + contract
  check("frozen result", Object.isFrozen(p) && Object.isFrozen(p.stages));
  check("contract: thin⇒NOT_MEASURED; gain only if reproducible; regression surfaced; sum-of-medians model; composes; no 2nd measurer",
    /NOT_MEASURED/.test(JSON.stringify(M.MISSION_PERFORMANCE_PROFILE_CONTRACT.invariants)) &&
    /credited ONLY when reproducible/.test(JSON.stringify(M.MISSION_PERFORMANCE_PROFILE_CONTRACT.invariants)) &&
    /SUM-OF-STAGE-MEDIANS/.test(JSON.stringify(M.MISSION_PERFORMANCE_PROFILE_CONTRACT.invariants)) &&
    /speed never overrides reliability/.test(JSON.stringify(M.MISSION_PERFORMANCE_PROFILE_CONTRACT.invariants)) &&
    /performance-observability/.test(JSON.stringify(M.MISSION_PERFORMANCE_PROFILE_CONTRACT.reuses)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-mission-performance-profile (V361 §2/P1: per-stage latency + bottleneck + call totals; thin⇒NOT_MEASURED; before/after gain credited ONLY when reproducible, regression surfaced; sum-of-medians model, speed≠reliability; composes latency-measure + performance-observability, no 2nd measurer)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
