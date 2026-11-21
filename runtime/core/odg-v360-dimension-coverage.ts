#!/usr/bin/env node
"use strict";
/*
 * V360 §10/§14 — DIMENSION COVERAGE (Boussole completeness). PURE, deterministic, READ-ONLY. Answers "across the 15 strategic
 * V360 dimensions, which are COVERED, which are THIN, which are BLIND spots?" — grounded in the compass (PR-anchored tracked
 * capabilities) AND the REAL module/consumer graph (so a dimension backed by a consumer-backed module the compass does not
 * list is honestly COVERED, not a false blind spot). It is NOT a second roadmap/compass: it is a lens over odg-v360-compass +
 * injected module/consumer checks.
 *
 * HONESTY: a dimension is COVERED only if a representative module is TRACKED (a merged-PR compass capability) OR
 * OPERATIONAL_UNTRACKED (exists + a real non-test consumer); a module that merely EXISTS with no consumer is EXISTS_ORPHAN
 * (does not make a dimension covered); ABSENT modules are named. Blind spots are reported honestly — coverage is never claimed
 * without a real backing module.
 */

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

// the 15 strategic V360 dimensions → representative module(s). (Directive §14 scope reminder, NOT a new roadmap.)
const DIMENSIONS = Object.freeze([
  freeze({ id: "deep-reasoning", label: "Deep reasoning", modules: ["odg-hybrid-reasoning", "inference-engine"] }),
  freeze({ id: "frontier-radar-anticipation", label: "Frontier Radar + anticipation", modules: ["frontier-radar", "odg-forecast-memory", "odg-radar-foresight-calibration"] }),
  freeze({ id: "world-model-knowledge", label: "World Model / knowledge", modules: ["world-model", "knowledge-engine"] }),
  freeze({ id: "hybrid-reasoning-engine", label: "Hybrid reasoning engine", modules: ["odg-hybrid-reasoning", "causal-graph", "world-model"] }),
  freeze({ id: "memory-cumulative-learning", label: "Memory / cumulative learning", modules: ["memory-taxonomy", "learning-loop", "compounding-loop", "odg-native-learning-pass"] }),
  freeze({ id: "meta-intelligence", label: "Meta-intelligence / self-evaluation", modules: ["meta-intelligence", "evaluator-independence", "inspector-meta-validation"] }),
  freeze({ id: "multi-agent", label: "Multi-agent intelligence / orchestration", modules: ["odg-mission-orchestrator", "delegate-isolation"] }),
  freeze({ id: "model-intelligence", label: "Model intelligence / selection", modules: ["odg-model-intelligence", "odg-execution-routing"] }),
  freeze({ id: "performance-speed", label: "Performance & speed", modules: ["performance-observability", "latency-measure", "parallel-execution-planner"] }),
  freeze({ id: "multimodal", label: "Multimodal intelligence", modules: ["odg-multimodal-ingest", "odg-video-analysis-chain"] }),
  freeze({ id: "autonomous-engineering", label: "Autonomous engineering", modules: ["native-engineering-cycle", "odg-decomposed-execution"] }),
  freeze({ id: "self-diagnostic-repair", label: "Self-diagnostic / self-repair", modules: ["repair-planner", "validation-engine", "odg-self-healing-run"] }),
  freeze({ id: "self-improvement-evolution", label: "Self-improvement / evolution", modules: ["odg-self-improvement-cycle", "odg-night-cycle-scheduler"] }),
  freeze({ id: "experimentation-validation", label: "Experimentation / scientific validation", modules: ["odg-hypothesis-driven-mission", "improvement-baseline", "calibration"] }),
  freeze({ id: "boussole-governance", label: "Boussole V12.4 / governance", modules: ["odg-v360-compass", "odg-system-coverage"] }),
]);

