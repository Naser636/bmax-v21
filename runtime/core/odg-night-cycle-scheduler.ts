#!/usr/bin/env node
"use strict";
/*
 * V360 §6/§7 — NIGHT-CYCLE SCHEDULER for the self-improvement engine. PURE, deterministic, fail-closed. Runs EXACTLY TWO
 * self-improvement cycles per week, EXCLUSIVELY during the local night, driving the canonical odg-self-improvement-cycle.
 * It is NOT a second scheduler/engine: it REUSES the canonical odg-weekly-radar-scheduler primitives (parisParts DST-correct
 * Europe/Paris clock, weekKey) and the canonical Europe/Paris night envelope (radar-schedule.WINDOW.tz); the cycle BODY is the
 * canonical odg-self-improvement-cycle, injected as a `cycleFn` seam (no second improvement engine).
 *
 * RADAR-FIRST / approach comparison (§2): slot matching uses a DST-correct wall-clock day+hour WINDOW (via Intl Europe/Paris)
 * rather than interval-since-last (which drifts off "night" and ignores DST); anti-duplicate uses a per-slot-per-week key
 * (a single global week key would block the 2nd weekly slot); overlap uses a TIMESTAMPED advisory lock (running + lockAtMs)
 * with a stale-timeout self-heal (not a VPS pid file) — real across separate runner invocations, yet crash-safe. Persistence
 * of the trigger is a gitignored dev state file — the DURABLE auto-trigger needs a systemd/cron install on the VPS, which is
 * OWNER-GATED (§12), so realTrigger stays NOT_MEASURED until a real scheduled execution is observed.
 *
 * TIME IS INJECTED (epoch ms). The host runs Etc/UTC but "night" is ODG's Europe/Paris local night, evaluated DST-correctly
 * by Intl regardless of host TZ. The module never calls Date.now()/argless new Date() (the bin reads the real clock).
 */

const WRS = require("./odg-weekly-radar-scheduler.js"); // canonical parisParts (DST-correct) + weekKey — reused
const RS = require("./radar-schedule.js");              // canonical Europe/Paris envelope (tz reused, not invented)

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const TZ = RS.WINDOW.tz; // "Europe/Paris" — the canonical ODG operating timezone (reused)
const NIGHT_START = 0, NIGHT_END = 6; // local night = [00:00, 06:00) Europe/Paris (for the daytime-refusal distinction)
const MAX_WINDOW_HOURS = 3;           // policy envelope ceiling per slot (the canonical radar envelope is ≤3h)
const STALE_LOCK_MS = 3 * 60 * 60 * 1000; // a run still "running" beyond this ⇒ the prior process crashed ⇒ lock self-heals
const DAYS = Object.freeze(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);

// EXACTLY TWO spaced night slots per week (Europe/Paris), each a bounded 2h window inside the night. Spaced ~4 days apart so
// regressions/drift between passes are caught sooner than a single weekly pass (the measured-value justification for 2/week).
const NIGHT_SLOTS = freeze([
  freeze({ id: "night-A", day: "TUE", startHour: 2, endHour: 4 }),
  freeze({ id: "night-B", day: "SAT", startHour: 2, endHour: 4 }),
]);
const SECOND_CYCLE_JUSTIFICATION = "two spaced night cycles (TUE+SAT, ~4 days apart) detect connectivity regressions and Boussole drift mid-week instead of letting them persist up to 7 days; both run in a ≤2h night window, bounding resource use.";

/* validateNightConfig(slots?) -> { valid, violations[] }. Fail-closed POLICY check: exactly 2 slots, valid distinct night-only
 * days, bounded window (≤3h envelope), and a measured-value justification for cyclesPerWeek>1 — so a non-conforming cadence
 * cannot be declared conforming. Null/malformed slots fail closed (never throw). */
function validateNightConfig(slots: any = NIGHT_SLOTS): any {
  const s = arr(slots); const v: string[] = [];
  if (s.length !== 2) v.push("MUST_BE_EXACTLY_TWO_CYCLES_PER_WEEK");
  for (const slot of s) {
    if (!isObj(slot)) { v.push("BAD_SLOT"); continue; }
    if (DAYS.indexOf(slot.day) < 0) v.push(`SLOT_BAD_DAY:${slot.id}`);
    if (!(slot.startHour >= NIGHT_START && slot.endHour <= NIGHT_END)) v.push(`SLOT_NOT_NIGHT:${slot.id}`);
    if (!(slot.endHour > slot.startHour)) v.push(`SLOT_EMPTY_WINDOW:${slot.id}`);
    if ((slot.endHour - slot.startHour) > MAX_WINDOW_HOURS) v.push(`SLOT_OVER_${MAX_WINDOW_HOURS}H:${slot.id}`);
  }
  // spacing: the two slots must be valid objects on DIFFERENT days (not the same night). Guard against null slots (fail-closed).
  if (s.length === 2 && isObj(s[0]) && isObj(s[1]) && s[0].day === s[1].day) v.push("SLOTS_NOT_SPACED_SAME_DAY");
  if (!SECOND_CYCLE_JUSTIFICATION || SECOND_CYCLE_JUSTIFICATION.length < 20) v.push("MISSING_SECOND_CYCLE_JUSTIFICATION");
  return freeze({ valid: v.length === 0, violations: freeze(v), justification: SECOND_CYCLE_JUSTIFICATION });
}

