#!/usr/bin/env node
"use strict";
/*
 * V360 §6 — NIGHT-CYCLE SCHEDULER for the self-improvement engine. PURE, deterministic, fail-closed. Runs EXACTLY TWO
 * self-improvement cycles per week, EXCLUSIVELY during the local night, driving the canonical odg-self-improvement-cycle.
 * It is NOT a second scheduler/engine: it REUSES the canonical odg-weekly-radar-scheduler primitives (parisParts DST-correct
 * Europe/Paris clock, weekKey, beginLock) and the canonical Europe/Paris night envelope (radar-schedule.WINDOW.tz); the cycle
 * BODY is the canonical odg-self-improvement-cycle, injected as a `cycleFn` seam (no second improvement engine).
 *
 * RADAR-FIRST / approach comparison (§2): slot matching uses a DST-correct wall-clock day+hour WINDOW (via Intl Europe/Paris)
 * rather than interval-since-last (which drifts off "night" and ignores DST); anti-duplicate uses a per-slot-per-week key
 * (a single global week key would block the 2nd weekly slot); overlap uses the canonical running-flag lock (not a VPS pid
 * file); persistence of the trigger is a gitignored dev state file — the DURABLE auto-trigger needs a systemd/cron install
 * on the VPS, which is OWNER-GATED (§12), so realTrigger stays NOT_MEASURED until a real scheduled execution is observed.
 *
 * TIME IS INJECTED (epoch ms). The host runs Etc/UTC but "night" is ODG's Europe/Paris local night, evaluated DST-correctly
 * by Intl regardless of host TZ. The module never calls Date.now()/argless new Date() (the bin reads the real clock).
 */

const WRS = require("./odg-weekly-radar-scheduler.js"); // canonical parisParts (DST-correct) + weekKey + beginLock — reused
const RS = require("./radar-schedule.js");              // canonical Europe/Paris envelope (tz reused, not invented)

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const TZ = RS.WINDOW.tz; // "Europe/Paris" — the canonical ODG operating timezone (reused)
const NIGHT_START = 0, NIGHT_END = 6; // local night = [00:00, 06:00) Europe/Paris (for the daytime-refusal distinction)

// EXACTLY TWO spaced night slots per week (Europe/Paris), each a bounded 2h window inside the night. Spaced ~4 days apart so
// regressions/drift between passes are caught sooner than a single weekly pass (the measured-value justification for 2/week).
const NIGHT_SLOTS = freeze([
  freeze({ id: "night-A", day: "TUE", startHour: 2, endHour: 4, maxDurationMs: 2 * 60 * 60 * 1000 }),
  freeze({ id: "night-B", day: "SAT", startHour: 2, endHour: 4, maxDurationMs: 2 * 60 * 60 * 1000 }),
]);
const SECOND_CYCLE_JUSTIFICATION = "two spaced night cycles (TUE+SAT, ~4 days apart) detect connectivity regressions and Boussole drift mid-week instead of letting them persist up to 7 days; both are night-only and ≤2h, bounding resource use.";

/* validateNightConfig(slots?) -> { valid, violations[] }. Fail-closed POLICY check: exactly 2 slots, night-only, spaced, ≤3h,
 * and a measured-value justification for cyclesPerWeek>1 — so a non-conforming cadence cannot be declared conforming. */
function validateNightConfig(slots: any = NIGHT_SLOTS): any {
  const s = arr(slots); const v: string[] = [];
  if (s.length !== 2) v.push("MUST_BE_EXACTLY_TWO_CYCLES_PER_WEEK");
  for (const slot of s) {
    if (!isObj(slot)) { v.push("BAD_SLOT"); continue; }
    if (!(slot.startHour >= NIGHT_START && slot.endHour <= NIGHT_END)) v.push(`SLOT_NOT_NIGHT:${slot.id}`);
    if (!(slot.endHour > slot.startHour)) v.push(`SLOT_EMPTY_WINDOW:${slot.id}`);
    if ((slot.endHour - slot.startHour) * 3600000 > 3 * 3600000) v.push(`SLOT_OVER_3H:${slot.id}`);
  }
  // spacing: the two slot days must differ (not the same night).
  if (s.length === 2 && s[0].day === s[1].day) v.push("SLOTS_NOT_SPACED_SAME_DAY");
  if (!SECOND_CYCLE_JUSTIFICATION || SECOND_CYCLE_JUSTIFICATION.length < 20) v.push("MISSING_SECOND_CYCLE_JUSTIFICATION");
  return freeze({ valid: v.length === 0, violations: freeze(v), justification: SECOND_CYCLE_JUSTIFICATION });
}

