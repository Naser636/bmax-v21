#!/usr/bin/env node
"use strict";
/*
 * BTP CONSOLIDATED PLANNING VIEW — composes the two complementary, DISTINCT scheduling capabilities (D07 "not
 * consolidated"). PURE, deterministic, fail-closed. Modifies NEITHER module.
 *
 *  - odg-btp-chantier-schedule.computeSchedule : DERIVED timing from durations + precedence (ES/EF/LS/LF, float,
 *    critical path). Answers "what is the critical path and how much slack does each task have?"
 *  - odg-btp-project-workflow.planSchedule      : STATUS against caller-supplied PLANNED dates (topological order,
 *    blocked = incomplete prerequisite, delayed = past plannedFinish). Answers "what is actually stuck or late?"
 *    (it explicitly disclaims any derived/optimised timing).
 *
 * This bridges them into one view and adds the cross-reference the lifecycle actually needs: which CRITICAL tasks are
 * also BLOCKED or DELAYED (the highest-priority attention list — a slip there moves the whole project end date).
 *
 * Honesty: it invents nothing. A task's duration must be EXPLICIT (durationDays) or DERIVABLE (plannedFinish−plannedStart
 * when both are supplied and consistent); otherwise the task is UNRESOLVED and the whole plan is refused fail-closed
 * (never a fabricated duration). Day INDICES, not calendar. No resource levelling (inherited from the CPM engine). If
 * either engine refuses (cycle, inconsistent dates), the refusal is surfaced verbatim — never a partial plan.
 */

