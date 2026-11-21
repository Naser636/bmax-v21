#!/usr/bin/env node
"use strict";
/*
 * V361 §2/P1 — LIGHT-PATH SELECTOR RUN (demonstrator). Routes a few SYNTHETIC task specs through odg-light-path-selector to
 * show the lightest RELIABLE path per task: complexity → tier, fastest-correct model, local-first, reliability-gated.
 * READ-ONLY, recommends only. Specs/reliability are SYNTHETIC (mechanism demonstration, not real missions).
 *
 * Usage: npx tsx runtime/bin/odg-light-path-selector-run.ts
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const LP = require(path.join(ROOT, "runtime", "core", "odg-light-path-selector.js"));

const scenarios = [
  { label: "simple task, calibrated-reliable local", input: { spec: { name: "format a date", architecture: [{ role: "format", contract: "x" }] }, reliability: { quality: "CALIBRATED", pForPlanner: 0.82 }, latencyBudgetMs: 200, measuredLatencyMs: 43 } },
  { label: "simple task but calibrated-UNRELIABLE local", input: { spec: { name: "format a date", architecture: [{ role: "format", contract: "x" }] }, reliability: { quality: "CALIBRATED", pForPlanner: 0.2 } } },
  { label: "simple task, NO reliability evidence", input: { spec: { name: "format a date", architecture: [{ role: "format", contract: "x" }] } } },
  { label: "meta/code-analyzing task (decompose)", input: { spec: { name: "undefined symbol detector", architecture: [{ role: "parse AST tokens", contract: "detect code references" }] }, reliability: { quality: "CALIBRATED", pForPlanner: 0.9 } } },
  { label: "complex multi-file task", input: { spec: { name: "pipeline", architecture: [{ role: "a", dependsOn: ["b"] }, { role: "b", dependsOn: ["c"] }, { role: "c", dependsOn: ["d"] }, { role: "d" }] }, reliability: { quality: "CALIBRATED", pForPlanner: 0.9 } } },
];

const results = scenarios.map((s) => {
  const r = LP.selectLightPath(s.input);
  return { scenario: s.label, complexity: r.complexity, pathTier: r.pathTier, model: r.model, reliabilityGate: r.reliability.gate, expectedLatency: r.expectedLatency.status, fitsBudget: r.fitsBudget, recommendation: r.recommendation };
});

process.stdout.write(JSON.stringify({ lightPathSelector: "V361 §2/P1 — lightest RELIABLE path per task (SYNTHETIC specs; recommends only).", results }, null, 2) + "\n");
const light = results.filter((r) => r.pathTier === "LIGHT_LOCAL").length;
process.stdout.write(`\nLIGHT-PATH: ${results.length} tasks; ${light} routed to the LIGHT_LOCAL path. ` +
  `A LIGHT path is chosen ONLY when reliability permits — calibrated-unreliable ⇒ ESCALATE (speed never overrides reliability); no calibrated evidence ⇒ UNVERIFIED (probe to gather data); meta/complex ⇒ decompose / deeper reasoning. Expected latency is NOT_MEASURED without a real measured profile. Recommends only (applies nothing). SYNTHETIC demonstration.\n`);
process.exit(0);
export {};
