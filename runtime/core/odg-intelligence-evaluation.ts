#!/usr/bin/env node
"use strict";
/*
 * V361 §3/P2 — INTELLIGENCE EVALUATION. PURE, deterministic, fail-closed, READ-ONLY. A reproducible, PER-AXIS evaluation of
 * the EXISTING brain against SEEDED problems whose correct answer is KNOWN — it measures real capability, it does NOT invent
 * a single global "intelligence score". It runs the canonical components (odg-hybrid-reasoning, decomposition-planner,
 * odg-light-path-selector) on fixed seeded cases and reports per-axis accuracy with the protocol; axes that require real
 * mission execution over time or an external benchmark are honestly NOT_MEASURED with the exact dependency.
 *
 * HONESTY (§3): NO global score (activity / module count / token count are NEVER evidence of intelligence). Each measured
 * axis states its protocol, its seeded ground truth (objective, not self-graded), its reproducibility, and its limits. An
 * axis that needs a real mission result, learning over time, or an external comparative benchmark is NOT_MEASURED — never
 * fabricated, never a flattering self-assessment.
 */

const HR = require("./odg-hybrid-reasoning.js");           // reasoning soundness (causal + uncertainty/contradiction)
const DP = require("./decomposition-planner.js");          // complexity classification / decomposition
const LP = require("./odg-light-path-selector.js");        // tool/path selection under reliability
const MI = require("./meta-intelligence.js");              // the integrity-inspector (system-under-test for verification)
const IMV = require("./inspector-meta-validation.js");     // meta-validates the inspector over a seeded defect corpus

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// ---- seeded eval sets (fixed ground truth; the correct answer is KNOWN, so the measurement is objective + reproducible) ----
const ent = (status: string) => ({ type: "x", status });
const rel = (from: string, to: string, status: string) => ({ from, to, type: "causes", status });
function runCases(cases: any[], fn: (c: any) => any, expected: (c: any) => any): any {
  let correct = 0; const details: any[] = [];
  for (const c of cases) { const got = fn(c); const exp = expected(c); const ok = got === exp; if (ok) correct++; details.push(freeze({ case: c.label, expected: exp, got, ok })); }
  return { cases: cases.length, correct, accuracy: cases.length ? +(correct / cases.length).toFixed(4) : null, details: freeze(details) };
}

// AXIS: reasoning soundness (causal structure × epistemic grounding) — known verdicts.
function evalReasoning(): any {
  const factual = { entities: { a: ent("OBSERVED"), b: ent("PROVEN"), c: ent("OBSERVED") }, relations: { e1: rel("a", "c", "OBSERVED"), e2: rel("b", "c", "PROVEN") } };
  const hypo = { entities: { h: ent("HYPOTHESIS"), c: ent("OBSERVED") }, relations: { e: rel("h", "c", "OBSERVED") } };
  const contra = { entities: { x: ent("CONTRADICTED"), c: ent("OBSERVED") }, relations: { e: rel("x", "c", "OBSERVED") } };
  // genuine MULTI-HOP (transitive) chains: a→b→c (the weakest-link status must be caught through the INTERMEDIATE b).
  const chainFactual = { entities: { a: ent("OBSERVED"), b: ent("OBSERVED"), c: ent("OBSERVED") }, relations: { e1: rel("a", "b", "OBSERVED"), e2: rel("b", "c", "OBSERVED") } };
  const chainHypoMid = { entities: { a: ent("OBSERVED"), b: ent("HYPOTHESIS"), c: ent("OBSERVED") }, relations: { e1: rel("a", "b", "OBSERVED"), e2: rel("b", "c", "OBSERVED") } };
  const cases = [
    { label: "all-factual causal (single hop)", model: factual, target: "c", expect: "DEDUCTIVE_FACTUAL" },
    { label: "hypothesis in support", model: hypo, target: "c", expect: "HYPOTHETICAL" },
    { label: "contradicted cause", model: contra, target: "c", expect: "UNSOUND" },
    { label: "absent target", model: factual, target: "ghost", expect: "UNGROUNDED" },
    { label: "MULTI-HOP all-factual chain a→b→c", model: chainFactual, target: "c", expect: "DEDUCTIVE_FACTUAL" },
    { label: "MULTI-HOP hypothesis INTERMEDIATE a→b(HYP)→c", model: chainHypoMid, target: "c", expect: "HYPOTHETICAL" },
  ];
  return runCases(cases, (c) => HR.reason(c.model, { mode: "causes", target: c.target }).soundness, (c) => c.expect);
}

// AXIS: complexity classification / decomposition — known classes.
function evalDecomposition(): any {
  const cases = [
    { label: "single trivial file", spec: { name: "format", architecture: [{ role: "format", contract: "x" }] }, expect: "TRIVIAL" },
    { label: "two-file simple project", spec: { name: "s", architecture: [{ role: "a", contract: "x" }, { role: "b", contract: "y" }] }, expect: "SIMPLE" },
    { label: "meta / code-analyzing", spec: { name: "detector", architecture: [{ role: "parse ast tokens", contract: "detect code references" }] }, expect: "META" },
    { label: "4-file project", spec: { name: "m", architecture: [{ role: "a", dependsOn: ["b"] }, { role: "b" }, { role: "c" }, { role: "d" }] }, expect: "COMPLEX" },
  ];
  return runCases(cases, (c) => DP.assessComplexity(c.spec).complexity, (c) => c.expect);
}

