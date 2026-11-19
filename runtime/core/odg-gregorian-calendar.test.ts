#!/usr/bin/env node
"use strict";
/* Tests for odg-gregorian-calendar (pure proleptic-Gregorian, no Date). Day-of-week cross-checked vs KNOWN facts. */
const C = require("./odg-gregorian-calendar.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
function dow(y: number, m: number, d: number): string { return C.dayOfWeek(y, m, d).name; }

function main(): void {
  // day-of-week vs EXTERNALLY-KNOWN facts (not the module against itself)
  check("2000-01-01 = Saturday", dow(2000, 1, 1) === "Saturday");
  check("2024-01-01 = Monday", dow(2024, 1, 1) === "Monday");
  check("1970-01-01 = Thursday (Unix epoch)", dow(1970, 1, 1) === "Thursday");
  check("2024-07-14 = Sunday (Bastille Day 2024)", dow(2024, 7, 14) === "Sunday");
  check("dayOfWeek index 0=Monday..6=Sunday", C.dayOfWeek(2024, 1, 1).index === 0 && C.dayOfWeek(2000, 1, 1).index === 5);

  // leap + validity
  check("isLeap: 2000 yes, 1900 no, 2024 yes, 2023 no", C.isLeap(2000) && !C.isLeap(1900) && C.isLeap(2024) && !C.isLeap(2023));
  check("2024-02-29 valid; 2023-02-29 invalid", C.isValidDate(2024, 2, 29) === true && C.isValidDate(2023, 2, 29) === false);
  check("invalid month/day rejected", C.isValidDate(2024, 13, 1) === false && C.isValidDate(2024, 4, 31) === false && C.isValidDate(2024, 1, 0) === false);

  // daysInMonth + endOfMonth
  check("daysInMonth Feb 2024=29, Feb 2023=28, Apr=30, Jan=31", C.daysInMonth(2024, 2).days === 29 && C.daysInMonth(2023, 2).days === 28 && C.daysInMonth(2024, 4).days === 30 && C.daysInMonth(2024, 1).days === 31);
  check("endOfMonth(2024,2)=29; endOfMonth(2023,2)=28", C.endOfMonth(2024, 2).d === 29 && C.endOfMonth(2023, 2).d === 28);

  // isWeekend
  check("2024-07-14 Sunday ⇒ weekend; 2024-01-01 Monday ⇒ not", C.isWeekend(2024, 7, 14).weekend === true && C.isWeekend(2024, 1, 1).weekend === false);

  // addDays (incl. month/leap boundaries, negative)
  check("addDays(2024,2,28,+1)=2024-02-29 (leap); +2=2024-03-01", (() => { const a = C.addDays(2024, 2, 28, 1), b = C.addDays(2024, 2, 28, 2); return a.m === 2 && a.d === 29 && b.m === 3 && b.d === 1; })());
  check("addDays(2023,2,28,+1)=2023-03-01 (non-leap)", (() => { const a = C.addDays(2023, 2, 28, 1); return a.m === 3 && a.d === 1; })());
  check("addDays negative: (2024,3,1,-1)=2024-02-29", (() => { const a = C.addDays(2024, 3, 1, -1); return a.m === 2 && a.d === 29; })());
  check("addDays across year: (2024,12,31,+1)=2025-01-01", (() => { const a = C.addDays(2024, 12, 31, 1); return a.y === 2025 && a.m === 1 && a.d === 1; })());

  // daysBetween (2000 is leap ⇒ Jan31 + Feb29 = 60)
  check("daysBetween 2000-01-01..2000-03-01 = 60", C.daysBetween({ y: 2000, m: 1, d: 1 }, { y: 2000, m: 3, d: 1 }).days === 60);
  check("daysBetween same date = 0; reversed = negative", C.daysBetween({ y: 2024, m: 5, d: 10 }, { y: 2024, m: 5, d: 10 }).days === 0 && C.daysBetween({ y: 2024, m: 5, d: 11 }, { y: 2024, m: 5, d: 10 }).days === -1);

  // ROUND-TRIP: addDays then daysBetween back = k (exercises toRataDie/fromRataDie both directions over a wide range)
  let rtOk = true;
  for (let k = -5000; k <= 5000; k += 37) { const r = C.addDays(2000, 1, 1, k); if (C.daysBetween({ y: 2000, m: 1, d: 1 }, { y: r.y, m: r.m, d: r.d }).days !== k) { rtOk = false; break; } }
  check("round-trip addDays/daysBetween exact over ±5000 days", rtOk);
  // round-trip across the 400-year cycle boundary
  check("addDays(1,1,1,146096)=0400-12-31 (400-year cycle)", (() => { const a = C.addDays(1, 1, 1, 146096); return a.y === 400 && a.m === 12 && a.d === 31; })());

  // addBusinessDays: Fri 2024-01-05 +1 ⇒ Mon 2024-01-08 (skips Sat+Sun)
  const bd = C.addBusinessDays(2024, 1, 5, 1);
  check("business +1 from Fri ⇒ Mon (skips weekend, skipped 2)", bd.y === 2024 && bd.m === 1 && bd.d === 8 && bd.skipped === 2 && dow(bd.y, bd.m, bd.d) === "Monday");
  // with a holiday: Fri 2024-01-05 +1 but Mon 2024-01-08 is a holiday ⇒ Tue 2024-01-09
  check("business +1 skipping a caller holiday (Mon) ⇒ Tue", (() => { const r = C.addBusinessDays(2024, 1, 5, 1, ["2024-1-8"]); return r.d === 9 && dow(r.y, r.m, r.d) === "Tuesday"; })());
  check("business -1 backward from Mon ⇒ previous Fri", (() => { const r = C.addBusinessDays(2024, 1, 8, -1); return r.d === 5 && dow(r.y, r.m, r.d) === "Friday"; })());
  check("business note: weekends + caller holidays only, no public holidays known", /knows NO country's public holidays/.test(bd.note));

  // fail-closed
  check("invalid date ⇒ INVALID_DATE", C.dayOfWeek(2023, 2, 29).code === "INVALID_DATE" && C.addDays(2024, 13, 1, 1).code === "INVALID_DATE");
  check("bad n ⇒ BAD_N", C.addDays(2024, 1, 1, 1.5).code === "BAD_N");
  check("bad month ⇒ BAD_MONTH", C.daysInMonth(2024, 0).code === "BAD_MONTH");
  check("daysBetween bad date ⇒ INVALID_DATE", C.daysBetween({ y: 2024, m: 2, d: 30 }, { y: 2024, m: 1, d: 1 }).which === "a");

  // determinism + frozen + contract
  check("deterministic", JSON.stringify(C.addBusinessDays(2024, 1, 5, 1)) === JSON.stringify(C.addBusinessDays(2024, 1, 5, 1)));
  check("frozen", Object.isFrozen(C.dayOfWeek(2024, 1, 1)) && Object.isFrozen(bd));
  check("contract: no-clock Rata-Die, civil-only, caller-holidays, fail-closed, round-trip-exact",
    C.GREGORIAN_CALENDAR_CONTRACT.invariants.some((s: string) => /Rata-Die arithmetic, not the JS Date engine/.test(s)) &&
    C.GREGORIAN_CALENDAR_CONTRACT.invariants.some((s: string) => /knows NO public holidays itself/.test(s)) &&
    C.GREGORIAN_CALENDAR_CONTRACT.invariants.some((s: string) => /round-trip exact/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-gregorian-calendar (day-of-week vs KNOWN facts [2000-01-01 Sat, 1970-01-01 Thu, 2024-07-14 Sun]; leap/validity; daysInMonth/endOfMonth; addDays±/across-leap-year; daysBetween=60; round-trip ±5000 + 400yr cycle exact; addBusinessDays skip weekend+caller-holidays; invalid-date/bad-n fail-closed; PURE no-Date/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
