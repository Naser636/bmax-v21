#!/usr/bin/env node
"use strict";
/*
 * PROLEPTIC-GREGORIAN CALENDAR — day-of-week, leap-aware validity, days-between, add-days, end-of-month, business-days.
 * PURE, deterministic, fail-closed. NO wall clock: dates are caller-supplied { y, m, d } civil dates (no "today", no
 * timezone) — day-of-week is computed by Rata-Die arithmetic, NOT the JS Date engine.
 *
 * THE GAP (reconciled): the repo's date helpers are clock/Date/epoch-based and single-purpose (control-evidence-freshness
 * daysBetween on ISO via Date; p10 addDaysUTC via new Date; radar-loop daysBetween on epoch-ms). There is NO pure,
 * reusable, Date-FREE calendar — which is exactly why so much of the codebase works on opaque integer day-indices. This
 * provides the deterministic primitives (incl. the end-of-month arithmetic odg-fr-payment-terms flagged as "not computed").
 *
 * Honesty: proleptic Gregorian, civil dates only (no timezone/DST, no leap seconds); business-day arithmetic skips
 * WEEKENDS + a CALLER-supplied holiday set — it does NOT know any country's public holidays unless supplied (flagged).
 * No network/clock/randomness.
 */

function isInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v); }
function freeze(o: any): any { return Object.freeze(o); }
const DOW_NAMES = Object.freeze(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);

function isLeap(y: number): boolean { return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0); }
function daysInMonthRaw(y: number, m: number): number { return m === 2 ? (isLeap(y) ? 29 : 28) : ([4, 6, 9, 11].indexOf(m) >= 0 ? 30 : 31); }

/** isValidDate(y,m,d) -> boolean. Proleptic Gregorian; m 1..12, d 1..daysInMonth. */
function isValidDate(y: any, m: any, d: any): boolean { return isInt(y) && isInt(m) && isInt(d) && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonthRaw(y, m); }

/** Rata Die (fixed day number; 0001-01-01 = 1). Internal; valid date assumed. */
function toRataDie(y: number, m: number, d: number): number {
  const corr = m <= 2 ? 0 : (isLeap(y) ? -1 : -2);
  return 365 * (y - 1) + Math.floor((y - 1) / 4) - Math.floor((y - 1) / 100) + Math.floor((y - 1) / 400)
    + Math.floor((367 * m - 362) / 12) + corr + d;
}
/** Inverse of toRataDie (Reingold–Dershowitz gregorian-from-fixed). */
function fromRataDie(rd: number): any {
  const d0 = rd - 1;
  const n400 = Math.floor(d0 / 146097), d1 = d0 - 146097 * n400;
  const n100 = Math.floor(d1 / 36524), d2 = d1 - 36524 * n100;
  const n4 = Math.floor(d2 / 1461), d3 = d2 - 1461 * n4;
  const n1 = Math.floor(d3 / 365);
  let year = 400 * n400 + 100 * n100 + 4 * n4 + n1;
  if (n100 === 4 || n1 === 4) return { y: year, m: 12, d: 31 };
  year += 1;
  const prior = rd - toRataDie(year, 1, 1);
  const corr = rd >= toRataDie(year, 3, 1) ? (isLeap(year) ? 1 : 2) : 0;
  const month = Math.floor((12 * (prior + corr) + 373) / 367);
  const day = rd - toRataDie(year, month, 1) + 1;
  return { y: year, m: month, d: day };
}

function okDate(y: any, m: any, d: any): any { return isValidDate(y, m, d) ? null : freeze({ ok: false, code: "INVALID_DATE", detail: `${y}-${m}-${d} is not a valid proleptic-Gregorian date` }); }

/** dayOfWeek(y,m,d) -> { ok, index (0=Mon..6=Sun), name }. Computed by Rata Die (NOT the Date engine). */
function dayOfWeek(y: any, m: any, d: any): any {
  const e = okDate(y, m, d); if (e) return e;
  const idx = (((toRataDie(y, m, d) - 1) % 7) + 7) % 7; // RD 1 (0001-01-01) is a Monday ⇒ index 0
  return freeze({ ok: true, index: idx, name: DOW_NAMES[idx] });
}

/** isWeekend(y,m,d) -> { ok, weekend }. Saturday or Sunday. */
function isWeekend(y: any, m: any, d: any): any { const dw = dayOfWeek(y, m, d); if (dw.ok !== true) return dw; return freeze({ ok: true, weekend: dw.index >= 5, name: dw.name }); }

