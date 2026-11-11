#!/usr/bin/env node
"use strict";
/* V139 §7 — RADAR OPERATING SCHEDULE validator. PURE, deterministic, fail-closed. Validates a bounded, governed weekly radar
 * cycle definition against the required operating envelope: a SINGLE bounded night window (Sunday 02:00–05:00 Europe/Paris,
 * ≤3h), NO always-on polling, NO overlapping cycles, a DECLARED egress budget (reuses research-budget), bounded retries +
 * failure backoff. A second weekly cycle is admitted ONLY with an explicit measured-value justification. It does NOT run or
 * schedule anything (no process, no timer) — it only CHECKS a schedule is within policy, so a non-conforming cadence cannot
 * be declared conforming. Reuses canonical mechanisms; no new scheduler/queue/service. */
const BUDGET = require("./research-budget.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isInt(v: any): boolean { return Number.isInteger(v); }
const WINDOW = Object.freeze({ day: "SUN", tz: "Europe/Paris", startHour: 2, endHour: 5, maxDurationMs: 3 * 60 * 60 * 1000 });

/** validateSchedule(schedule) -> { valid, violations[], normalized }. Fail-closed: anything missing/out-of-envelope is a
 * violation. cyclesPerWeek>1 requires schedule.secondCycleJustification (a measured-value string). */
function validateSchedule(schedule: any): any {
  const s = isObj(schedule) ? schedule : {};
  const v: string[] = [];
  if (!isObj(schedule)) v.push("NO_SCHEDULE");
  if (s.dayOfWeek !== WINDOW.day) v.push("WINDOW_DAY_NOT_SUNDAY");
  if (String(s.timezone) !== WINDOW.tz) v.push("WINDOW_TZ_NOT_PARIS");
  if (!(isInt(s.startHour) && s.startHour >= WINDOW.startHour)) v.push("WINDOW_START_BEFORE_0200");
  if (!(isInt(s.endHour) && s.endHour <= WINDOW.endHour)) v.push("WINDOW_END_AFTER_0500");
  if (isInt(s.startHour) && isInt(s.endHour) && s.endHour <= s.startHour) v.push("WINDOW_NON_POSITIVE");
  if (!(isInt(s.maxDurationMs) && s.maxDurationMs > 0 && s.maxDurationMs <= WINDOW.maxDurationMs)) v.push("DURATION_UNBOUNDED_OR_OVER_3H");
  if (s.alwaysOn || s.continuousPolling) v.push("ALWAYS_ON_FORBIDDEN");   // ANY truthy always-on/continuous flag ⇒ forbidden (no permanent polling / worker)
  if (s.overlapPolicy !== "SKIP_IF_RUNNING" && s.overlapPolicy !== "QUEUE_NONE") v.push("OVERLAP_NOT_PREVENTED");
  // a DECLARED, bounded egress budget is mandatory (reuse research-budget's own notion of "declared").
  const b = BUDGET.budgetOf({ budget: s.budget });
  if (!b.declared || b.invalid) v.push("BUDGET_NOT_DECLARED_OR_INVALID");
  // bounded retries + failure backoff
  if (!isObj(s.retry) || !(isInt(s.retry.maxRetries) && s.retry.maxRetries >= 0 && s.retry.maxRetries <= 5)) v.push("RETRIES_UNBOUNDED");
  if (!isObj(s.retry) || !(isInt(s.retry.backoffMs) && s.retry.backoffMs > 0)) v.push("NO_FAILURE_BACKOFF");
  // dedup must be on (the radar already dedups topics; the schedule must not disable it)
  if (s.deduplicate !== true) v.push("DEDUP_DISABLED");
  // cycles: 1 by default; a 2nd needs explicit measured-value justification
  const cycles = isInt(s.cyclesPerWeek) && s.cyclesPerWeek >= 1 ? s.cyclesPerWeek : 1;
  if (cycles > 1 && !(typeof s.secondCycleJustification === "string" && s.secondCycleJustification.trim().length > 0)) v.push("SECOND_CYCLE_UNJUSTIFIED");
  if (cycles > 2) v.push("TOO_MANY_CYCLES");
  return Object.freeze({
    valid: v.length === 0,
    violations: Object.freeze(v),
    normalized: Object.freeze({ window: WINDOW, cyclesPerWeek: cycles, budgetDeclared: b.declared === true, overlapPrevented: s.overlapPolicy === "SKIP_IF_RUNNING" || s.overlapPolicy === "QUEUE_NONE" }),
    note: "a single bounded Sunday 02:00–05:00 Europe/Paris cycle; no always-on polling; no overlap; declared budget + bounded retries + backoff; a 2nd cycle only with measured-value justification.",
  });
}

const RADAR_SCHEDULE_CONTRACT = Object.freeze({ id: "V139-RADAR-SCHEDULE", envelope: WINDOW, reuses: ["research-budget.budgetOf"], invariants: Object.freeze(["single bounded weekly night window", "no always-on polling / worker", "no overlapping cycles", "declared bounded egress budget", "bounded retries + failure backoff", "dedup on", "2nd cycle only with measured-value justification"]) });
module.exports = { validateSchedule, WINDOW, RADAR_SCHEDULE_CONTRACT };
export {};
