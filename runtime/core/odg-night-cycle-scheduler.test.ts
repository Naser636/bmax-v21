#!/usr/bin/env node
"use strict";
/* Tests for odg-night-cycle-scheduler (V360 §6/§7). Injectable clock (epoch ms) ⇒ deterministic, zero fs/network.
 * Demonstrates every mandated scenario: due-slot → trigger; not-due → skip; daytime → refuse; same slot twice → refused;
 * already running → no overlap; error → state preserved + safe re-run (recovery); DST change → still correct; and the
 * honest persistence limit (OPERATIONAL needs an owner-gated systemd/cron install). */
const M = require("./odg-night-cycle-scheduler.js");
const WRS = require("./odg-weekly-radar-scheduler.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

// find the first epoch at/after baseUtcMs whose Europe/Paris parts are (weekday, hour) — DST-correct, no Date.now.
function epochForParis(weekday: string, hour: number, baseUtcMs: number): number {
  for (let t = baseUtcMs; t < baseUtcMs + 9 * 24 * 3600000; t += 3600000) { const p = WRS.parisParts(t); if (p.weekday === weekday && p.hour === hour) return t; }
  throw new Error("epoch not found for " + weekday + " " + hour);
}
const WINTER = Date.UTC(2026, 0, 5);  // early Jan 2026 (CET, UTC+1)
const SUMMER = Date.UTC(2026, 6, 1);  // early Jul 2026 (CEST, UTC+2)
const okCycle = (slot: any) => ({ outcome: "OWNER_DECISION_ONLY", measure: "NOT_MEASURED", slot: slot.id });

function main(): void {
  // config policy
  const cfg = M.validateNightConfig();
  check("config valid: exactly 2 night-only spaced slots with a 2nd-cycle justification", cfg.valid === true && cfg.violations.length === 0 && cfg.justification.length > 20);
  check("misconfig rejected (3 slots / same day)", M.validateNightConfig([{ id: "a", day: "TUE", startHour: 2, endHour: 4 }, { id: "b", day: "TUE", startHour: 2, endHour: 4 }, { id: "c", day: "WED", startHour: 2, endHour: 4 }]).valid === false);
  check("misconfig rejected (daytime slot)", M.validateNightConfig([{ id: "a", day: "TUE", startHour: 14, endHour: 16 }, { id: "b", day: "SAT", startHour: 2, endHour: 4 }]).valid === false);

  // (1) night slot due → trigger
  const tueNight = epochForParis("TUE", 2, WINTER);
  const d1 = M.decide({}, tueNight);
  check("(1) night slot due ⇒ trigger (night-A)", d1.trigger === true && d1.slot.id === "night-A");

  // (2) not due (night but wrong day) → no trigger
  const wedNight = epochForParis("WED", 2, WINTER);
  const d2 = M.decide({}, wedNight);
  check("(2) night, no slot due ⇒ no trigger", d2.trigger === false && /no night slot/.test(d2.reason));

  // (3) daytime → refuse
  const tueDay = epochForParis("TUE", 14, WINTER);
  const d3 = M.decide({}, tueDay);
  check("(3) daytime ⇒ refused", d3.trigger === false && /daytime/.test(d3.reason));

  // (9-ish) real-ish EXECUTED path via injected cycleFn (the canonical cycle body)
  const r1 = M.run({}, { now: tueNight, cycleFn: okCycle });
  check("EXECUTED: cycle body ran; INTEGRATE owner-gated; selfAuthorized=false; realTrigger NOT_MEASURED", r1.ran === true && r1.lifecycle === "EXECUTED" && r1.integrate === "OWNER_GATED" && r1.selfAuthorized === false && r1.realTrigger === "NOT_MEASURED");
  check("EXECUTED: slot recorded done for this week", r1.state.doneSlots.indexOf(M.slotWeekKey(tueNight, "night-A")) >= 0);

  // (4) same slot twice this week → 2nd refused
  const d4 = M.decide(r1.state, tueNight + 30 * 60000); // 30 min later, same slot/week
  check("(4) same slot twice this week ⇒ refused (duplicate prevented)", d4.trigger === false && /already ran this week/.test(d4.reason));

  // (5) a cycle already running → no overlap
  const d5 = M.decide({ running: true }, tueNight);
  check("(5) cycle already running ⇒ no overlap (rejected)", d5.trigger === false && /no overlap/.test(d5.reason));

  // (6)+(7) error during the cycle → state preserved, slot NOT marked done, safe re-run (controlled recovery)
  const rErr = M.run({}, { now: tueNight, cycleFn: () => { throw new Error("boom"); } });
  check("(7) cycle error ⇒ EXECUTED_ERROR, lock released, resumable, slot NOT marked done", rErr.lifecycle === "EXECUTED_ERROR" && rErr.resumable === true && rErr.state.running === false && (rErr.state.doneSlots || []).indexOf(M.slotWeekKey(tueNight, "night-A")) < 0);
  const rRetry = M.run(rErr.state, { now: tueNight, cycleFn: okCycle });
  check("(6) controlled recovery: the slot safely RE-RUNS after an error", rRetry.lifecycle === "EXECUTED");

  // fail-closed: no cycleFn ⇒ EXECUTED_ERROR (nothing fabricated)
  const rNoFn = M.run({}, { now: tueNight });
  check("fail-closed: missing cycleFn ⇒ EXECUTED_ERROR (no fabricated run)", rNoFn.lifecycle === "EXECUTED_ERROR" && /NO_CYCLE_FN/.test(rNoFn.error));

  // (8) DST change: the SAME local night time triggers in both CET and CEST, at DIFFERENT UTC offsets (DST-correct)
  const tueNightSummer = epochForParis("TUE", 2, SUMMER);
  const dSummer = M.decide({}, tueNightSummer);
  const utcHourWinter = new Date(tueNight).getUTCHours();
  const utcHourSummer = new Date(tueNightSummer).getUTCHours();
  check("(8) DST: local 02:00 Paris triggers in summer too", dSummer.trigger === true && dSummer.slot.id === "night-A");
  check("(8) DST-correct: same local hour maps to DIFFERENT UTC hours (winter≠summer)", utcHourWinter !== utcHourSummer);

  // second weekly slot (SAT) is independent of the first (TUE) — both run in the same week
  const satNight = epochForParis("SAT", 2, WINTER);
  const dSat = M.decide(r1.state, satNight);
  check("second weekly slot (night-B/SAT) still triggers after night-A ran (2 cycles/week)", dSat.trigger === true && dSat.slot.id === "night-B");

  // honest persistence limit
  const rt = M.realTriggerStatus();
  check("persistence limit: CONFIGURED+TRIGGERED+EXECUTED reached; OPERATIONAL owner-gated (systemd/cron)", rt.status === "NOT_MEASURED" && rt.lifecycleReached.indexOf("EXECUTED") >= 0 && /systemd/i.test(rt.ownerDependency) && /OPERATIONAL/.test(JSON.stringify(rt.lifecycleNotReached)));

  // isNight + frozen + contract
  check("isNight true at 02:00 Paris, false at 14:00", M.isNight(tueNight) === true && M.isNight(tueDay) === false);
  check("frozen result", Object.isFrozen(r1) && Object.isFrozen(M.NIGHT_SLOTS));
  check("contract: exactly 2 night-only cycles; drives canonical cycle; no 2nd scheduler; realTrigger owner-gated",
    /EXACTLY two cycles per week/.test(JSON.stringify(M.NIGHT_CYCLE_SCHEDULER_CONTRACT.invariants)) &&
    /no second scheduler/.test(JSON.stringify(M.NIGHT_CYCLE_SCHEDULER_CONTRACT.invariants)) &&
    /odg-self-improvement-cycle/.test(JSON.stringify(M.NIGHT_CYCLE_SCHEDULER_CONTRACT.reuses)) &&
    /NOT_MEASURED until a real scheduled execution/.test(JSON.stringify(M.NIGHT_CYCLE_SCHEDULER_CONTRACT.invariants)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-night-cycle-scheduler (V360 §6/§7: exactly 2 night-only cycles/week driving the canonical odg-self-improvement-cycle; due→trigger, daytime→refuse, duplicate→refuse, overlap→reject, error→safe recovery, DST-correct; realTrigger NOT_MEASURED / OPERATIONAL owner-gated; reuses radar-scheduler primitives, no 2nd scheduler)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