/* isNight(epochMs) — local hour within [NIGHT_START, NIGHT_END) in Europe/Paris (DST-correct). */
function isNight(epochMs: number): boolean { const p = WRS.parisParts(epochMs); return p.hour >= NIGHT_START && p.hour < NIGHT_END; }

/* dueSlot(epochMs, slots?) — the night slot whose window is currently open (day + startHour ≤ localHour < endHour), else null. */
function dueSlot(epochMs: number, slots: any = NIGHT_SLOTS): any {
  const p = WRS.parisParts(epochMs);
  for (const slot of arr(slots)) if (isObj(slot) && p.weekday === slot.day && p.hour >= slot.startHour && p.hour < slot.endHour) return slot;
  return null;
}

/* slotWeekKey(epochMs, slotId) — per-slot-per-week dedup key (so each of the two weekly slots runs at most once per week). */
function slotWeekKey(epochMs: number, slotId: string): string { return WRS.weekKey(epochMs) + ":" + slotId; }

/* lockStale(state, epochMs) — a persisted running lock is STALE (prior process crashed) if older than STALE_LOCK_MS. */
function lockStale(state: any, epochMs: number): boolean { const s = isObj(state) ? state : {}; return typeof s.lockAtMs === "number" && (epochMs - s.lockAtMs) >= STALE_LOCK_MS; }

/* acquire(state, nowMs) — the lock a cross-process caller PERSISTS before executing (running=true + timestamp). */
function acquire(state: any, nowMs: number): any { return freeze({ ...(isObj(state) ? state : {}), running: true, lockAtMs: nowMs }); }

/* decide(state, epochMs, slots?) -> { trigger, slot, reason }. The gate: not already running (unless the lock is STALE ⇒
 * self-heal) AND a night slot is open AND that slot has not already run this week. Daytime / no-slot ⇒ no trigger. */
function decide(state: any, epochMs: number, slots: any = NIGHT_SLOTS): any {
  const s = isObj(state) ? state : {};
  if (s.running === true && !lockStale(s, epochMs)) return freeze({ trigger: false, slot: null, reason: "a cycle is already running — concurrent trigger REJECTED (no overlap)" });
  // (if running===true but the lock is STALE, the prior process crashed ⇒ fall through and re-evaluate — self-heal)
  const slot = dueSlot(epochMs, slots);
  if (!slot) return freeze({ trigger: false, slot: null, reason: isNight(epochMs) ? "no night slot is due at this time" : "daytime — refused (cycles run only during the local night)" });
  const key = slotWeekKey(epochMs, slot.id);
  if (arr(s.doneSlots).indexOf(key) >= 0) return freeze({ trigger: false, slot: freeze({ ...slot }), reason: `slot ${slot.id} already ran this week — duplicate prevented` });
  return freeze({ trigger: true, slot: freeze({ ...slot }), reason: `night slot ${slot.id} open, not yet run this week, no overlap` });
}

/*
 * execute(lockedState, opts) -> frozen run report. ASSUMES the caller has already gated (decide.trigger) and acquired the lock
 * (running=true persisted, for cross-process overlap protection). opts: { now, slot, cycleFn(slot, now)->cycleResult }. Runs
 * the canonical cycle body (EXECUTED), then returns the final state with running=false + the slot marked done. On a cycleFn
 * THROW the state is preserved with running=false and the slot NOT marked done ⇒ safe re-run (controlled recovery, no deadlock).
 */