/** daysInMonth(y,m) -> { ok, days }. Leap-aware. */
function daysInMonth(y: any, m: any): any { if (!isInt(y) || !isInt(m) || m < 1 || m > 12) return freeze({ ok: false, code: "BAD_MONTH" }); return freeze({ ok: true, days: daysInMonthRaw(y, m), leapYear: isLeap(y) }); }

/** endOfMonth(y,m) -> { ok, y, m, d }. Last calendar day of the month. */
function endOfMonth(y: any, m: any): any { const dm = daysInMonth(y, m); if (dm.ok !== true) return dm; return freeze({ ok: true, y, m, d: dm.days }); }

/** addDays(y,m,d,n) -> { ok, y, m, d }. Pure Rata-Die arithmetic (n may be negative). */
function addDays(y: any, m: any, d: any, n: any): any {
  const e = okDate(y, m, d); if (e) return e;
  if (!isInt(n)) return freeze({ ok: false, code: "BAD_N" });
  const r = fromRataDie(toRataDie(y, m, d) + n);
  return freeze({ ok: true, y: r.y, m: r.m, d: r.d });
}

/** daysBetween(a,b) -> { ok, days }. b − a in calendar days. a,b = {y,m,d}. */
function daysBetween(a: any, b: any): any {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return freeze({ ok: false, code: "BAD_DATES" });
  const ea = okDate(a.y, a.m, a.d); if (ea) return freeze({ ok: false, code: "INVALID_DATE", which: "a" });
  const eb = okDate(b.y, b.m, b.d); if (eb) return freeze({ ok: false, code: "INVALID_DATE", which: "b" });
  return freeze({ ok: true, days: toRataDie(b.y, b.m, b.d) - toRataDie(a.y, a.m, a.d) });
}

/**
 * addBusinessDays(y,m,d,n,holidays?) -> { ok, y, m, d, skipped }. Steps n business days forward (n<0 backward), skipping
 * WEEKENDS and any date in the caller-supplied `holidays` set (array of "Y-M-D" strings). Knows NO public holidays itself.
 */
function addBusinessDays(y: any, m: any, d: any, n: any, holidays?: any): any {
  const e = okDate(y, m, d); if (e) return e;
  if (!isInt(n)) return freeze({ ok: false, code: "BAD_N" });
  const hol = new Set<string>(Array.isArray(holidays) ? holidays.filter((h: any) => typeof h === "string") : []);
  const key = (r: any) => `${r.y}-${r.m}-${r.d}`;
  const isBiz = (r: any) => { const dw = (((toRataDie(r.y, r.m, r.d) - 1) % 7) + 7) % 7; return dw < 5 && !hol.has(key(r)); };
  let rd = toRataDie(y, m, d); let remaining = Math.abs(n); const step = n >= 0 ? 1 : -1; let skipped = 0;
  while (remaining > 0) { rd += step; const r = fromRataDie(rd); if (isBiz(r)) remaining--; else skipped++; }
  const r = fromRataDie(rd);
  return freeze({ ok: true, y: r.y, m: r.m, d: r.d, skipped,
    note: "business days skip WEEKENDS + the caller-supplied holiday set only — this calendar knows NO country's public holidays unless supplied." });
}

const GREGORIAN_CALENDAR_CONTRACT = Object.freeze({
  id: "GREGORIAN-CALENDAR",
  purpose: "pure, Date-FREE proleptic-Gregorian calendar (day-of-week, validity, add/between days, end-of-month, business-days) — the reusable primitive the repo's Date/epoch helpers don't provide",
  reuses: Object.freeze(["Rata-Die arithmetic (no JS Date); civil dates only; composes with odg-fr-payment-terms (end-of-month variant)"]),
  invariants: Object.freeze([
    "NO wall clock: dates are caller-supplied {y,m,d}; day-of-week is Rata-Die arithmetic, not the JS Date engine",
    "proleptic Gregorian, civil dates only — no timezone/DST, no leap seconds",
    "business-day arithmetic skips WEEKENDS + a CALLER-supplied holiday set — knows NO public holidays itself (flagged)",
    "fail-closed: an invalid date (bad month/day, leap-aware) ⇒ typed refusal (INVALID_DATE)",
    "PURE + deterministic; round-trip exact (fromRataDie ∘ toRataDie = identity); no network/clock/randomness",
  ]),
});

module.exports = { isLeap, isValidDate, dayOfWeek, isWeekend, daysInMonth, endOfMonth, addDays, daysBetween, addBusinessDays, GREGORIAN_CALENDAR_CONTRACT };
export {};
