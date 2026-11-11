#!/usr/bin/env node
"use strict";

/*
 * metier-orchestration (mission M3, Phase 7) — PURE, deterministic orchestrator that runs the 15 métiers through
 * dependency-respecting PARALLEL WAVES (O1 parallel-execution-planner) under RESOURCE CAPS (G1 spend-governor), executing
 * each métier via an INJECTED solver. It composes O1 + G1 — no planning or cap logic is duplicated. It performs NO real
 * external action: `acted:false`, and the demo payloads are explicitly SYNTHETIC. No I/O, no clock, no network.
 *
 * orchestrate(metiers, opts) → frozen { waves, executed[], capDenied[], totalSpend, synthetic, acted, stats }.
 *   metiers: [{ id, deps?, weight?, provider?, cost? }]
 *   opts: { maxConcurrency, resourceBudget, caps (G1 caps), solver:(metier)=>output, nowMs }
 * Within a wave, each métier is admitted by G1 against the running spend log (per-provider/day/mission/global caps); an
 * admitted métier runs the solver and its cost is recorded; a cap-denied métier is SKIPPED (reasons recorded) and never
 * executed (fail-closed — a métier that would breach a cap does not run).
 *
 * DEPENDENCY CLOSURE: O1 plans by placement (cap-blind); G1 denies at exec time. To keep `executed` honest — so a
 * member of `executed` always had ALL its dependencies actually satisfied — a métier whose dependency was cap-denied (or
 * itself skipped) is NOT executed: it is recorded in `skippedDueToDep` (reason DEP_DENIED, with the blocking deps) and
 * the block propagates transitively downstream. Thus `executed` never implies an unsatisfied dependency.
 */

const PLAN = require("./parallel-execution-planner.js");
const SG = require("./spend-governor.js");

function orchestrate(metiers: any, opts?: any): any {
  const o = opts && typeof opts === "object" ? opts : {};
  const list: any[] = Array.isArray(metiers) ? metiers : [];
  const solver = typeof o.solver === "function" ? o.solver : (m: any) => ({ metier: m && m.id, note: "no-solver" });
  const caps = o.caps && typeof o.caps === "object" ? o.caps : {};
  const nowMs = typeof o.nowMs === "number" ? o.nowMs : 0;
  const byId: Record<string, any> = {}; list.forEach((m) => { if (m && typeof m.id === "string") byId[m.id] = m; });

  const planned = PLAN.plan(list.map((m) => ({ id: m.id, deps: m.deps, weight: m.weight })), { maxConcurrency: o.maxConcurrency, resourceBudget: o.resourceBudget });
  const executed: any[] = [];
  const capDenied: any[] = [];
  const skippedDueToDep: any[] = [];
  const blocked = new Set<string>();     // cap-denied OR skipped-because-a-dep-was-blocked (propagates downstream)
  let spendLog: any[] = [];

  for (let w = 0; w < planned.waves.length; w++) {
    for (const id of planned.waves[w]) {
      const m = byId[id] || { id };
      const deps: string[] = Array.isArray(m.deps) ? m.deps.filter((d: any) => typeof d === "string") : [];
      // A métier whose dependency was cap-denied (or itself skipped) MUST NOT run — otherwise `executed` would wrongly
      // imply satisfied dependencies. O1 plans cap-blind (by placement); this is the exec-time dependency closure.
      const blockedBy = deps.filter((d) => blocked.has(d));
      if (blockedBy.length) { blocked.add(id); skippedDueToDep.push(Object.freeze({ id, wave: w, reason: "DEP_DENIED", blockedBy: Object.freeze(blockedBy) })); continue; }
      const provider = typeof m.provider === "string" ? m.provider : "local";
      const cost = typeof m.cost === "number" && isFinite(m.cost) && m.cost >= 0 ? m.cost : 0;
      const req = { provider, mission: id, actionKey: "metier:" + id, amount: cost };
      const decision = SG.govern(req, spendLog, caps, nowMs);
      if (decision.decision === "ADMIT") {
        let output: any; let error: string | undefined;
        try { output = solver(m); } catch (e: any) { error = String((e && e.message) || e); }
        spendLog = SG.record(spendLog, req, nowMs);
        executed.push(Object.freeze({ id, wave: w, provider, cost, admitted: true, output: error ? undefined : output, error, synthetic: true }));
      } else {
        blocked.add(id);
        capDenied.push(Object.freeze({ id, wave: w, provider, cost, reasons: decision.reasons }));
      }
    }
  }

  const totalSpend = spendLog.reduce((s: number, r: any) => s + (r.amount || 0), 0);
  return Object.freeze({
    waves: planned.waves,
    executed: Object.freeze(executed),
    capDenied: Object.freeze(capDenied),
    skippedDueToDep: Object.freeze(skippedDueToDep),
    unschedulable: planned.unscheduled,
    totalSpend,
    synthetic: true,
    acted: false,
    stats: Object.freeze({ metiers: list.length, scheduled: planned.scheduled.length, executed: executed.length, capDenied: capDenied.length, skippedDueToDep: skippedDueToDep.length, waveCount: planned.waves.length, maxConcurrency: o.maxConcurrency, resourceBudget: o.resourceBudget }),
  });
}

module.exports = { orchestrate };
export {};
