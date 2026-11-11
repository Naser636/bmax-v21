#!/usr/bin/env node
"use strict";
/* V139 §7 — radar-schedule validator battery. A conforming bounded weekly cycle validates; every out-of-envelope property
 * (wrong day/tz, window before 02:00 / after 05:00, >3h, always-on, overlap not prevented, no budget, unbounded retries,
 * no backoff, dedup off, unjustified 2nd cycle) is REJECTED; fail-closed on garbage. */
const S = require("./radar-schedule.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const GOOD = { dayOfWeek: "SUN", timezone: "Europe/Paris", startHour: 2, endHour: 5, maxDurationMs: 3 * 3600 * 1000, alwaysOn: false, overlapPolicy: "SKIP_IF_RUNNING", budget: { maxCalls: 50, maxBytes: 5_000_000 }, retry: { maxRetries: 2, backoffMs: 30000 }, deduplicate: true, cyclesPerWeek: 1 };

function main() {
  check("conforming bounded Sunday 02:00–05:00 cycle ⇒ valid", S.validateSchedule(GOOD).valid === true);
  const bad = (over: any, code: string) => { const r = S.validateSchedule({ ...GOOD, ...over }); return r.valid === false && r.violations.includes(code); };
  check("wrong day ⇒ REJECTED", bad({ dayOfWeek: "MON" }, "WINDOW_DAY_NOT_SUNDAY"));
  check("wrong tz ⇒ REJECTED", bad({ timezone: "UTC" }, "WINDOW_TZ_NOT_PARIS"));
  check("window starts before 02:00 ⇒ REJECTED", bad({ startHour: 1 }, "WINDOW_START_BEFORE_0200"));
  check("window ends after 05:00 ⇒ REJECTED", bad({ endHour: 6 }, "WINDOW_END_AFTER_0500"));
  check("duration > 3h ⇒ REJECTED", bad({ maxDurationMs: 4 * 3600 * 1000 }, "DURATION_UNBOUNDED_OR_OVER_3H"));
  check("always-on polling ⇒ REJECTED", bad({ alwaysOn: true }, "ALWAYS_ON_FORBIDDEN"));
  check("F2: a TRUTHY non-boolean always-on flag ⇒ REJECTED (not just === true)", bad({ alwaysOn: "1" }, "ALWAYS_ON_FORBIDDEN") && bad({ continuousPolling: 1 }, "ALWAYS_ON_FORBIDDEN"));
  check("overlap not prevented ⇒ REJECTED", bad({ overlapPolicy: "ALLOW" }, "OVERLAP_NOT_PREVENTED"));
  check("no declared budget ⇒ REJECTED", bad({ budget: undefined }, "BUDGET_NOT_DECLARED_OR_INVALID"));
  check("unbounded retries ⇒ REJECTED", bad({ retry: { maxRetries: 99, backoffMs: 1000 } }, "RETRIES_UNBOUNDED"));
  check("no failure backoff ⇒ REJECTED", bad({ retry: { maxRetries: 2 } }, "NO_FAILURE_BACKOFF"));
  check("dedup disabled ⇒ REJECTED", bad({ deduplicate: false }, "DEDUP_DISABLED"));
  check("2nd weekly cycle WITHOUT justification ⇒ REJECTED", bad({ cyclesPerWeek: 2 }, "SECOND_CYCLE_UNJUSTIFIED"));
  check("2nd weekly cycle WITH measured-value justification ⇒ valid", S.validateSchedule({ ...GOOD, cyclesPerWeek: 2, secondCycleJustification: "measured value: +18 fresh findings/week over 4 weeks" }).valid === true);
  check(">2 cycles ⇒ REJECTED (TOO_MANY_CYCLES)", S.validateSchedule({ ...GOOD, cyclesPerWeek: 3, secondCycleJustification: "x" }).violations.includes("TOO_MANY_CYCLES"));
  check("garbage ⇒ not valid, no throw (fail-closed)", S.validateSchedule(null).valid === false && S.validateSchedule(undefined).valid === false);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — radar-schedule (single bounded Sunday-night cycle; no always-on; no overlap; declared budget + bounded retries + backoff; 2nd cycle justified only)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
