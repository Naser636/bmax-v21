#!/usr/bin/env node
"use strict";
/*
 * FRENCH INVOICE DUE-DATE — computes a real due DATE from an issue date + LME term, composing the calendar and the
 * payment-terms modules. PURE, deterministic, fail-closed. MODIFIES NEITHER.
 *
 *  - odg-gregorian-calendar : civil-date arithmetic (addDays, endOfMonth, dayOfWeek) — pure, no clock
 *  - odg-fr-payment-terms   : the LME term-ceiling compliance check
 *
 * THE GAP (reconciled): odg-fr-payment-terms.dueDay works on opaque integer day-indices and explicitly flagged the
 * "45-day end-of-month" variant as NOT computed (needs a calendar). With #735 that variant is now computable. This is
 * the consumer that joins them to produce an actual { y, m, d } due date.
 *
 * Honesty:
 *  - the "45 days END OF MONTH" term has TWO lawful readings — (A) add the days THEN take end-of-month, or (B) end-of-
 *    month THEN add the days. This computes reading (A) (the common one) and FLAGS the ambiguity — WHICH applies is the
 *    caller's/accountant's contractual determination, not decided here;
 *  - it does NOT decide which payment regime legally applies, nor shift to a business day (French due dates are not
 *    universally shifted) — it reports the civil due date + whether it falls on a weekend, leaving any shift to the caller;
 *  - inherits the LME-ceiling check's honesty (general ceiling, not a legal verdict). No network/clock/randomness.
 */

const CAL = require("./odg-gregorian-calendar.js");
const TERMS = require("./odg-fr-payment-terms.js");

function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function freeze(o: any): any { return Object.freeze(o); }

/**
 * computeDueDate(issueDate, termDays, opts?) -> { ok, dueDate, variant, termCompliant, dueDayOfWeek, dueIsWeekend, note }.
 * issueDate = { y, m, d }. opts = { endOfMonth?:bool }. NET_DAYS: due = issue + termDays. DAYS_THEN_EOM (endOfMonth):
 * due = endOfMonth(issue + termDays). Fail-closed: invalid date / bad term.
 */
function computeDueDate(issueDate: any, termDays: any, opts: any): any {
  const i = issueDate && typeof issueDate === "object" ? issueDate : {};
  if (!CAL.isValidDate(i.y, i.m, i.d)) return freeze({ ok: false, code: "INVALID_ISSUE_DATE", detail: "issueDate must be a valid { y, m, d }" });
  if (!isNonNegInt(termDays)) return freeze({ ok: false, code: "BAD_TERM", detail: "termDays must be a non-negative integer" });
  const endOfMonth = !!(opts && opts.endOfMonth === true);
  const variant = endOfMonth ? "DAYS_THEN_END_OF_MONTH" : "NET_DAYS";

  const shifted = CAL.addDays(i.y, i.m, i.d, termDays);
  if (shifted.ok !== true) return shifted;
  const due = endOfMonth ? CAL.endOfMonth(shifted.y, shifted.m) : shifted;
  if (due.ok !== true) return due;

  const dow = CAL.dayOfWeek(due.y, due.m, due.d);
  const compliance = TERMS.checkTermCompliance(termDays);
  return freeze({ ok: true, issueDate: freeze({ y: i.y, m: i.m, d: i.d }), termDays, variant,
    dueDate: freeze({ y: due.y, m: due.m, d: due.d }),
    dueDayOfWeek: dow.name, dueIsWeekend: dow.index >= 5,
    termCompliant: compliance.ok === true ? compliance.compliant : null,
    note: endOfMonth
      ? "'45 days end-of-month' computed as (A) add days THEN end-of-month. Reading (B) end-of-month-then-add-days also exists lawfully — WHICH applies is a contractual determination, not decided here. No business-day shift applied (reported dueIsWeekend only)."
      : "net-days due date (issue + termDays) on the proleptic-Gregorian calendar. No business-day shift applied (reported dueIsWeekend only); LME ceiling is a general check, not a legal verdict." });
}

const FR_DUE_DATE_CONTRACT = Object.freeze({
  id: "FR-DUE-DATE",
  purpose: "compute an invoice due DATE from issue date + LME term — composes odg-gregorian-calendar + odg-fr-payment-terms; fills the end-of-month variant #733 left uncomputed",
  reuses: Object.freeze(["odg-gregorian-calendar.addDays/endOfMonth/dayOfWeek/isValidDate", "odg-fr-payment-terms.checkTermCompliance"]),
  invariants: Object.freeze([
    "composes the calendar + payment-terms and MODIFIES NEITHER — a consumer, not a new engine",
    "'45 days end-of-month' has TWO lawful readings (days-then-EOM vs EOM-then-days); computes reading (A) and FLAGS the ambiguity — which applies is a contractual determination, not decided here",
    "does NOT shift the due date to a business day (French due dates aren't universally shifted) — reports dueIsWeekend; any shift is the caller's",
    "inherits the LME-ceiling check (general ceiling, NOT a definitive legal verdict)",
    "civil dates only, NO clock; fail-closed on invalid issue date / bad term; PURE/deterministic",
  ]),
});

module.exports = { computeDueDate, FR_DUE_DATE_CONTRACT };
export {};
