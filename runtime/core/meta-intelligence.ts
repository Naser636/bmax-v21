#!/usr/bin/env node
"use strict";

/*
 * WI-META-07 — META-INTELLIGENCE integrity detectors (§32/§33). PURE, read-only analytic lens: it classifies
 * integrity risks from signals the caller SUPPLIES and NEVER mutates a policy, evaluation, benchmark or result.
 *
 * Phenomena: metric-gaming, evaluator-capture, benchmark-contamination. Each detector returns an explainable
 * Finding with a VERDICT, a confidence, the signals that drove it, and the evidence. Verdict discipline
 * (§63 "no fairness/accusation without protocol+evidence"; never turn a suspicion into a certain accusation):
 *   NO_DATA   — required inputs absent/empty (cannot assess).
 *   NONE      — assessed, no integrity concern found.
 *   SUSPECTED — heuristic signal(s) present but NOT conclusive (a flag to investigate, NOT an accusation).
 *   DETECTED  — HARD, incontrovertible evidence (e.g. exact leakage overlap, evaluator == subject identity).
 * Heuristic-only phenomena (metric-gaming) CANNOT reach DETECTED without an explicit hard marker.
 *
 * Does NOT duplicate existing eval/integrity modules (broad-it-eval leakage, autonomy-eval-harness,
 * independent-label-policy, third-party-agent-gate ASI01): it CONSUMES their kind of signals and classifies.
 * Dual export (CJS + ESM export {}) mirroring world-model/causal-graph.
 */

const VERDICTS = Object.freeze(["NO_DATA", "NONE", "SUSPECTED", "DETECTED"]);
const SEVERITY: any = Object.freeze({ NO_DATA: 0, NONE: 1, SUSPECTED: 2, DETECTED: 3 });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function strArray(v: any): string[] { return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; }
function clamp01(n: any): number { return typeof n === "number" && isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; }
function finding(phenomenon: any, verdict: any, confidence: any, signals: any, evidence: any, reason: any): any {
  return Object.freeze({ phenomenon, verdict, confidence: clamp01(confidence), signals: Object.freeze(signals || []), evidence: Object.freeze(evidence || []), reason });
}

/**
 * benchmark-contamination: HARD check — exact overlap between benchmark item digests and the "seen"
 * (training/previously-exposed) digests ⇒ DETECTED; no overlap ⇒ NONE; missing inputs ⇒ NO_DATA.
 * input: { benchmarkDigests: string[], seenDigests: string[], maxEvidence?: number }
 */
function detectBenchmarkContamination(input: any): any {
  const bench = strArray(input && input.benchmarkDigests);
  const seen = strArray(input && input.seenDigests);
  if (bench.length === 0 || seen.length === 0) {
    return finding("benchmark-contamination", "NO_DATA", 0, [{ name: "inputs", value: `bench=${bench.length},seen=${seen.length}`, explanation: "need both benchmark and seen digests" }], [], "insufficient data to assess contamination");
  }
  const seenSet = new Set(seen);
  const overlap = Array.from(new Set(bench.filter((d) => seenSet.has(d)))).sort();
  const cap = typeof (input && input.maxEvidence) === "number" ? input.maxEvidence : 20;
  if (overlap.length > 0) {
    const ratio = overlap.length / bench.length;
    return finding("benchmark-contamination", "DETECTED", Math.max(0.6, ratio), [
      { name: "leakedItems", value: overlap.length, explanation: "benchmark items whose digest appears in the seen set (exact match = leakage)" },
      { name: "leakRatio", value: Number(ratio.toFixed(4)), explanation: "fraction of the benchmark that is contaminated" },
    ], overlap.slice(0, cap), `${overlap.length}/${bench.length} benchmark items are present in the seen set (hard leakage)`);
  }
  return finding("benchmark-contamination", "NONE", 0, [{ name: "leakedItems", value: 0, explanation: "no digest overlap" }], [], "no benchmark/seen digest overlap found");
}

/**
 * evaluator-capture: an evaluator that shares identity/provenance with the subject it judges.
 * DETECTED on identical id or provenance; SUSPECTED on same model family (different provenance); NONE otherwise.
 * input: { evaluator: {id?, provenance?, model?}, subject: {id?, provenance?, model?} }
 */
function detectEvaluatorCapture(input: any): any {
  const e = isObj(input && input.evaluator) ? input.evaluator : null;
  const s = isObj(input && input.subject) ? input.subject : null;
  if (!e || !s || (!e.provenance && !e.id) || (!s.provenance && !s.id)) {
    return finding("evaluator-capture", "NO_DATA", 0, [{ name: "identity", value: "missing", explanation: "need evaluator and subject id/provenance" }], [], "insufficient identity/provenance to assess capture");
  }
  if ((e.id && s.id && e.id === s.id) || (e.provenance && s.provenance && e.provenance === s.provenance)) {
    return finding("evaluator-capture", "DETECTED", 0.95, [
      { name: "sharedIdentity", value: e.id === s.id ? "id" : "provenance", explanation: "the evaluator and the subject are the same actor / same provenance (self-evaluation)" },
    ], [{ evaluator: e.id || e.provenance, subject: s.id || s.provenance }], "evaluator and subject share identity/provenance — independence is violated");
  }
  if (e.model && s.model && e.model === s.model) {
    return finding("evaluator-capture", "SUSPECTED", 0.5, [
      { name: "sameModelFamily", value: e.model, explanation: "evaluator and subject use the same model family (self-preference risk; not conclusive)" },
    ], [], "same model family judging itself — investigate; not a confirmed capture");
  }
  return finding("evaluator-capture", "NONE", 0, [{ name: "independence", value: "distinct", explanation: "distinct identity/provenance and model" }], [], "evaluator appears independent of the subject");
}

