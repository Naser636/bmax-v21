#!/usr/bin/env node
"use strict";
/*
 * V361 §3/P2 — INTELLIGENCE EVALUATION RUN (runtime entry). Runs the per-axis evaluation of the REAL brain on seeded
 * known-answer problems and prints it honestly: measured axes with their accuracy + protocol, and the axes that are
 * NOT_MEASURED (needing real missions over time or an external comparative benchmark) with the exact dependency. NO global
 * score. READ-ONLY, deterministic.
 *
 * Usage: npx tsx runtime/bin/odg-intelligence-evaluation-run.ts
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const IE = require(path.join(ROOT, "runtime", "core", "odg-intelligence-evaluation.js"));

const r = IE.evaluate();
process.stdout.write(JSON.stringify({
  intelligenceEvaluation: "V361 §3/P2 — per-axis evaluation on SEEDED known-answer problems. NO global score (activity/tokens ≠ intelligence).",
  counts: r.counts,
  globalScore: r.globalScore,
  axes: r.axes.map((a: any) => ({ id: a.id, measurability: a.measurability, accuracy: a.accuracy ?? null, cases: a.cases ?? null, via: a.via ?? null, dependency: a.dependency ?? null })),
}, null, 2) + "\n");
process.stdout.write(`\nINTELLIGENCE-EVAL: ${r.counts.measured} axes MEASURED here (seeded, objective), ${r.counts.measuredElsewhere} MEASURED_ELSEWHERE, ${r.counts.notMeasured} NOT_MEASURED (need real missions over time or external benchmarks). ` +
  `Reasoning ${r.seededEvals.reasoning.correct}/${r.seededEvals.reasoning.cases}, decomposition ${r.seededEvals.decomposition.correct}/${r.seededEvals.decomposition.cases}, path-selection ${r.seededEvals.pathSelection.correct}/${r.seededEvals.pathSelection.cases} on known answers. ` +
  `NO global intelligence score — activity / module count / token count are NEVER evidence of intelligence; NOT_MEASURED axes carry their exact dependency, never a flattering self-assessment.\n`);
process.exit(0);
export {};
