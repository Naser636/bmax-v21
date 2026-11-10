#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V31.2 LOT 1 (Mission Intelligence) + §10 optimization + §6.7 decision — MULTI-CRITERIA PLAN EVALUATOR.
 * PURE, deterministic, fail-closed, EXPLAINABLE. Implements the governed objective:
 *   J(π) = w1·Psuccess + w2·Vobjective + w3·Qquality − w4·Ttime − w5·Cresources − w6·Rrisk − w7·Uuncertainty
 * HARD CONSTRAINTS are enforced BEFORE any optimization (§10): a plan violating a hard constraint is INFEASIBLE and can
 * never win on score. Among feasible plans, the one with the highest J is selected; the result EXPLAINS the per-criterion
 * contributions, why the winner beats each runner-up, the rejected (infeasible) plans, and what information is missing.
 * Fail-closed: a missing benefit factor ⇒ 0 (no flattering default); a missing risk/uncertainty factor ⇒ 1 (worst-case) —
 * a plan is never rated better for being under-specified. It optimizes nothing by fiat; it ranks + explains. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
// benefit factor (higher better): missing ⇒ 0 (no credit). clamp [0,1].
function benefit(v: any): number { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; }
// cost/risk factor (higher worse): missing ⇒ 1 (worst-case). clamp [0,1].
function cost(v: any): number { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1; }

const DEFAULT_WEIGHTS = Object.freeze({ Psuccess: 1.0, Vobjective: 1.0, Qquality: 0.8, Ttime: 0.5, Cresources: 0.5, Rrisk: 1.0, Uuncertainty: 0.7 });

/** checkHardConstraints(plan) -> { feasible, violations[] }. Hard constraints (§10) are checked BEFORE optimization. A
 *  plan that violates POLICY/authorization/write-set/Truth-Lock or a declared hard constraint is INFEASIBLE. */
function checkHardConstraints(plan: any): any {
  const p = isObj(plan) ? plan : {};
  const violations: string[] = [];
  if (p.policyAllowed === false) violations.push("POLICY denies this plan");
  if (p.authorized === false) violations.push("plan not authorized");
  if (p.truthLockSafe === false) violations.push("Truth-Lock unsafe");
  if (p.withinWriteSet === false) violations.push("plan edits outside the authorized write-set");
  for (const c of arr(p.hardConstraints)) if (c && c.satisfied === false) violations.push(`hard constraint unmet: ${c.name || "unnamed"}`);
  return Object.freeze({ feasible: violations.length === 0, violations: Object.freeze(violations) });
}

/** scorePlan(plan, weights) -> { J, feasible, violations, contributions }. Feasibility first; infeasible ⇒ J = -Infinity. */
function scorePlan(plan: any, weights: any = DEFAULT_WEIGHTS): any {
  const w = isObj(weights) ? { ...DEFAULT_WEIGHTS, ...weights } : DEFAULT_WEIGHTS;
  const hc = checkHardConstraints(plan);
  const m = isObj(plan) && isObj(plan.metrics) ? plan.metrics : {};
  const c: any = {
    Psuccess: w.Psuccess * benefit(m.Psuccess), Vobjective: w.Vobjective * benefit(m.Vobjective), Qquality: w.Qquality * benefit(m.Qquality),
    Ttime: -w.Ttime * cost(m.Ttime), Cresources: -w.Cresources * cost(m.Cresources), Rrisk: -w.Rrisk * cost(m.Rrisk), Uuncertainty: -w.Uuncertainty * cost(m.Uuncertainty),
  };
  const J = hc.feasible ? Object.values(c).reduce((a: number, x: any) => a + x, 0) : -Infinity;
  const missing = ["Psuccess", "Vobjective", "Qquality", "Ttime", "Cresources", "Rrisk", "Uuncertainty"].filter((k) => !Number.isFinite(Number(m[k])));
  return Object.freeze({ id: (plan && plan.id) || "(plan)", J: Number.isFinite(J) ? Number(J.toFixed(4)) : J, feasible: hc.feasible, violations: hc.violations, contributions: Object.freeze(c), missingFactors: Object.freeze(missing) });
}