/**
 * metric-gaming (Goodhart): an optimized metric improves while an INDEPENDENT measure does not, or the gain is
 * concentrated on re-tested items. HEURISTIC ⇒ caps at SUSPECTED; DETECTED only with an explicit hard marker.
 * input: { metric: {name?, before, after}, independentCheck?: {before, after}, scope?: {total, retestedImproved}, manipulationMarker?: boolean }
 */
function detectMetricGaming(input: any): any {
  const m = isObj(input && input.metric) ? input.metric : null;
  if (!m || typeof m.before !== "number" || typeof m.after !== "number") {
    return finding("metric-gaming", "NO_DATA", 0, [{ name: "metric", value: "missing", explanation: "need metric.before and metric.after (numbers)" }], [], "insufficient metric data to assess gaming");
  }
  if (input && input.manipulationMarker === true) {
    return finding("metric-gaming", "DETECTED", 0.9, [{ name: "manipulationMarker", value: true, explanation: "caller supplied hard evidence of manipulation" }], [], "explicit manipulation marker present");
  }
  const improved = m.after > m.before;
  const signals: any[] = [];
  let suspected = false;
  const ind = isObj(input && input.independentCheck) ? input.independentCheck : null;
  if (improved && ind && typeof ind.before === "number" && typeof ind.after === "number" && ind.after <= ind.before) {
    suspected = true;
    signals.push({ name: "goodhartDivergence", value: `metric +${(m.after - m.before).toFixed(4)} / independent ${(ind.after - ind.before).toFixed(4)}`, explanation: "the optimized metric improved while an independent measure did not (Goodhart signal)" });
  }
  const sc = isObj(input && input.scope) ? input.scope : null;
  if (improved && sc && typeof sc.total === "number" && sc.total > 0 && typeof sc.retestedImproved === "number") {
    const conc = sc.retestedImproved / sc.total;
    if (conc >= 0.8) { suspected = true; signals.push({ name: "retestConcentration", value: Number(conc.toFixed(4)), explanation: "the gain is concentrated on re-tested items (overfitting-to-test signal)" }); }
  }
  if (suspected) {
    return finding("metric-gaming", "SUSPECTED", 0.55, signals, [], "heuristic gaming signal(s) present — a flag to investigate, NOT a confirmed accusation");
  }
  if (!improved) {
    return finding("metric-gaming", "NONE", 0, [{ name: "trend", value: "no-improvement", explanation: "metric did not improve ⇒ no gaming concern" }], [], "metric did not improve");
  }
  return finding("metric-gaming", "NONE", 0, [{ name: "corroborated", value: true, explanation: "improvement not contradicted by any supplied independent/scope signal" }], [], "improvement not flagged by the supplied signals");
}

/** assessIntegrity — run all detectors over a bundle and summarise the worst posture (does NOT accuse). */
function assessIntegrity(input: any): any {
  const findings = [
    detectBenchmarkContamination((input && input.contamination) || {}),
    detectEvaluatorCapture((input && input.evaluator) || {}),
    detectMetricGaming((input && input.gaming) || {}),
  ];
  let worst = "NO_DATA";
  for (const f of findings) if (SEVERITY[f.verdict] > SEVERITY[worst]) worst = f.verdict;
  const anyData = findings.some((f) => f.verdict !== "NO_DATA");
  return Object.freeze({
    overall: anyData ? worst : "NO_DATA",
    note: worst === "DETECTED" ? "hard integrity evidence found" : worst === "SUSPECTED" ? "heuristic concern(s) to investigate — not confirmed" : anyData ? "no integrity concern found in the supplied signals" : "insufficient data",
    findings: Object.freeze(findings),
  });
}

const META_INTELLIGENCE_CONTRACT = Object.freeze({
  id: "WI-META-07-META-INTELLIGENCE",
  source: "FICHE §32 Meta-Intelligence + §33 Integrity of Evaluation + §63 (no accusation without protocol+evidence)",
  verdicts: VERDICTS,
  phenomena: Object.freeze(["metric-gaming", "evaluator-capture", "benchmark-contamination"]),
  notAuthority: "read-only analytic lens; mutates no policy/evaluation/benchmark/result; flags risk, never decides",
  invariants: Object.freeze([
    "pure/deterministic: signals in → findings out; no mutation, no clock/random",
    "NO_DATA vs NONE vs SUSPECTED vs DETECTED are distinct; a suspicion is never presented as a certain accusation",
    "DETECTED requires HARD evidence (exact leakage overlap / shared evaluator-subject identity / explicit marker)",
    "every finding carries explainable signals + confidence + evidence",
  ]),
});

module.exports = {
  VERDICTS, META_INTELLIGENCE_CONTRACT,
  detectBenchmarkContamination, detectEvaluatorCapture, detectMetricGaming, assessIntegrity,
};

if (require.main === module) {
  process.stdout.write(JSON.stringify(META_INTELLIGENCE_CONTRACT, null, 2) + "\n");
}

export {};
