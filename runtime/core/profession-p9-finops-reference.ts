#!/usr/bin/env node
"use strict";

/*
 * V12.4 §43 P9 — FinOps/Cloud-Economics/AI-Cost reference project (E2 + E3). PURE, deterministic. Over CLEARLY-LABELLED
 * SYNTHETIC FOCUS-style billing it computes cost per mission and aggregates with OBSERVED / ESTIMATED / SIMULATED kept
 * STRICTLY SEPARATE (V12.4 F11/§9 doctrine — never conflate measured vs modelled vs simulated), and enforces a
 * budget-stop. Synthetic only; real cloud-billing (private, tenant-identifying) is owner-gated NOT_RUN. Dual export.
 */

const COST_KINDS = Object.freeze(["OBSERVED", "ESTIMATED", "SIMULATED"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) ? v : d; }
function round(n: number): number { return Number(n.toFixed(4)); }

/** computeCosts(lineItems) -> { byKind:{OBSERVED,ESTIMATED,SIMULATED}, perMissionObserved, conflated }. Kinds kept separate. */
function computeCosts(lineItems: any): any {
  const items = arr(lineItems).filter(isObj);
  const byKind: any = { OBSERVED: 0, ESTIMATED: 0, SIMULATED: 0 };
  const perMission: any = {};
  let conflated = false;
  for (const li of items) {
    const kind = COST_KINDS.includes(li.kind) ? li.kind : "SIMULATED"; // unknown kind is treated as SIMULATED (never OBSERVED)
    byKind[kind] = round(byKind[kind] + num(li.amountEur));
    if (kind === "OBSERVED" && isStr(li.missionId)) perMission[li.missionId] = round((perMission[li.missionId] || 0) + num(li.amountEur));
    if (li.kind !== undefined && !COST_KINDS.includes(li.kind)) conflated = true; // an invalid/missing kind that someone tried to pass
  }
  return Object.freeze({ byKind: Object.freeze(byKind), perMissionObserved: Object.freeze(perMission), conflated });
}

/** budgetStop(spentObservedEur, budgetEur) -> { stop, reason }. Fail-closed: OVER budget ⇒ stop. */
function budgetStop(spentObservedEur: any, budgetEur: any): any {
  const spent = num(spentObservedEur); const budget = num(budgetEur, Infinity);
  return Object.freeze({ stop: spent > budget, spent: round(spent), budget, reason: spent > budget ? "OBSERVED spend exceeds budget — fail-closed stop" : "within budget" });
}

/** auditSeparation(costs) -> { clean, issues }. OBSERVED must never be summed with SIMULATED/ESTIMATED into one headline. */
function auditSeparation(costs: any): any {
  const c = isObj(costs) ? costs : {};
  const issues: string[] = [];
  if (c.conflated === true) issues.push("a non-OBSERVED line was mislabelled — kinds must stay separate (never conflate measured/modelled/simulated)");
  return Object.freeze({ clean: issues.length === 0, issues: Object.freeze(issues) });
}

function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const lines = arr(o.lineItems).length ? o.lineItems : [
    { kind: "OBSERVED", amountEur: 1.2, missionId: "m1" }, { kind: "OBSERVED", amountEur: 0.8, missionId: "m2" },
    { kind: "ESTIMATED", amountEur: 5.0, missionId: "m3" }, { kind: "SIMULATED", amountEur: 100.0, missionId: "m4" },
  ];
  const costs = computeCosts(lines);
  const sep = auditSeparation(costs);
  const budget = budgetStop(costs.byKind.OBSERVED, num(o.budgetEur, 10));
  const degraded = !sep.clean || budget.stop;
  return Object.freeze({
    synthetic: true, profession: "P9", costs, separationAudit: sep, budget,
    level: "E2", degraded, note: "SYNTHETIC FOCUS-style billing (not real cloud bills, not E5); OBSERVED/ESTIMATED/SIMULATED kept separate; cost/mission (OBSERVED only); budget-stop; real cloud billing (E5) owner-gated NOT_RUN",
  });
}

const P9_FINOPS_REFERENCE_CONTRACT = Object.freeze({
  id: "V124-P9-FINOPS-REFERENCE",
  source: "V12.4 §43 P9 (FinOps/Cloud-Economics) — E2 reference + E3 (budget overrun / conflation)",
  costKinds: COST_KINDS, levels: Object.freeze(["E0", "E1", "E2", "E3", "E4(owner/independent)", "E5(owner-gated NOT_RUN)"]),
  notAuthority: "a runnable FinOps reference over SYNTHETIC billing; no real cloud-bill access, no E5 claim",
  invariants: Object.freeze([
    "OBSERVED / ESTIMATED / SIMULATED are kept STRICTLY separate; an unknown/invalid kind is treated as SIMULATED (never OBSERVED)",
    "cost-per-mission is computed from OBSERVED spend only; budget-stop is on OBSERVED spend (fail-closed)",
    "SYNTHETIC billing only; real cloud billing (E5) owner-gated NOT_RUN (no inflated level)",
    "pure/deterministic + reproducible",
  ]),
});

module.exports = { COST_KINDS, computeCosts, budgetStop, auditSeparation, runReferenceProject, P9_FINOPS_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P9_FINOPS_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