// AXIS: tool/path selection under reliability — known expected tiers.
function evalPathSelection(): any {
  const simple = { name: "format", architecture: [{ role: "format", contract: "x" }] };
  const meta = { name: "detector", architecture: [{ role: "parse ast tokens", contract: "detect code references" }] };
  const cases = [
    { label: "simple + reliable ⇒ light", input: { spec: simple, reliability: { quality: "CALIBRATED", pForPlanner: 0.85 } }, expect: "LIGHT_LOCAL" },
    { label: "simple + unreliable ⇒ escalate", input: { spec: simple, reliability: { quality: "CALIBRATED", pForPlanner: 0.2 } }, expect: "ESCALATE_PROVIDER" },
    { label: "meta ⇒ decompose", input: { spec: meta, reliability: { quality: "CALIBRATED", pForPlanner: 0.9 } }, expect: "DECOMPOSE" },
  ];
  return runCases(cases, (c) => LP.selectLightPath(c.input).pathTier, (c) => c.expect);
}

// AXIS: independent verification — treat ODG's integrity-inspector (meta-intelligence.assessIntegrity) as the SYSTEM UNDER
// TEST over a seeded DEFECTIVE/CLEAN corpus; measure whether it actually CATCHES seeded gaming (recall), fail-closed.
function evalIndependentVerification(): any {
  const flagged = (r: any) => r && (r.overall === "DETECTED" || r.overall === "SUSPECTED");
  const cases = [
    { id: "contamination-leak", label: "DEFECTIVE", input: { contamination: { benchmarkDigests: ["d1", "d2"], seenDigests: ["d1"] } }, detects: flagged },
    { id: "evaluator-capture", label: "DEFECTIVE", input: { evaluator: { evaluator: { id: "X" }, subject: { id: "X" } } }, detects: flagged },
    { id: "metric-gaming", label: "DEFECTIVE", input: { gaming: { metric: { before: 1, after: 2 }, manipulationMarker: true } }, detects: flagged },
    { id: "clean-contamination", label: "CLEAN", input: { contamination: { benchmarkDigests: ["a"], seenDigests: ["b"] } }, detects: flagged },
    { id: "clean-evaluator", label: "CLEAN", input: { evaluator: { evaluator: { id: "A" }, subject: { id: "B" } } }, detects: flagged },
  ];
  const mv = IMV.metaValidate({ inspector: (x: any) => MI.assessIntegrity(x), cases, minDetection: 1.0 });
  return { cases: cases.length, correct: mv.confusion.TP, accuracy: mv.detectionRate, effective: mv.effective === true, falsePositives: mv.confusion.FP, confusion: mv.confusion };
}

// the 16 axes (§3). measurability: MEASURED (seeded here), MEASURED_ELSEWHERE (another PR), NOT_MEASURED (+ dependency).
const AXES = Object.freeze([
  freeze({ id: "goal-understanding", label: "Understanding of goals", measurability: "NOT_MEASURED", dependency: "needs real tasked missions + an independent rubric (external benchmark / owner)" }),
  freeze({ id: "multi-step-reasoning", label: "Multi-step reasoning", measurability: "MEASURED", via: "reasoning" }),
  freeze({ id: "novel-problem-solving", label: "Novel-problem solving", measurability: "NOT_MEASURED", dependency: "needs an unseen held-out task set (external benchmark; local-model experiments exhausted)" }),
  freeze({ id: "decision-quality", label: "Decision quality", measurability: "MEASURED", via: "pathSelection" }),
  freeze({ id: "causal-reasoning", label: "Causal reasoning", measurability: "MEASURED", via: "reasoning" }),
  freeze({ id: "uncertainty-contradiction", label: "Uncertainty & contradiction handling", measurability: "MEASURED", via: "reasoning" }),
  freeze({ id: "learn-from-errors", label: "Learning from errors", measurability: "NOT_MEASURED", dependency: "needs real mission outcomes over time (before/after on live missions)" }),
  freeze({ id: "knowledge-reuse", label: "Knowledge reuse", measurability: "NOT_MEASURED", dependency: "needs a live retrieval→reuse loop with measured outcome" }),
  freeze({ id: "tool-use", label: "Tool use", measurability: "MEASURED", via: "pathSelection" }),
  freeze({ id: "decomposition", label: "Decomposition & mission conduct", measurability: "MEASURED", via: "decomposition" }),
  freeze({ id: "debugging-repair", label: "Debugging & repair", measurability: "NOT_MEASURED", dependency: "needs real defect corpus with ground-truth fixes (repair-apply is OWNER_GATED)" }),
  freeze({ id: "execution-autonomy", label: "Execution autonomy", measurability: "NOT_MEASURED", dependency: "needs a real end-to-end native execution (resident-driver beyond L0 is OWNER_GATED)" }),
  freeze({ id: "independent-verification", label: "Independent verification", measurability: "MEASURED", via: "independentVerification" }),
  freeze({ id: "anticipation", label: "Anticipation / forecast accuracy", measurability: "NOT_MEASURED", dependency: "needs real forecasts resolved over time (odg-forecast-memory mechanism exists; realized accuracy NOT_MEASURED)" }),
  freeze({ id: "complex-task-success", label: "Complex-task success", measurability: "NOT_MEASURED", dependency: "needs real complex missions executed end-to-end" }),
  freeze({ id: "speed-resource", label: "Speed & resource efficiency", measurability: "MEASURED_ELSEWHERE", via: "odg-mission-performance-profile (PR #838, real hrtime measurement)" }),
]);