const CPM = require("./odg-btp-chantier-schedule.js");
const WF = require("./odg-btp-project-workflow.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v); }
function isNonNegInt(v: any): boolean { return isInt(v) && v >= 0; }
function freeze(o: any): any { return Object.freeze(o); }

/** Resolve a task's duration: EXPLICIT durationDays, else DERIVED from plannedFinish−plannedStart, else null (unresolved). */
function resolveDuration(t: any): any {
  if (isNonNegInt(t.durationDays)) return { durationDays: t.durationDays, source: "EXPLICIT" };
  if (isNonNegInt(t.plannedStart) && isNonNegInt(t.plannedFinish) && t.plannedFinish >= t.plannedStart) {
    return { durationDays: t.plannedFinish - t.plannedStart, source: "DERIVED" };
  }
  return { durationDays: null, source: null };
}

/**
 * consolidatedPlan(tasks, opts?) -> frozen consolidated view composing CPM + planSchedule.
 * tasks: [{ id, dependencies?:[id], durationDays?, plannedStart?, plannedFinish?, actualStart?, actualFinish?,
 *           percentComplete?, milestone?, asOfDay? }]. opts = { startDay? }.
 * Fail-closed: no tasks ⇒ NO_TASKS; any unresolved duration ⇒ UNRESOLVED_DURATIONS (listed, nothing invented);
 * CPM/planSchedule refusals (cycle / inconsistent dates / dangling dep) are surfaced verbatim.
 */
function consolidatedPlan(tasks: any, opts: any): any {
  const list = Array.isArray(tasks) ? tasks.filter(isObj) : [];
  if (!list.length) return freeze({ ok: false, code: "NO_TASKS" });
  const startDay = isObj(opts) && isNonNegInt(opts.startDay) ? opts.startDay : 0;

  // resolve durations (explicit or derived) — never invented
  const resolved = new Map<string, any>();
  const unresolved: any[] = [];
  for (const t of list) {
    if (!isStr(t.id)) return freeze({ ok: false, code: "BAD_ID", detail: "every task needs a string id" });
    const r = resolveDuration(t);
    if (r.durationDays === null) unresolved.push(freeze({ id: t.id, reason: "no durationDays and no consistent plannedStart/plannedFinish to derive from" }));
    else resolved.set(t.id, r);
  }
  if (unresolved.length) return freeze({ ok: false, code: "UNRESOLVED_DURATIONS", unresolved: freeze(unresolved),
    note: "a duration is EXPLICIT or DERIVED (plannedFinish−plannedStart); never invented — plan refused fail-closed" });

  // CPM (derived timing/float/critical) — map 'dependencies' → CPM 'deps'
  const cpmInput = { startDay, tasks: list.map((t: any) => ({ id: t.id, label: isStr(t.label) ? t.label : undefined, durationDays: resolved.get(t.id).durationDays, deps: Array.isArray(t.dependencies) ? t.dependencies.filter(isStr) : [] })) };
  const cpm = CPM.computeSchedule(cpmInput);
  if (cpm.ok !== true) return freeze({ ok: false, code: "CPM_REFUSED", cpm });

  // planSchedule (status vs planned dates) — pass tasks through verbatim (reads dependencies/dates/pct/asOfDay)
  const wf = WF.planSchedule(list);
  if (wf.ok !== true) return freeze({ ok: false, code: "PLAN_REFUSED", plan: wf });

  // merge per task + the cross-reference (critical ∧ blocked / critical ∧ delayed)
  const wfById = new Map<string, any>(); for (const r of wf.tasks) wfById.set(r.id, r);
  const blocked = new Set<string>(wf.blocked); const delayed = new Set<string>(wf.delayed);
  const mergedTasks = cpm.tasks.map((c: any) => { const w = wfById.get(c.id) || {};
    return freeze({ id: c.id, label: c.label, durationDays: c.durationDays, durationSource: resolved.get(c.id).source,
      cpm: freeze({ es: c.es, ef: c.ef, ls: c.ls, lf: c.lf, floatDays: c.floatDays, critical: c.critical }),
      status: freeze({ blocked: blocked.has(c.id), delayed: delayed.has(c.id), blockedBy: w.blockedBy || freeze([]),
        percentComplete: w.percentComplete ?? null, milestone: w.milestone === true }) });
  });
  const critical = new Set<string>(cpm.criticalTaskIds);
  const criticalAndBlocked = cpm.criticalTaskIds.filter((id: string) => blocked.has(id));
  const criticalAndDelayed = cpm.criticalTaskIds.filter((id: string) => delayed.has(id));

  return freeze({
    ok: true, startDay, projectEndDay: cpm.projectEndDay, projectDurationDays: cpm.projectDurationDays,
    criticalTaskIds: cpm.criticalTaskIds, tasks: freeze(mergedTasks),
    attention: freeze({ criticalAndBlocked: freeze(criticalAndBlocked), criticalAndDelayed: freeze(criticalAndDelayed),
      note: "critical tasks that are also blocked/delayed move the project end date — attend first" }),
    status: freeze({ blocked: wf.blocked, delayed: wf.delayed, milestones: wf.milestones, allComplete: wf.allComplete, completedCount: wf.completedCount }),
    note: "consolidated: CPM = DERIVED timing (float/critical from durations+precedence); planSchedule = STATUS vs caller PLANNED dates (blocked/delayed). Two complementary views; neither invents data; day-indices not calendar; no resource levelling.",
  });
}

const SCHEDULE_PLAN_CONTRACT = Object.freeze({
  id: "BTP-SCHEDULE-PLAN",
  purpose: "D07 consolidation: compose odg-btp-chantier-schedule (CPM timing/float/critical) + odg-btp-project-workflow.planSchedule (status) into one planning view, adding the critical∧blocked / critical∧delayed cross-reference",
  reuses: Object.freeze(["odg-btp-chantier-schedule.computeSchedule", "odg-btp-project-workflow.planSchedule"]),
  invariants: Object.freeze([
    "composes BOTH scheduling engines and MODIFIES NEITHER (no duplication, no new CPM/status logic)",
    "a duration is EXPLICIT or DERIVED (plannedFinish−plannedStart, consistent) — NEVER invented; any unresolved ⇒ plan refused",
    "either engine's refusal (cycle / inconsistent dates / dangling dep) is surfaced verbatim — never a partial plan",
    "the value-add is the cross-reference: critical∧blocked and critical∧delayed (highest-priority attention)",
    "day-INDICES not calendar; no resource levelling (inherited); PURE/deterministic; no network/clock/randomness",
  ]),
});

module.exports = { resolveDuration, consolidatedPlan, SCHEDULE_PLAN_CONTRACT };
export {};