/* isNight(epochMs) — local hour within [NIGHT_START, NIGHT_END) in Europe/Paris (DST-correct). */
function isNight(epochMs: number): boolean { const p = WRS.parisParts(epochMs); return p.hour >= NIGHT_START && p.hour < NIGHT_END; }

/* dueSlot(epochMs, slots?) — the night slot whose window is currently open (day + startHour ≤ localHour < endHour), else null. */
function dueSlot(epochMs: number, slots: any = NIGHT_SLOTS): any {
  const p = WRS.parisParts(epochMs);
  for (const slot of arr(slots)) if (p.weekday === slot.day && p.hour >= slot.startHour && p.hour < slot.endHour) return slot;
  return null;
}

/* slotWeekKey(epochMs, slotId) — per-slot-per-week dedup key (so each of the two weekly slots runs at most once per week). */
function slotWeekKey(epochMs: number, slotId: string): string { return WRS.weekKey(epochMs) + ":" + slotId; }

/* decide(state, epochMs, slots?) -> { trigger, slot, reason }. The gate: not already running (no overlap) AND a night slot is
 * open AND that slot has not already run this week. Daytime / no-slot ⇒ no trigger (distinct reasons). */
function decide(state: any, epochMs: number, slots: any = NIGHT_SLOTS): any {
  const s = isObj(state) ? state : {};
  if (s.running === true) return freeze({ trigger: false, slot: null, reason: "a cycle is already running — concurrent trigger REJECTED (no overlap)" });
  const slot = dueSlot(epochMs, slots);
  if (!slot) return freeze({ trigger: false, slot: null, reason: isNight(epochMs) ? "no night slot is due at this time" : "daytime — refused (cycles run only during the local night)" });
  const key = slotWeekKey(epochMs, slot.id);
  if (arr(s.doneSlots).indexOf(key) >= 0) return freeze({ trigger: false, slot: freeze({ ...slot }), reason: `slot ${slot.id} already ran this week — duplicate prevented` });
  return freeze({ trigger: true, slot: freeze({ ...slot }), reason: `night slot ${slot.id} open, not yet run this week, no overlap` });
}

/*
 * run(state, opts) -> frozen run report. opts: { now (epoch ms), cycleFn(slot, epochMs)->cycleResult (the canonical
 * odg-self-improvement-cycle, injected), slots? }. Lifecycle: decide → beginLock (TRIGGERED) → cycleFn (EXECUTED) → record
 * the slot done + release the lock. On a cycleFn THROW the state is preserved (lock released, slot NOT marked done) so the
 * slot safely re-runs — controlled recovery, no half-done duplicate. INTEGRATE stays owner-gated (the cycle is PROPOSED-only).
 */
