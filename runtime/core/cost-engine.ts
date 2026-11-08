#!/usr/bin/env node
"use strict";

/*
 * WI-P9-25 — COST ENGINE (P9 FinOps & AI Cost Engineering). PURE, deterministic. A cost MODEL + attribution
 * (per mission / per métier / per unit-of-result) + budgets + alerts + anomaly detection + scenario comparison.
 * Every cost figure carries a KIND — OBSERVED | ESTIMATED | SIMULATED — and the engine NEVER presents a
 * synthetic/estimated cost as a real spend. No network/clock. Dual export.
 */

const COST_KINDS = Object.freeze(["OBSERVED", "ESTIMATED", "SIMULATED"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any): number { return typeof v === "number" && isFinite(v) ? v : 0; }
function round(n: number): number { return Number(n.toFixed(6)); }
function kindOf(k: any): any { return COST_KINDS.includes(k) ? k : "ESTIMATED"; }

/** estimate(usage, rates) -> { cost, kind, resource }. usage: { units, resource, kind? }; rates: {resource: perUnit}. */
function estimate(usage: any, rates: any): any {
  const u = isObj(usage) ? usage : {};
  const r = isObj(rates) ? rates : {};
  const rate = num(r[u.resource]);
  return Object.freeze({ cost: round(num(u.units) * rate), kind: kindOf(u.kind), resource: typeof u.resource === "string" ? u.resource : null });
}

/** attribute(entries, rates) -> aggregates. entries: [{missionId, metier, unit?, units, resource, kind?}]. */
function attribute(entries: any, rates: any): any {
  const list = (Array.isArray(entries) ? entries : []).filter(isObj);
  const byMission: any = {}; const byMetier: any = {}; const byResource: any = {}; const byUnit: any = {};
  let total = 0; const kinds: any = {};
  for (const e of list) {
    const c = estimate(e, rates).cost;
    total += c;
    kinds[kindOf(e.kind)] = round(num(kinds[kindOf(e.kind)]) + c);
    if (typeof e.missionId === "string") byMission[e.missionId] = round(num(byMission[e.missionId]) + c);
    if (typeof e.metier === "string") byMetier[e.metier] = round(num(byMetier[e.metier]) + c);
    if (typeof e.resource === "string") byResource[e.resource] = round(num(byResource[e.resource]) + c);
    if (typeof e.unit === "string") byUnit[e.unit] = round(num(byUnit[e.unit]) + c);
  }
  return Object.freeze({ total: round(total), kinds: Object.freeze(kinds), byMission: Object.freeze(byMission), byMetier: Object.freeze(byMetier), byResource: Object.freeze(byResource), byUnit: Object.freeze(byUnit) });
}

/** checkBudget(spent, budget) -> { withinBudget, overBy }. */
function checkBudget(spent: any, budget: any): any {
  const s = num(spent); const b = num(budget);
  return Object.freeze({ withinBudget: s <= b, overBy: round(Math.max(0, s - b)) });
}

/** alerts(byScope, budgets) -> [{ id, spent, budget, overBy }] for scopes over budget (sorted by overBy desc). */
function alerts(byScope: any, budgets: any): any[] {
  const bs = isObj(byScope) ? byScope : {}; const bud = isObj(budgets) ? budgets : {};
  const out: any[] = [];
  for (const id of Object.keys(bs).sort()) {
    if (!Object.prototype.hasOwnProperty.call(bud, id)) continue;
    const chk = checkBudget(bs[id], bud[id]);
    if (!chk.withinBudget) out.push(Object.freeze({ id, spent: round(num(bs[id])), budget: round(num(bud[id])), overBy: chk.overBy }));
  }
  out.sort((a: any, b: any) => (b.overBy - a.overBy) || (a.id < b.id ? -1 : 1));
  return out;
}

/** detectAnomalies(values, k) -> indices where value > mean + k*stddev (deterministic). Default k=2. */
function detectAnomalies(values: any, k?: any): number[] {
  const xs = (Array.isArray(values) ? values : []).map(num);
  if (xs.length < 2) return [];
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length;
  const std = Math.sqrt(variance);
  const kk = typeof k === "number" ? k : 2;
  const thr = mean + kk * std;
  const out: number[] = [];
  for (let i = 0; i < xs.length; i++) if (std > 0 && xs[i] > thr) out.push(i);
  return out;
}

/** compareScenarios(scenarios) -> ranked by cost asc, then cost-per-perf (cost/throughput) asc. */
function compareScenarios(scenarios: any): any[] {
  const out = (Array.isArray(scenarios) ? scenarios : []).filter(isObj).map((s: any) => Object.freeze({
    name: typeof s.name === "string" ? s.name : null,
    cost: round(num(s.cost)),
    throughput: num(s.throughput),
    costPerUnit: num(s.throughput) > 0 ? round(num(s.cost) / num(s.throughput)) : null,
    kind: kindOf(s.kind),
  }));
  out.sort((a: any, b: any) => (a.cost - b.cost) || ((a.costPerUnit === null ? Infinity : a.costPerUnit) - (b.costPerUnit === null ? Infinity : b.costPerUnit)) || (String(a.name) < String(b.name) ? -1 : 1));
  return out;
}

const COST_ENGINE_CONTRACT = Object.freeze({
  id: "WI-P9-25-COST-ENGINE",
  source: "P9 FinOps & AI Cost Engineering — cost model + attribution + budgets + alerts + anomaly + scenario compare",
  costKinds: COST_KINDS,
  notAuthority: "pure cost MODEL; every figure is OBSERVED|ESTIMATED|SIMULATED; a synthetic/estimated cost is NEVER a real spend",
  invariants: Object.freeze([
    "pure/deterministic: usage + rates in → costs out; no clock/random; rounded",
    "every cost carries a kind; SIMULATED/ESTIMATED are never presented as OBSERVED spend",
    "attribution: per mission / métier / resource / unit-of-result + total",
    "budgets + alerts are fail-closed (over-budget surfaced); anomaly = value > mean + k·stddev",
    "scenario comparison ranks by cost then cost-per-unit (deterministic)",
  ]),
});

module.exports = { COST_KINDS, COST_ENGINE_CONTRACT, estimate, attribute, checkBudget, alerts, detectAnomalies, compareScenarios };

if (require.main === module) {
  process.stdout.write(JSON.stringify(COST_ENGINE_CONTRACT, null, 2) + "\n");
}

export {};
