#!/usr/bin/env node
"use strict";

/*
 * V276 §2/§3 — ODG CAMPAIGN THROUGHPUT DIAGNOSTIC (read-only, deterministic). Answers the directive's §2 question — "why does
 * execution appear to stop after two tasks?" — with code evidence, and provides the §3 "controlled campaign" demonstration
 * that the EXISTING mechanism consumes the full eligible queue (not a cap of 2), WITHOUT building a parallel orchestrator/
 * scheduler.
 *
 * DIAGNOSTIC FINDING (grounded in the real code, not a guess):
 *   - odg-mission-scheduler.scheduleEligible() returns ALL dependency-satisfied eligible missions — there is NO mission-count
 *     cap. classifyMission() is deny-by-default (OWNER_GATED / DEP_BLOCKED / SECURITY_BLOCKED skipped, not a numeric limit).
 *   - runMission() bounds only RETRIES (maxAttempts ≤ 3) — a transient-error retry bound, NOT a tasks-per-run cap.
 *   - campaign-controller.selectNextLot() yields the next admissible lot and is iterable to exhaustion.
 *   ⇒ There is NO hardcoded "2-task" limit anywhere in the orchestration chain (the campaign demonstrably merged 6 PRs across
 *     V271–V275). The binding constraint is the SESSION / CONTEXT WINDOW of one execution turn, resolved by the existing
 *     checkpoint-resume pattern (persist state → resume next window) — NOT by bumping a number and NOT by a new orchestrator.
 *
 * REUSE: odg-mission-scheduler (scheduleEligible / classifyMission / STATUS). No new scheduler/orchestrator/primitive.
 */

const SCHED = require("./odg-mission-scheduler.js");   // the canonical eligibility engine (reused, not duplicated)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/** diagnoseLimits() -> the grounded §2 finding: where any effective limits live, and the real binding constraint. */
function diagnoseLimits(): any {
  return Object.freeze({
    question: "why does execution appear to stop after ~2 tasks?",
    capsFoundInCode: Object.freeze([]),                 // NONE — no mission-count cap in scheduler/controller/orchestrator
    evidence: Object.freeze([
      Object.freeze({ component: "odg-mission-scheduler.scheduleEligible", finding: "returns ALL eligible dependency-satisfied missions (no slice/cap); deterministic dep-count order", isCap: false }),
      Object.freeze({ component: "odg-mission-scheduler.classifyMission", finding: "deny-by-default status (OWNER_GATED/DEP_BLOCKED/SECURITY_BLOCKED/AUTH_EXPIRED skipped) — gating, not a numeric limit", isCap: false }),
      Object.freeze({ component: "odg-mission-scheduler.runMission", finding: "maxAttempts = min(m.maxAttempts,3) default 2 — a per-mission RETRY bound, NOT a tasks-per-run cap", isCap: false }),
      Object.freeze({ component: "campaign-controller.selectNextLot", finding: "yields the next admissible lot; iterable to exhaustion (one active lot at a time by design, not a total cap)", isCap: false }),
      Object.freeze({ component: "execution session / context window", finding: "each governed mission (build→test→independent-inspect→CI→merge) consumes turn budget; the window ends ⇒ checkpoint; this is the REAL binding constraint", isCap: true }),
    ]),
    bindingConstraint: "SESSION_CONTEXT_WINDOW",
    disproof: "the campaign merged 6 PRs across V271–V275 — empirically NOT capped at 2",
    correction: "NOT a numeric bump and NOT a new orchestrator (forbidden §3): use the existing checkpoint-resume — persist {HEAD, completed, remaining, deps, next} and resume next window. The scheduler already consumes the full eligible queue.",
  });
}

/** runControlledCampaign(missions, opts) -> drive the EXISTING scheduler to exhaustion over a register, proving it consumes
 * the whole eligible queue in dependency-ordered PARALLELISABLE waves (not 2). Pure simulation of consumption (no real exec). */