/**
 * evaluatePlans(plans, opts) -> { selected, ranking, rejected, explanation }. Ranks FEASIBLE plans by J (desc); INFEASIBLE
 * plans are rejected (never selected, whatever their raw benefits). Explains the winner vs each runner-up and lists missing
 * information. Deterministic (ties broken by id for reproducibility).
 */
function evaluatePlans(plans: any, opts: any = {}): any {
  const weights = isObj(opts.weights) ? opts.weights : DEFAULT_WEIGHTS;
  const scored = arr(plans).map((p) => scorePlan(p, weights));
  const feasible = scored.filter((s) => s.feasible).sort((a, b) => (b.J - a.J) || String(a.id).localeCompare(String(b.id)));
  const rejected = scored.filter((s) => !s.feasible).map((s) => ({ id: s.id, violations: s.violations }));
  const selected = feasible[0] || null;
  const explanation = selected
    ? feasible.slice(1).map((r) => ({ over: r.id, byMargin: Number((selected.J - r.J).toFixed(4)), reason: `'${selected.id}' scores J=${selected.J} vs '${r.id}' J=${r.J} (higher net value after risk/uncertainty penalties)` }))
    : [];
  return Object.freeze({
    selected: selected ? selected.id : null,
    selectedScore: selected || null,
    ranking: Object.freeze(feasible.map((s) => ({ id: s.id, J: s.J }))),
    rejected: Object.freeze(rejected),
    missingInformation: selected ? selected.missingFactors : [],
    explanation: Object.freeze(explanation),
    note: selected ? "selected the highest-J FEASIBLE plan; hard constraints were enforced before optimization; decision is explainable + reproducible" : "no feasible plan — all violate a hard constraint (fail-closed, nothing selected)",
  });
}

const PLAN_EVALUATOR_CONTRACT = Object.freeze({
  id: "V124-PLAN-EVALUATOR",
  source: "CTO V31.2 LOT 1 / §10 — multi-criteria plan evaluation (NASA-style constrained decision, adapted)",
  reuses: Object.freeze(["plan metrics (composed)", "POLICY/authorization/Truth-Lock/write-set as hard constraints"]),
  notAuthority: "ranks and explains feasible plans; it selects no action and grants no authority — the governed caller decides + authorizes",
  invariants: Object.freeze([
    "HARD constraints are enforced BEFORE optimization: an infeasible plan is NEVER selected, whatever its benefits",
    "J balances benefits (success/value/quality) against costs (time/resources/risk/uncertainty) — speed alone never wins",
    "fail-closed factors: a missing benefit ⇒ 0 (no credit); a missing risk/uncertainty ⇒ 1 (worst-case) — under-specified plans are not favoured",
    "the decision is EXPLAINABLE (per-criterion contributions, winner-vs-runner-up margins, rejected plans) and reproducible (deterministic tie-break)",
    "missing information is reported, never silently assumed favourable",
  ]),
});

module.exports = { DEFAULT_WEIGHTS, checkHardConstraints, scorePlan, evaluatePlans, PLAN_EVALUATOR_CONTRACT };

if (require.main === module) {
  const plans = [
    { id: "fast-risky", metrics: { Psuccess: 0.6, Vobjective: 0.7, Qquality: 0.5, Ttime: 0.1, Cresources: 0.2, Rrisk: 0.8, Uuncertainty: 0.7 } },
    { id: "slower-reliable", metrics: { Psuccess: 0.95, Vobjective: 0.7, Qquality: 0.9, Ttime: 0.5, Cresources: 0.4, Rrisk: 0.1, Uuncertainty: 0.1 } },
    { id: "infeasible", policyAllowed: false, metrics: { Psuccess: 0.99, Vobjective: 1, Qquality: 1, Ttime: 0, Cresources: 0, Rrisk: 0, Uuncertainty: 0 } },
  ];
  const r = evaluatePlans(plans);
  process.stdout.write(JSON.stringify({ ...PLAN_EVALUATOR_CONTRACT, demo: { selected: r.selected, reliableBeatsFastRisky: r.selected === "slower-reliable", infeasibleRejected: r.rejected.some((x: any) => x.id === "infeasible") } }, null, 2) + "\n");
}

export {};