function run(state: any, opts: any = {}): any {
  const o = isObj(opts) ? opts : {};
  const now = o.now;
  const prev = isObj(state) ? state : {};
  const gate = decide(prev, now, o.slots);
  if (!gate.trigger) return freeze({ ran: false, lifecycle: "SKIPPED", reason: gate.reason, slot: gate.slot, state: freeze({ ...prev }), realTrigger: "NOT_MEASURED" });

  const locked = WRS.beginLock(prev); // running=true (overlap prevention) — TRIGGERED
  let cycleResult: any = null; let error: string | null = null;
  try {
    const fn = typeof o.cycleFn === "function" ? o.cycleFn : null;
    if (!fn) throw new Error("NO_CYCLE_FN"); // fail-closed: nothing to execute
    cycleResult = fn(gate.slot, now); // EXECUTED — the canonical odg-self-improvement-cycle body
  } catch (e: any) { error = (e && e.message) ? String(e.message) : "CYCLE_ERROR"; }

  const key = slotWeekKey(now, gate.slot.id);
  if (error) {
    // preserve state, release lock, do NOT mark the slot done ⇒ safe re-run (controlled recovery).
    const recovered = freeze({ ...prev, running: false, lastError: freeze({ slot: gate.slot.id, error, atWeek: WRS.weekKey(now) }) });
    return freeze({ ran: true, lifecycle: "EXECUTED_ERROR", slot: gate.slot, error, recovered: true, resumable: true, state: recovered, realTrigger: "NOT_MEASURED" });
  }
  const doneSlots = Array.from(new Set([...arr(prev.doneSlots), key]));
  const newState = freeze({ ...prev, running: false, doneSlots: freeze(doneSlots), lastRun: freeze({ slot: gate.slot.id, atWeek: WRS.weekKey(now) }) });
  return freeze({
    ran: true, lifecycle: "EXECUTED", slot: gate.slot,
    cycleOutcome: cycleResult && cycleResult.outcome ? cycleResult.outcome : null, // the self-improvement cycle's own outcome
    integrate: "OWNER_GATED", measure: cycleResult && cycleResult.measure ? cycleResult.measure : "NOT_MEASURED", selfAuthorized: false,
    state: newState, realTrigger: "NOT_MEASURED",
    note: "the cycle body ran (EXECUTED); INTEGRATE is owner-gated (PROPOSED-only); OPERATIONAL (persistent auto-trigger) needs a systemd/cron install on the VPS (OWNER_GATED) — realTrigger stays NOT_MEASURED until a real scheduled execution is observed.",
  });
}

/* realTriggerStatus() — honest persistence limit: the DURABLE night auto-trigger needs an owner-gated systemd/cron install. */
function realTriggerStatus(): any {
  return freeze({
    status: "NOT_MEASURED",
    lifecycleReached: freeze(["CONFIGURED", "TRIGGERED", "EXECUTED"]),
    lifecycleNotReached: freeze(["OPERATIONAL (persistent unattended auto-trigger)"]),
    reason: "all scheduling LOGIC (night gate, 2 spaced slots, DST-correct, anti-duplicate, no-overlap, recovery) is implemented + tested, and a real controlled trigger runs the canonical cycle in the dev environment; but a DURABLE unattended timer needs a systemd user-timer / cron install on the VPS, which is OWNER_GATED (§12). A scheduler implementation is NOT a real persistent scheduled run.",
    ownerDependency: "systemd user timer (or cron) with least privilege — owner/root authorization on the VPS",
  });
}

const NIGHT_CYCLE_SCHEDULER_CONTRACT = Object.freeze({
  id: "V360-NIGHT-CYCLE-SCHEDULER",
  purpose: "§6/§7 — run EXACTLY two night-only self-improvement cycles per week driving the canonical odg-self-improvement-cycle; composes the canonical radar-scheduler primitives + Europe/Paris envelope; no second scheduler/engine",
  reuses: Object.freeze([
    "odg-weekly-radar-scheduler.parisParts (DST-correct Europe/Paris clock) + weekKey + beginLock (overlap lock)",
    "radar-schedule.WINDOW.tz (the canonical Europe/Paris operating timezone — reused, not invented)",
    "odg-self-improvement-cycle.runCycle (the cycle BODY, injected as cycleFn — no second improvement engine)",
  ]),
  invariants: Object.freeze([
    "EXACTLY two cycles per week, EXCLUSIVELY during the local (Europe/Paris) night; daytime ⇒ refused; time INJECTED, DST-correct, never Date.now()",
    "anti-duplicate per-slot-per-week (each slot runs at most once/week); overlap rejected (running lock); on cycle error state is preserved + slot NOT marked done ⇒ safe re-run (controlled recovery)",
    "drives the canonical odg-self-improvement-cycle (PROPOSED-only); INTEGRATE stays OWNER_GATED; selfAuthorized=false; no second scheduler/engine/envelope",
    "realTrigger = NOT_MEASURED until a real scheduled execution is observed; the DURABLE auto-trigger needs an OWNER_GATED systemd/cron install on the VPS (§12) — never declared OPERATIONAL without proof",
  ]),
});

module.exports = { validateNightConfig, isNight, dueSlot, slotWeekKey, decide, run, realTriggerStatus, NIGHT_SLOTS, TZ, NIGHT_CYCLE_SCHEDULER_CONTRACT };
export {};