function execute(lockedState: any, opts: any = {}): any {
  const o = isObj(opts) ? opts : {}; const now = o.now; const slot = o.slot; const prev = isObj(lockedState) ? lockedState : {};
  let cycleResult: any = null; let error: string | null = null;
  try {
    const fn = typeof o.cycleFn === "function" ? o.cycleFn : null;
    if (!fn) throw new Error("NO_CYCLE_FN"); // fail-closed: nothing to execute
    if (!isObj(slot)) throw new Error("NO_SLOT");
    cycleResult = fn(slot, now); // EXECUTED — the canonical odg-self-improvement-cycle body
  } catch (e: any) { error = (e && e.message) ? String(e.message) : "CYCLE_ERROR"; }

  if (error) {
    const recovered = freeze({ ...prev, running: false, lockAtMs: null, lastError: freeze({ slot: slot && slot.id, error, atWeek: WRS.weekKey(now) }) });
    return freeze({ ran: true, lifecycle: "EXECUTED_ERROR", slot: slot ? freeze({ ...slot }) : null, error, recovered: true, resumable: true, state: recovered, realTrigger: "NOT_MEASURED" });
  }
  const key = slotWeekKey(now, slot.id);
  const doneSlots = Array.from(new Set([...arr(prev.doneSlots), key]));
  const newState = freeze({ ...prev, running: false, lockAtMs: null, doneSlots: freeze(doneSlots), lastRun: freeze({ slot: slot.id, atWeek: WRS.weekKey(now) }) });
  return freeze({
    ran: true, lifecycle: "EXECUTED", slot: freeze({ ...slot }),
    cycleOutcome: cycleResult && cycleResult.outcome ? cycleResult.outcome : null,
    integrate: "OWNER_GATED", measure: cycleResult && cycleResult.measure ? cycleResult.measure : "NOT_MEASURED", selfAuthorized: false,
    state: newState, realTrigger: "NOT_MEASURED",
    note: "the cycle body ran (EXECUTED); INTEGRATE is owner-gated (PROPOSED-only); OPERATIONAL (persistent auto-trigger) needs a systemd/cron install on the VPS (OWNER_GATED) — realTrigger stays NOT_MEASURED until a real scheduled execution is observed.",
  });
}

/* run(state, opts) — in-process convenience (decide → acquire → execute) for tests and single synchronous callers. For REAL
 * cross-process overlap protection the runner persists acquire()'s lock to disk BEFORE calling execute (see odg-night-cycle-run). */
function run(state: any, opts: any = {}): any {
  const o = isObj(opts) ? opts : {}; const now = o.now; const prev = isObj(state) ? state : {};
  const gate = decide(prev, now, o.slots);
  if (!gate.trigger) return freeze({ ran: false, lifecycle: "SKIPPED", reason: gate.reason, slot: gate.slot, state: freeze({ ...prev }), realTrigger: "NOT_MEASURED" });
  return execute(acquire(prev, now), { now, slot: gate.slot, cycleFn: o.cycleFn });
}

/* realTriggerStatus() — honest persistence limit: the DURABLE night auto-trigger needs an owner-gated systemd/cron install. */
function realTriggerStatus(): any {
  return freeze({
    status: "NOT_MEASURED",
    lifecycleReached: freeze(["CONFIGURED", "TRIGGERED", "EXECUTED"]),
    lifecycleNotReached: freeze(["OPERATIONAL (persistent unattended auto-trigger)"]),
    reason: "all scheduling LOGIC (night gate, 2 spaced slots, DST-correct, anti-duplicate, timestamped overlap lock + stale self-heal, recovery) is implemented + tested, and a real controlled trigger runs the canonical cycle in the dev environment; but a DURABLE unattended timer needs a systemd user-timer / cron install on the VPS, which is OWNER_GATED (§12). A scheduler implementation is NOT a real persistent scheduled run.",
    ownerDependency: "systemd user timer (or cron) with least privilege — owner/root authorization on the VPS",
  });
}

const NIGHT_CYCLE_SCHEDULER_CONTRACT = Object.freeze({
  id: "V360-NIGHT-CYCLE-SCHEDULER",
  purpose: "§6/§7 — run EXACTLY two night-only self-improvement cycles per week driving the canonical odg-self-improvement-cycle; composes the canonical radar-scheduler primitives + Europe/Paris envelope; no second scheduler/engine",
  reuses: Object.freeze([
    "odg-weekly-radar-scheduler.parisParts (DST-correct Europe/Paris clock) + weekKey",
    "radar-schedule.WINDOW.tz (the canonical Europe/Paris operating timezone — reused, not invented)",
    "odg-self-improvement-cycle.runCycle (the cycle BODY, injected as cycleFn — no second improvement engine)",
  ]),
  invariants: Object.freeze([
    "EXACTLY two cycles per week, EXCLUSIVELY during the local (Europe/Paris) night; daytime ⇒ refused; time INJECTED, DST-correct, never Date.now()",
    "anti-duplicate per-slot-per-week (each slot runs at most once/week); overlap rejected via a TIMESTAMPED advisory lock the runner persists before executing, with a stale-timeout self-heal so a crashed run never deadlocks",
    "on cycle error state is preserved with running=false + slot NOT marked done ⇒ safe re-run (controlled recovery); drives the canonical odg-self-improvement-cycle (PROPOSED-only); INTEGRATE stays OWNER_GATED; selfAuthorized=false; no second scheduler/engine/envelope",
    "realTrigger = NOT_MEASURED until a real scheduled execution is observed; the DURABLE auto-trigger needs an OWNER_GATED systemd/cron install on the VPS (§12) — never declared OPERATIONAL without proof",
  ]),
});

module.exports = { validateNightConfig, isNight, dueSlot, slotWeekKey, lockStale, acquire, decide, execute, run, realTriggerStatus, NIGHT_SLOTS, TZ, NIGHT_CYCLE_SCHEDULER_CONTRACT };
export {};