/** evaluate(opts?) -> frozen per-axis report. Runs the seeded evals and attaches accuracy to the MEASURED axes. NO global score. */
function evaluate(opts: any = {}): any {
  const results = { reasoning: evalReasoning(), decomposition: evalDecomposition(), pathSelection: evalPathSelection(), independentVerification: evalIndependentVerification() };
  // per-eval protocol strings name the ACTUAL scope each axis measures (so a broad axis label never over-reads).
  const PROTOCOLS: Record<string, string> = {
    reasoning: "seeded causal/epistemic reasoning incl ≥2-hop transitive chains — known verdicts (FACTUAL/HYPOTHETICAL/UNSOUND/UNGROUNDED)",
    decomposition: "seeded complexity classification — known classes (TRIVIAL/SIMPLE/META/COMPLEX)",
    pathSelection: "seeded path/tool selection under reliability — known tiers (LIGHT_LOCAL/ESCALATE_PROVIDER/DECOMPOSE)",
    independentVerification: "integrity-gaming detection ONLY — inspector recall on seeded benchmark-contamination / evaluator-capture / metric-gaming (hard-marker paths); heuristic SUSPECTED paths NOT exercised, broader verification NOT covered",
  };
  const axes = AXES.map((a: any) => {
    if (a.measurability === "MEASURED" && a.via && (results as any)[a.via]) {
      const r = (results as any)[a.via];
      return freeze({ ...a, accuracy: r.accuracy, cases: r.cases, correct: r.correct, protocol: PROTOCOLS[a.via] || `seeded ${a.via} eval with KNOWN answers`, reproducible: true });
    }
    return freeze({ ...a });
  });
  const measured = axes.filter((a: any) => a.measurability === "MEASURED");
  const notMeasured = axes.filter((a: any) => a.measurability === "NOT_MEASURED");
  return freeze({
    axes: freeze(axes),
    seededEvals: freeze(results),
    // NOTE: measured axes derive from `distinctEvals` seeded evals (several axes can share ONE eval via the `via` field) —
    // so `measured` is a count of AXES, not of independent measurements; distinctEvals exposes the real evidence breadth.
    counts: freeze({ total: axes.length, measured: measured.length, measuredElsewhere: axes.filter((a: any) => a.measurability === "MEASURED_ELSEWHERE").length, notMeasured: notMeasured.length, distinctEvals: Object.keys(results).length }),
    globalScore: null,   // §3: NO artificial global intelligence score — never fabricated
    note: "per-axis intelligence evaluation on SEEDED problems (known answers ⇒ objective, reproducible). NO global score (activity / module count / token count are NEVER evidence of intelligence). An axis needing a real mission over time, learning over time, or an external comparative benchmark is NOT_MEASURED with its exact dependency — never a flattering self-assessment.",
  });
}

const INTELLIGENCE_EVALUATION_CONTRACT = Object.freeze({
  id: "V361-INTELLIGENCE-EVALUATION",
  purpose: "§3/P2 — reproducible PER-AXIS evaluation of the existing brain on seeded known-answer problems; no artificial global score; axes needing real missions/external benchmarks are NOT_MEASURED with the dependency",
  reuses: Object.freeze([
    "odg-hybrid-reasoning (causal + uncertainty/contradiction + multi-hop reasoning soundness)",
    "decomposition-planner (complexity classification) + odg-light-path-selector (tool/path decision)",
    "meta-intelligence.assessIntegrity + inspector-meta-validation.metaValidate (independent-verification: the inspector as system-under-test over a seeded defect corpus)",
    "odg-mission-performance-profile (speed/resource axis, measured in PR #838)",
  ]),
  invariants: Object.freeze([
    "NO global intelligence score — activity / module count / token count are NEVER evidence of intelligence",
    "measured axes use SEEDED ground truth (known answers ⇒ objective, reproducible, not self-graded); each states its protocol + limits",
    "an axis needing a real mission over time, learning over time, or an external comparative benchmark is NOT_MEASURED with the exact dependency — never fabricated",
    "PURE/deterministic/frozen READ-ONLY; runs the canonical components on fixed cases; no second reasoning/decomposition/selection engine",
  ]),
});

module.exports = { evaluate, AXES, INTELLIGENCE_EVALUATION_CONTRACT };
export {};