/**
 * buildDimensionCoverage(opts) -> frozen report. opts: {
 *   compass (odg-v360-compass.buildCompass result — for PR-anchored TRACKED capabilities),
 *   moduleExists(name)->bool, hasConsumer(name)->bool (REAL module/consumer checks; injected — the bin supplies the real ones) }.
 * Per dimension: each representative module is TRACKED / OPERATIONAL_UNTRACKED / EXISTS_ORPHAN / ABSENT; the dimension is
 * COVERED (≥1 tracked or operational-untracked), THIN (only orphan modules), or BLIND (all absent).
 */
function buildDimensionCoverage(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const compass = isObj(o.compass) ? o.compass : {};
  const moduleExists = typeof o.moduleExists === "function" ? o.moduleExists : () => false;
  const hasConsumer = typeof o.hasConsumer === "function" ? o.hasConsumer : () => false;
  // module names that are a PR-anchored compass capability currently CONNECTED/DONE_OPERATIONAL.
  const tracked = new Set<string>();
  for (const c of arr(compass.capabilities)) if (isObj(c) && typeof c.module === "string" && (c.status === "CONNECTED" || c.status === "DONE_OPERATIONAL")) tracked.add(c.module);

  const classify = (name: string): string => {
    if (tracked.has(name)) return "TRACKED";
    if (moduleExists(name) && hasConsumer(name)) return "OPERATIONAL_UNTRACKED";
    if (moduleExists(name)) return "EXISTS_ORPHAN";
    return "ABSENT";
  };

  const dimensions = DIMENSIONS.map((d: any) => {
    const modules = d.modules.map((m: string) => freeze({ module: m, status: classify(m) }));
    const strong = modules.filter((m: any) => m.status === "TRACKED" || m.status === "OPERATIONAL_UNTRACKED").length;
    const orphan = modules.filter((m: any) => m.status === "EXISTS_ORPHAN").length;
    const coverage = strong > 0 ? "COVERED" : orphan > 0 ? "THIN" : "BLIND";
    return freeze({ id: d.id, label: d.label, coverage, strong, modules: freeze(modules) });
  });

  const by = (c: string) => dimensions.filter((d: any) => d.coverage === c);
  return freeze({
    dimensions: freeze(dimensions),
    counts: freeze({ total: dimensions.length, covered: by("COVERED").length, thin: by("THIN").length, blind: by("BLIND").length }),
    blindSpots: freeze(by("BLIND").map((d: any) => d.id)),
    thinSpots: freeze(by("THIN").map((d: any) => d.id)),
    note: "Boussole completeness over the 15 V360 dimensions. COVERED = a representative module is a PR-anchored compass capability OR exists with a real non-test consumer; THIN = only orphan modules; BLIND = no backing module. Coverage is never claimed without a real backing module; blind/thin spots are named honestly. A lens over odg-v360-compass + the real module/consumer graph — no second roadmap.",
  });
}

const DIMENSION_COVERAGE_CONTRACT = Object.freeze({
  id: "V360-DIMENSION-COVERAGE",
  purpose: "§10/§14 — Boussole completeness across the 15 strategic V360 dimensions; grounds each in the compass (PR-anchored) + the real module/consumer graph; names blind/thin spots honestly; a lens, not a second roadmap",
  reuses: Object.freeze(["odg-v360-compass.buildCompass (PR-anchored tracked capabilities)", "injected real module-exists + has-consumer checks (the bin supplies them from change-impact-graph + odg-consumer-scan)"]),
  invariants: Object.freeze([
    "a dimension is COVERED only with a real backing module: TRACKED (merged-PR compass capability) OR OPERATIONAL_UNTRACKED (exists + real non-test consumer)",
    "a module that merely EXISTS with no consumer is EXISTS_ORPHAN (does NOT make a dimension covered); THIN = only orphans; BLIND = no backing module",
    "coverage is never claimed without a real backing module; blind/thin spots are reported honestly",
    "PURE/deterministic/frozen READ-ONLY lens over odg-v360-compass + the real module/consumer graph; no second roadmap/compass",
  ]),
});

module.exports = { buildDimensionCoverage, DIMENSIONS, DIMENSION_COVERAGE_CONTRACT };
export {};
