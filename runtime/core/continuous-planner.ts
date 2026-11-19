#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V33 LOT A (§2.3) — CONTINUOUS PLANNER (CASPER-style incremental plan repair). PURE, deterministic,
 * fail-closed. It does NOT create a new planner — it COMPOSES the existing plan-evaluator (multi-criteria choice) and the
 * roadmap-manager discipline (discovery ≠ authorization) to maintain a CURRENT plan and REPAIR ONLY the parts affected by
 * an event, keeping every still-valid part (the CASPER principle: "ne pas reconstruire tout le plan quand une
 * modification locale suffit"). It proposes a new plan version; replanning NEVER self-authorizes. §2.2: success estimates
 * are derived from VERIFIED history (register) with observation counts — absence of data stays UNKNOWN, never a
 * favourable default. Dual export.
 */

const EVAL = require("./plan-evaluator.js");
const CPS = require("./odg-calibrated-psuccess.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const EVENT = Object.freeze(["STATE_CHANGE", "MISSION_BLOCKED", "DEPENDENCY_LOST", "PRIORITY_CHANGE", "RESOURCE_UNAVAILABLE", "MISSION_COMPLETED"]);

/**
 * affectedMissions(plan, event) -> Set of mission ids the event touches (directly + transitively via deps). A localized
 * event affects only its target + dependents; an unrelated mission stays valid.
 */
function affectedMissions(plan: any, event: any): Set<string> {
  const missions = arr(plan && plan.missions).filter(isObj);
  const target = event && typeof event.missionId === "string" ? event.missionId : null;
  const affected = new Set<string>();
  if (!target) { if (event && event.type === "PRIORITY_CHANGE" && Array.isArray(event.missionIds)) event.missionIds.forEach((m: string) => affected.add(m)); return affected; }
  affected.add(target);
  // transitive dependents: any mission whose deps (eventually) include an affected one.
  let changed = true;
  while (changed) { changed = false; for (const m of missions) if (!affected.has(m.id) && arr(m.deps).some((d) => affected.has(d))) { affected.add(m.id); changed = true; } }
  return affected;
}

/**
 * estimateSuccess(missionType, history) -> { p, measuredP, basis, quality, observations, authorizes, note }.
 * §2.2: DELEGATES to the bias-guarded calibrated estimator (odg-calibrated-psuccess) — the single source of truth,
 * so a raw accepted/total ratio is NEVER mislabeled "calibrated". `p` is the planner-usable value: non-null ONLY
 * when the estimate is CALIBRATED (sufficient DECIDED outcomes with recorded failures, not stale); a survivorship-
 * biased / thin / stale / empty history ⇒ quality BIASED/DEGRADED/UNKNOWN ⇒ p=null (fail-closed, never a favourable
 * default). `measuredP` is the raw rate for transparency (not usable confidence). An estimate authorizes nothing.
 */
function estimateSuccess(missionType: any, history: any): any {
  const d = CPS.derivePsuccess(missionType, arr(history));
  return Object.freeze({ p: d.pForPlanner, measuredP: d.measuredP, basis: d.basis, quality: d.quality, observations: d.observations, authorizes: false, note: d.reason });
}

/**
 * repairPlan(currentPlan, event, deps) -> { repaired, preservedCount, repairedCount, newPlan, authorized, decision }.
 * Only AFFECTED missions are re-evaluated (via plan-evaluator over their candidate options); preserved missions are kept
 * verbatim. The new plan is a PROPOSAL — authorized:false (replanning never self-authorizes). deps: { candidatesFor(id)
 * -> plans[], weights?, history? }. Keeps the prior plan in `.previous`.
 */
function repairPlan(currentPlan: any, event: any, deps: any = {}): any {
  const plan = isObj(currentPlan) ? currentPlan : { missions: [] };
  const missions = arr(plan.missions).filter(isObj);
  const affected = affectedMissions(plan, event);
  const repairs: any[] = [];
  const newMissions = missions.map((m) => {
    if (!affected.has(m.id)) return m;   // PRESERVE still-valid parts (no rebuild)
    // re-evaluate only this affected mission over its candidate options.
    const candidates = typeof deps.candidatesFor === "function" ? arr(deps.candidatesFor(m.id)) : arr(m.candidates);
    if (candidates.length === 0) { repairs.push({ id: m.id, outcome: "NO_ALTERNATIVE" }); return { ...m, status: "BLOCKED", repairNote: "no feasible alternative — blocked (escalate)" }; }
    const choice = EVAL.evaluatePlans(candidates, { weights: deps.weights });
    repairs.push({ id: m.id, outcome: choice.selected ? "REPAIRED" : "NO_FEASIBLE", selected: choice.selected });
    return choice.selected ? { ...m, chosen: choice.selected, status: "REPLANNED" } : { ...m, status: "BLOCKED", repairNote: "no feasible alternative (all violate a hard constraint)" };
  });
  const repairedCount = repairs.filter((r) => r.outcome === "REPAIRED").length;
  return Object.freeze({
    repaired: affected.size > 0,
    affected: Object.freeze([...affected]),
    preservedCount: missions.length - affected.size,       // CASPER: valid parts kept
    repairedCount,
    blockedCount: repairs.filter((r) => r.outcome !== "REPAIRED").length,
    newPlan: Object.freeze({ version: (Number(plan.version) || 0) + 1, missions: Object.freeze(newMissions), basedOnEvent: event && event.type }),
    previous: plan,                                         // plan history retained
    authorized: false,                                     // INVARIANT: replanning never self-authorizes
    decision: Object.freeze({ status: "PROPOSED", reason: "repaired plan is a PROPOSAL — requires governed authorization before execution (replanning never self-authorizes)" }),
  });
}

const CONTINUOUS_PLANNER_CONTRACT = Object.freeze({
  id: "V124-CONTINUOUS-PLANNER",
  source: "CTO V33 LOT A §2.3 — CASPER-style incremental plan repair composing existing capabilities",
  reuses: Object.freeze(["plan-evaluator (multi-criteria choice of a mission's alternatives)", "roadmap-manager discipline (discovery ≠ authorization)", "the canonical register as VERIFIED history (no parallel memory)"]),
  notAuthority: "repairs the affected parts of a plan and PROPOSES a new version; it authorizes nothing and executes nothing — a governed step authorizes",
  invariants: Object.freeze([
    "only AFFECTED missions (the event target + transitive dependents) are re-evaluated; still-valid parts are preserved verbatim (no full rebuild)",
    "the repaired plan is a PROPOSAL (authorized:false) — replanning NEVER self-authorizes",
    "success estimates come from VERIFIED history with observation counts; no data ⇒ UNKNOWN, never a favourable default",
    "an affected mission with no feasible alternative is BLOCKED/escalated, never silently dropped",
    "the prior plan is retained (plan history); pure/deterministic, writes nothing",
  ]),
});

module.exports = { EVENT, affectedMissions, estimateSuccess, repairPlan, CONTINUOUS_PLANNER_CONTRACT };

if (require.main === module) {
  const plan = { version: 1, missions: [{ id: "A", deps: [] }, { id: "B", deps: ["A"] }, { id: "C", deps: [] }] };
  const r = repairPlan(plan, { type: "MISSION_BLOCKED", missionId: "A" }, { candidatesFor: () => [{ id: "A2", metrics: { Psuccess: 0.9, Vobjective: 0.8, Rrisk: 0.1, Uuncertainty: 0.1 } }] });
  process.stdout.write(JSON.stringify({ ...CONTINUOUS_PLANNER_CONTRACT, demo: { affected: r.affected, preservedCount: r.preservedCount, repairedCount: r.repairedCount, authorized: r.authorized } }, null, 2) + "\n");
}

export {};
