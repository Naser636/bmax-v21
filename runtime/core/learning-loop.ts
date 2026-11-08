#!/usr/bin/env node
"use strict";

/*
 * WI-A5-35 — LEARNING LOOP (§A5). PURE, deterministic. Closes the cycle RESULT → EVIDENCE → EVALUATION → MEMORY
 * → LESSON → IMPROVEMENT → REUSE → RE-EVALUATION. REUSES memory-taxonomy (lessons are classified/indexed/
 * retrieved as memory records). Discipline: only EVIDENCED, REAL results count for facts (SIMULATED results are
 * excluded from facts, never promoted to observation); an improvement is "demonstrated" ONLY by a measured
 * before/after delta; regressions are detected; ONLY validated (consolidated+provenanced) lessons are reused.
 * Dual export.
 */

const MEM = require("./memory-taxonomy");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function hasEvidence(v: any): boolean { return arr(v).length > 0; }
function round(n: number): number { return Number(n.toFixed(6)); }

/** learn(input) -> learning result. input: { results:[{missionId,outcome,kind,failureKind?,evidence,metricBefore?,metricAfter?}], priorLessons? }. */
function learn(input: any): any {
  const i = isObj(input) ? input : {};
  const results = arr(i.results).filter(isObj);

  // RESULT → EVIDENCE (only evidenced results count) ; distinguish REAL vs SIMULATED (no promotion to fact)
  const evidenced = results.filter((r: any) => hasEvidence(r.evidence));
  const real = evidenced.filter((r: any) => r.kind === "REAL");
  const simulatedExcluded = evidenced.filter((r: any) => r.kind === "SIMULATED").length;

  // EVALUATION: recurring failures among REAL results (≥2 of the same failureKind)
  const failCounts: any = {};
  for (const r of real) if (r.outcome === "fail" && isStr(r.failureKind)) failCounts[r.failureKind] = (failCounts[r.failureKind] || 0) + 1;
  const recurring = Object.keys(failCounts).filter((k: string) => failCounts[k] >= 2).sort();

  // MEMORY → LESSON: a recurring real failure becomes a provenanced, consolidated memory record (family "failure")
  const lessonRecords = recurring.map((k: string) => ({ id: "lesson:" + k, family: "failure", provenance: "learning-loop", value: { avoid: k, count: failCounts[k] }, consolidated: true }));
  const lessonIndex = MEM.index(lessonRecords, 1); // reuses memory-taxonomy

  // IMPROVEMENT: measured before/after over REAL results carrying numeric metrics (a lesson alone is NOT improvement)
  const withMetrics = real.filter((r: any) => isNum(r.metricBefore) && isNum(r.metricAfter));
  const before = withMetrics.length ? round(withMetrics.reduce((a: number, r: any) => a + r.metricBefore, 0) / withMetrics.length) : null;
  const after = withMetrics.length ? round(withMetrics.reduce((a: number, r: any) => a + r.metricAfter, 0) / withMetrics.length) : null;
  const delta = before !== null && after !== null ? round(after - before) : null;
  const improved = delta !== null && delta > 0;
  const regressions = withMetrics.filter((r: any) => r.metricAfter < r.metricBefore).map((r: any) => r.missionId).filter(isStr).sort();

  // REUSE: only VALIDATED prior lessons (consolidated + provenanced, via memory-taxonomy) are reusable
  const reusable = MEM.retrieve(arr(i.priorLessons), { family: "failure", consolidation: "CONSOLIDATED", asOf: 1 }).map((c: any) => c.id).sort();

  return Object.freeze({
    measured: withMetrics.length > 0,
    lessons: Object.freeze(lessonRecords.map((l: any) => l.id)),
    lessonIndex,
    improvement: Object.freeze({ before, after, delta, improved }),
    regressions: Object.freeze(regressions),
    recurringErrors: Object.freeze(recurring),
    simulatedExcludedFromFacts: simulatedExcluded,
    reusableValidatedLessons: Object.freeze(reusable),
    note: "a lesson is not improvement; improvement requires a measured delta; SIMULATION is never promoted to fact",
  });
}

const LEARNING_LOOP_CONTRACT = Object.freeze({
  id: "WI-A5-35-LEARNING-LOOP",
  source: "§A5 — RESULT→EVIDENCE→EVALUATION→MEMORY→LESSON→IMPROVEMENT→REUSE→RE-EVALUATION (reuses memory-taxonomy)",
  notAuthority: "pure learning lens over supplied results; stores no authority; a lesson is a proposal, not a decision",
  invariants: Object.freeze([
    "pure/deterministic: results in → lessons + measured improvement out",
    "only EVIDENCED REAL results count as facts; SIMULATED results are excluded (never promoted to observation)",
    "improvement is demonstrated ONLY by a measured before/after delta; a stored lesson alone is not improvement",
    "regressions (after<before) are surfaced; only consolidated+provenanced prior lessons are reusable (via memory-taxonomy)",
  ]),
});

module.exports = { LEARNING_LOOP_CONTRACT, learn };

if (require.main === module) { process.stdout.write(JSON.stringify(LEARNING_LOOP_CONTRACT, null, 2) + "\n"); }

export {};
