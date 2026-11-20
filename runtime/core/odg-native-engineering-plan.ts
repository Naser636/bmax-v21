#!/usr/bin/env node
"use strict";
/*
 * NATIVE ENGINEERING PLAN — the native "select → plan" bridge: ODG ranks the eligible missions and produces a
 * multi-agent orchestration PLAN across the dependency-ready ones. PURE, deterministic, fail-closed. COMPOSES the
 * existing canonical mechanisms — NO second orchestrator, NO second queue, NO tenth primitive (V324 §2/§7).
 *
 * Reuses: mission-priority-selector.selectNext + scoreMission (ODG's native, value/unblock selection) and
 * odg-orchestration-plan.planOrchestration (dependency layers + write-safe sub-waves #739/#742 + derived agent-count
 * 0..6 + per-task contracts). This stitches V324 §2 steps 1–10 (understand → prioritise → decide independent work →
 * decide native vs delegate → decide agent count → emit contracts) into ONE native entry point.
 *
 * HONESTY (V324 §2/§6/§12 — no overclaim): it is a PLAN, not an execution (executed:false). It SELECTS, RANKS, and
 * PLANS; it dispatches/tracks/integrates NOTHING; the execution half is a separate runtime step and NO native
 * autonomy is claimed or counted here (that requires real execution provenance). Only DEPENDENCY-READY missions (deps
 * met, not already accepted) are planned; missions with unmet dependencies are DEFERRED, never planned into a wave.
 * No network/clock/randomness.
 */

const SEL = require("./mission-priority-selector.js") as { selectNext: (c: any, a: any) => any; scoreMission: (m: any, a: any) => any };
const PLAN = require("./odg-orchestration-plan.js") as { planOrchestration: (m: any) => any };

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * planNextProgram(candidates, acceptedIds?) -> { ok, selected, selectionJustification, eligibleCount, deferredCount,
 *   orchestrationPlan, executed:false, note } | refusal.
 *   candidates: the open missions ODG may act on, each { id, deps?, authorizedPaths?/writeSet?, readOnly?, route?,
 *   objective?/nextAction?, status?, ... }. acceptedIds: already-ACCEPTED ids (deps-met signal + no-repeat).
 */
function planNextProgram(candidates: any, acceptedIds?: any): any {
  if (!Array.isArray(candidates)) return freeze({ ok: false, code: "BAD_CANDIDATES", detail: "candidates must be an array of mission objects" });
  const accepted = Array.isArray(acceptedIds) ? acceptedIds : [];

  // ODG's native selection (top mission) + the eligible set (dependency-ready, not accepted).
  const selection = SEL.selectNext(candidates, accepted);
  const eligible = candidates.filter((m: any) => isObj(m) && typeof m.id === "string" && SEL.scoreMission(m, accepted).eligible === true);
  const eligibleIds = new Set(eligible.map((m: any) => m.id));

  // Map eligible missions → an orchestration task graph. Eligible missions are dependency-ready, so their deps are met
  // (accepted) and intersect the eligible set to empty ⇒ they are genuinely independent and may run in parallel
  // (subject to write-set isolation, enforced downstream by planOrchestration).
  const tasks = eligible.map((m: any) => ({
    id: m.id,
    deps: (Array.isArray(m.deps) ? m.deps : []).filter((d: string) => eligibleIds.has(d)),
    authorizedPaths: m.authorizedPaths || m.writeSet,
    readOnly: m.readOnly === true,
    route: m.route,
    objective: m.objective || m.nextAction,
    ownerGated: m.ownerGated === true,
  }));

  const orchestrationPlan = tasks.length > 0 ? PLAN.planOrchestration({ id: "program", tasks }) : null;

  return freeze({
    ok: true,
    selected: selection.selected || null,
    selectionJustification: selection.selectionJustification,
    eligibleCount: eligible.length,
    deferredCount: candidates.filter((m: any) => isObj(m) && typeof m.id === "string").length - eligible.length,
    orchestrationPlan: orchestrationPlan ? freeze(orchestrationPlan) : null,
    executed: false,
    note: "A PLAN, not an execution: ODG natively SELECTS the top mission, RANKS the eligible (dependency-ready, not-accepted) set, and PLANS the multi-agent allocation across the independent ones (agent count derived, write-safe waves, per-task contracts). It dispatches/tracks/integrates NOTHING (executed:false); the execution half is a separate runtime step and NO native autonomy is counted without real execution provenance. Missions with unmet dependencies are DEFERRED, never planned into a wave.",
  });
}

const NATIVE_ENGINEERING_PLAN_CONTRACT = Object.freeze({
  id: "NATIVE-ENGINEERING-PLAN",
  purpose: "the native select→plan bridge (V324 §2 steps 1–10): ODG ranks eligible missions and produces a multi-agent orchestration plan across the dependency-ready ones — composing mission-priority-selector + odg-orchestration-plan (no 2nd orchestrator/queue, no 10th primitive)",
  reuses: Object.freeze(["mission-priority-selector.selectNext + scoreMission (native value/unblock selection)", "odg-orchestration-plan.planOrchestration (dep layers + write-safe waves #739/#742 + derived agent count + contracts)"]),
  invariants: Object.freeze([
    "PLAN, not execution: executed:false — selects/ranks/plans only; dispatches/tracks/integrates NOTHING; NO native autonomy is claimed or counted here (needs real execution provenance)",
    "only DEPENDENCY-READY missions (deps met, not already accepted) are planned; unmet-dependency missions are DEFERRED, never planned into a wave",
    "the multi-agent plan (agent count 0..6, write-safe waves, per-task contracts) comes entirely from the composed mechanisms — write-set isolation (#739/#742) is enforced, agent count is derived not fixed",
    "composes mission-priority-selector + odg-orchestration-plan — NO second orchestrator, NO second queue, NO tenth primitive",
    "fail-closed on a non-array candidate set; PURE/deterministic/frozen",
  ]),
});

module.exports = { planNextProgram, NATIVE_ENGINEERING_PLAN_CONTRACT };
export {};
