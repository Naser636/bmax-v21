#!/usr/bin/env node
"use strict";
/* Tests for odg-light-path-selector (V361 §2/P1 A-D,I). Deterministic, zero fs/network. Proves: complexity→tier; light path
 * only when reliability permits (calibrated low-P ⇒ ESCALATE even for a simple task — speed≠reliability); no evidence ⇒
 * UNVERIFIED probe; latency NOT_MEASURED without a real profile; recommends only; composes the canonical pieces. */
const M = require("./odg-light-path-selector.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const simpleSpec = { name: "format a date string", architecture: [{ role: "format", contract: "x" }] };       // 1 file ⇒ TRIVIAL/SIMPLE
const metaSpec = { name: "undefined symbol detector", architecture: [{ role: "parse AST tokens", contract: "detect code references" }] }; // meta ⇒ META
const complexSpec = { name: "multi", architecture: [{ role: "a", dependsOn: ["b"] }, { role: "b", dependsOn: ["c"] }, { role: "c", dependsOn: ["d"] }, { role: "d" }] }; // 4 files ⇒ COMPLEX

function main(): void {
  // (1) simple + CALIBRATED reliable ⇒ LIGHT_LOCAL, fastest model, gate TRUSTED
  const a = M.selectLightPath({ spec: simpleSpec, reliability: { quality: "CALIBRATED", pForPlanner: 0.8 } });
  check("simple + calibrated-reliable ⇒ LIGHT_LOCAL, gate TRUSTED", a.pathTier === "LIGHT_LOCAL" && a.reliability.gate === "TRUSTED" && a.complexity === "TRIVIAL" || a.complexity === "SIMPLE");
  check("light path uses the fastest (SIMPLE) model recommendation", /SIMPLE task/.test(a.modelReason));

  // (2) RELIABILITY OVERRIDES SPEED: simple task but CALIBRATED LOW P ⇒ ESCALATE (not light)
  const b = M.selectLightPath({ spec: simpleSpec, reliability: { quality: "CALIBRATED", pForPlanner: 0.2 } });
  check("simple but calibrated-unreliable ⇒ ESCALATE_PROVIDER (reliability overrides speed §2.I)", b.pathTier === "ESCALATE_PROVIDER" && b.reliability.gate === "ESCALATE" && /never overrides reliability/.test(b.note));

  // (3) no calibrated evidence ⇒ UNVERIFIED (probe, not a confident light pick)
  const c = M.selectLightPath({ spec: simpleSpec });
  check("no reliability evidence ⇒ gate UNVERIFIED (probe to gather data)", c.reliability.gate === "UNVERIFIED" && /PROBE/.test(c.recommendation));

  // (4) META ⇒ DECOMPOSE (highest-quality model), never a light monolith
  const d = M.selectLightPath({ spec: metaSpec, reliability: { quality: "CALIBRATED", pForPlanner: 0.9 } });
  check("meta/code-analyzing ⇒ DECOMPOSE (not LIGHT even if calibrated-reliable)", d.pathTier === "DECOMPOSE" && d.decompose === true && /DECOMPOSE/.test(d.recommendation));

  // (5) COMPLEX ⇒ DEEP_REASONING (COMPLEX model)
  const e = M.selectLightPath({ spec: complexSpec, reliability: { quality: "CALIBRATED", pForPlanner: 0.9 } });
  check("complex ⇒ DEEP_REASONING, highest-quality model", e.pathTier === "DEEP_REASONING" && /COMPLEX task/.test(e.modelReason));

  // (6) latency NOT_MEASURED without a real profile; MEASURED + budget ⇒ fit computed
  check("no measured profile ⇒ expectedLatency NOT_MEASURED (no fabricated estimate)", a.expectedLatency.status === "NOT_MEASURED" && a.fitsBudget === null);
  const f = M.selectLightPath({ spec: simpleSpec, reliability: { quality: "CALIBRATED", pForPlanner: 0.8 }, measuredLatencyMs: 40, latencyBudgetMs: 100 });
  check("measured latency + budget ⇒ fitsBudget computed (40 ≤ 100)", f.expectedLatency.status === "MEASURED" && f.fitsBudget === true);
  const g = M.selectLightPath({ spec: simpleSpec, reliability: { quality: "CALIBRATED", pForPlanner: 0.8 }, measuredLatencyMs: 250, latencyBudgetMs: 100 });
  check("measured latency over budget ⇒ fitsBudget false", g.fitsBudget === false);

  // recommends only
  check("recommends only (selfAuthorized/authorizes false)", a.selfAuthorized === false && a.authorizes === false);

  // frozen + contract
  check("frozen result", Object.isFrozen(a) && Object.isFrozen(a.reliability));
  check("contract: reliability overrides speed; unverified⇒probe; latency NOT_MEASURED w/o profile; recommends-only; composes",
    /speed never overrides reliability/.test(JSON.stringify(M.LIGHT_PATH_SELECTOR_CONTRACT.invariants)) &&
    /UNVERIFIED/.test(JSON.stringify(M.LIGHT_PATH_SELECTOR_CONTRACT.invariants)) &&
    /NOT_MEASURED without a real measured profile/.test(JSON.stringify(M.LIGHT_PATH_SELECTOR_CONTRACT.invariants)) &&
    /decomposition-planner/.test(JSON.stringify(M.LIGHT_PATH_SELECTOR_CONTRACT.reuses)) &&
    /no second/.test(JSON.stringify(M.LIGHT_PATH_SELECTOR_CONTRACT.invariants)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-light-path-selector (V361 §2/P1 A-D,I: complexity→tier, fastest-correct model, local-first; LIGHT only when reliable — calibrated-low-P⇒ESCALATE [speed≠reliability], no-evidence⇒UNVERIFIED probe; latency NOT_MEASURED w/o real profile; recommends-only; composes decomposition-planner+model-router+capability-router+execution-routing, no 2nd engine)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
