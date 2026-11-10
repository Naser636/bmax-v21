#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V78 — CONTINUOUS CAMPAIGN ENGINE. Consumes an ARBITRARY-SIZE mission queue (no hardcoded 4/10 cap): ODG
 * selects (mission-priority-selector) → owner mandate classifies (local-work-mandate) → Level-A runs END-TO-END
 * (intelligence-loop) → Level-B PREPARED → Level-C REFUSED → failure/blocked QUARANTINED → re-select — until the queue of
 * eligible missions is exhausted OR a declared budget/safety cap is hit (logged, never a silent arbitrary limit). A
 * blocked mission never stops the campaign (independents continue). Reuses the canonical mechanisms; NO second
 * orchestrator, NO new primitive. Pure/deterministic given the queue + executor. Dual export.
 */

const SEL = require("./mission-priority-selector.js");
const MANDATE = require("./local-work-mandate.js");
const LOOP = require("./intelligence-loop.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
const plans = (id: string) => [{ id, metrics: { Psuccess: 0.9, Vobjective: 0.8, Qquality: 0.8, Ttime: 0.2, Cresources: 0.2, Rrisk: 0.1, Uuncertainty: 0.1 } }];

/*
 * runCampaign(missions, opts) -> { log, metrics, stopReason }. missions: arbitrary N candidate missions (each with id,
 * actions[], §4 priority attrs, deps[], status). opts: { execute?(mission)->report, maxIterations?, budgetRemaining?() }.
 * Default maxIterations = missions.length*3 + 10 (a SAFETY backstop proportional to the queue, NOT an arbitrary small cap).
 */
function runCampaign(missions: any, opts: any = {}): any {
  const queue = (Array.isArray(missions) ? missions : []).filter(isObj);
  const o = isObj(opts) ? opts : {};
  const execute = typeof o.execute === "function" ? o.execute : ((m: any) => ({ mission: m.id, validated: true, status: "SUCCESS" }));
  const maxIterations = typeof o.maxIterations === "number" && o.maxIterations > 0 ? o.maxIterations : queue.length * 3 + 10;
  const budgetOk = typeof o.budgetRemaining === "function" ? o.budgetRemaining : (() => true);

  const handled = new Set<string>();          // missions removed from candidacy (executed/refused/prepared/quarantined)
  const accepted: string[] = [];              // ACCEPTED (for dep-satisfaction + no-repeat)
  const log: any[] = [];
  const metrics: any = { discovered: queue.length, selected: 0, authorized: 0, executed: 0, accepted: 0, failed: 0, refusedC: 0, preparedB: 0, quarantined: 0, deferred: 0, retries: 0, iterations: 0 };
  let stopReason = "QUEUE_EXHAUSTED";

  let iter = 0;
  while (iter < maxIterations) {
    if (!budgetOk()) { stopReason = "BUDGET_LIMIT (checkpoint saved; resumable)"; break; }
    const candidates = queue.filter((m) => !handled.has(m.id));
    const selection = SEL.selectNext(candidates, accepted);
    metrics.deferred = selection.deferred.length;
    if (!selection.selected) { stopReason = candidates.length === 0 ? "QUEUE_EXHAUSTED" : "ALL_REMAINING_DEFERRED (deps/human/external) — no eligible local mission"; break; }
    iter++; metrics.iterations = iter; metrics.selected++;
    const id = selection.selected.id;
    const mission = queue.find((m) => m.id === id);
    const mandate = MANDATE.authorizeLocalMission(mission);

    if (!mandate.authorized) {
      if (mandate.level === "C") { metrics.refusedC++; log.push({ iter, id, decision: "REFUSED_C", reason: mandate.reason }); }
      else if (mandate.level === "B") { metrics.preparedB++; log.push({ iter, id, decision: "PREPARED_B", reason: mandate.reason }); }
      else { metrics.quarantined++; log.push({ iter, id, decision: "QUARANTINED", reason: mandate.reason }); }
      handled.add(id); continue;              // campaign continues (no global stop)
    }
    metrics.authorized++;
    // Level-A: governed loop end-to-end.
    let report: any; let threw: any = null;
    try { report = execute(mission); } catch (e: any) { threw = e && e.message ? e.message : String(e); }
    if (threw) { metrics.quarantined++; metrics.retries++; log.push({ iter, id, decision: "QUARANTINED", reason: "executor threw: " + threw }); handled.add(id); continue; }
    const loop = LOOP.runCycle({ discovery: { title: id }, existingItems: [], authorization: mandate.authorization, candidatePlans: plans(id) }, { execute: () => report });
    metrics.executed++;
    if (loop.completed === true && loop.outcome === "SUCCESS") { metrics.accepted++; accepted.push(id); log.push({ iter, id, decision: "EXECUTED_ACCEPTED", outcome: loop.outcome, stages: loop.connected.length }); }
    else { metrics.failed++; log.push({ iter, id, decision: "FAILED_NOT_ACCEPTED", outcome: loop.outcome || null }); }
    handled.add(id);                          // handled either way; a FAILED mission is not re-selected endlessly
  }
  if (iter >= maxIterations) stopReason = "SAFETY_CAP (iterations=" + maxIterations + ", proportional to queue; backstop, not an arbitrary 4/10 limit)";
  return Object.freeze({ log: Object.freeze(log), metrics: Object.freeze(metrics), stopReason, acceptedCount: accepted.length });
}

const CAMPAIGN_ENGINE_CONTRACT = Object.freeze({
  id: "V78-CAMPAIGN-ENGINE", source: "CTO V78 — continuous campaign engine (arbitrary queue, no hardcoded mission cap)",
  reuses: Object.freeze(["mission-priority-selector", "local-work-mandate", "intelligence-loop"]),
  outcomes: Object.freeze(["EXECUTED_ACCEPTED", "FAILED_NOT_ACCEPTED", "REFUSED_C", "PREPARED_B", "QUARANTINED", "DEFERRED"]),
  notAuthority: "drives the canonical mechanisms over the queue; ODG selects, the owner mandate authorizes Level-A, the loop still gates; no second orchestrator",
  invariants: Object.freeze([
    "consumes an arbitrary-size queue — the only stop conditions are QUEUE_EXHAUSTED / ALL_REMAINING_DEFERRED / BUDGET_LIMIT / SAFETY_CAP (proportional, logged)",
    "a blocked/failed/refused mission is handled (quarantine/refuse/prepare) and the campaign CONTINUES — never a global stop",
    "Level-A executes end-to-end under the owner mandate; Level-C refused; Level-B prepared; no self-authorization",
    "no mission re-selected after being handled (no-repeat); deterministic given queue+executor; no new primitive",
  ]),
});

module.exports = { runCampaign, CAMPAIGN_ENGINE_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(CAMPAIGN_ENGINE_CONTRACT, null, 2) + "\n"); }
export {};