function runControlledCampaign(missions: any, opts?: any): any {
  const list = arr(missions).filter(isObj);
  const o = isObj(opts) ? opts : {};
  const maxRounds = Number.isSafeInteger(o.maxRounds) && o.maxRounds > 0 ? o.maxRounds : list.length + 2;   // safety bound vs infinite loop (NOT a task cap)
  const completed = new Set<string>();
  const waves: any[] = [];
  let round = 0;
  while (round < maxRounds) {
    const sched = SCHED.scheduleEligible(list, { completed: [...completed], grantValid: o.grantValid === true });
    const fresh = arr(sched.eligible).filter((m: any) => !completed.has(m.id));
    if (fresh.length === 0) break;
    // every mission eligible THIS round is dependency-satisfied ⇒ independent of the others this round ⇒ parallelisable.
    const wave = fresh.map((m: any) => m.id);
    waves.push(Object.freeze({ round: round + 1, wave: Object.freeze(wave), size: wave.length, parallelisable: wave.length > 1 }));
    wave.forEach((id: string) => completed.add(id));
    round++;
  }
  // whatever is not consumed: classify WHY (blocked/owner-gated/etc.) — documented, never silently dropped.
  const classified = SCHED.scheduleEligible(list, { completed: [...completed], grantValid: o.grantValid === true }).classified;
  const notConsumed = classified.filter((c: any) => !completed.has(c.mission.id)).map((c: any) => Object.freeze({ id: c.mission.id, status: c.status, reason: c.reason }));
  const maxWave = waves.reduce((m: number, w: any) => Math.max(m, w.size), 0);
  return Object.freeze({
    ok: true, consumedCount: completed.size, rounds: waves.length, waves: Object.freeze(waves),
    maxParallelWave: maxWave, parallelismDemonstrated: maxWave > 1,
    exhaustedEligibleQueue: round < maxRounds,                 // true = stopped because nothing eligible remained (not the safety bound)
    notConsumed: Object.freeze(notConsumed),
    checkpoint: Object.freeze({ completed: Object.freeze([...completed].sort()), remaining: Object.freeze(notConsumed.map((x: any) => x.id)) }),
    note: "drove the EXISTING odg-mission-scheduler to exhaustion: it consumes the FULL eligible queue in dependency-ordered parallelisable waves — NOT a cap of 2. Not-consumed missions are classified (blocked/owner-gated), never dropped. maxRounds is a loop safety bound, not a task cap. No parallel orchestrator built.",
  });
}

const CAMPAIGN_THROUGHPUT_DIAGNOSTIC_CONTRACT = Object.freeze({
  id: "V276-ODG-CAMPAIGN-THROUGHPUT-DIAGNOSTIC",
  source: "V276 §2/§3 — grounded diagnostic of the '2-task' perception + controlled-campaign throughput demonstration",
  reuses: Object.freeze(["odg-mission-scheduler (scheduleEligible / classifyMission / STATUS)"]),
  invariants: Object.freeze([
    "NO mission-count cap exists in the orchestration code (scheduleEligible returns ALL eligible); the binding constraint is the SESSION/CONTEXT window — resolved by checkpoint-resume, not a numeric bump",
    "runMission.maxAttempts (≤3) is a per-mission RETRY bound, not a tasks-per-run cap; classifyMission gating is deny-by-default, not a limit",
    "the controlled campaign drives the EXISTING scheduler to exhaustion — consumes the full eligible queue in dependency-ordered parallelisable waves (proves >2); not-consumed missions are classified, never dropped",
    "no parallel orchestrator/scheduler/primitive built (§3); maxRounds is a loop safety bound; deterministic/read-only (no clock/random/I/O); pure consumption simulation (no real mission execution claimed)",
  ]),
});

module.exports = { diagnoseLimits, runControlledCampaign, CAMPAIGN_THROUGHPUT_DIAGNOSTIC_CONTRACT };

export {};
