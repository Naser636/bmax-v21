#!/usr/bin/env node
"use strict";
/* Tests for odg-fr-due-date (composes calendar + payment-terms). PURE. Composes the REAL modules (no mocks). */
const D = require("./odg-fr-due-date.js");
const CAL = require("./odg-gregorian-calendar.js");
const TERMS = require("./odg-fr-payment-terms.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
function eq(a: any, y: number, m: number, d: number): boolean { return a.y === y && a.m === m && a.d === d; }

function main(): void {
  // NET_DAYS: 2026-01-15 + 45 = 2026-03-01 (Sunday); compliant (45 ≤ 60)
  const net = D.computeDueDate({ y: 2026, m: 1, d: 15 }, 45, {});
  check("NET 2026-01-15+45 ⇒ 2026-03-01, variant NET_DAYS", net.ok === true && eq(net.dueDate, 2026, 3, 1) && net.variant === "NET_DAYS");
  check("due day-of-week Sunday, weekend true, term compliant", net.dueDayOfWeek === "Sunday" && net.dueIsWeekend === true && net.termCompliant === true);

  // COMPOSITION FIDELITY: dueDate == calendar.addDays; compliance == payment-terms
  check("NET dueDate equals calendar.addDays", (() => { const a = CAL.addDays(2026, 1, 15, 45); return eq(net.dueDate, a.y, a.m, a.d); })());
  check("termCompliant equals payment-terms.checkTermCompliance", net.termCompliant === TERMS.checkTermCompliance(45).compliant);

  // END-OF-MONTH variant: add 45 THEN end-of-month ⇒ 2026-03-31
  const eom = D.computeDueDate({ y: 2026, m: 1, d: 15 }, 45, { endOfMonth: true });
  check("EOM 2026-01-15+45-then-EOM ⇒ 2026-03-31", eq(eom.dueDate, 2026, 3, 31) && eom.variant === "DAYS_THEN_END_OF_MONTH");
  check("EOM note flags the two lawful readings (ambiguity)", /Reading \(B\).*also exists lawfully/.test(eom.note) && /not decided here/.test(eom.note));
  // EOM fidelity: endOfMonth of (issue + days)
  check("EOM dueDate equals calendar.endOfMonth(addDays)", (() => { const s = CAL.addDays(2026, 1, 15, 45); const e = CAL.endOfMonth(s.y, s.m); return eq(eom.dueDate, e.y, e.m, e.d); })());

  // leap-year: 2024-01-15 + 45 = 2024-02-29 (2024 is leap)
  check("leap-year NET 2024-01-15+45 ⇒ 2024-02-29", eq(D.computeDueDate({ y: 2024, m: 1, d: 15 }, 45, {}).dueDate, 2024, 2, 29));
  // across year boundary: 2025-12-20 + 30 = 2026-01-19
  check("across-year NET 2025-12-20+30 ⇒ 2026-01-19", eq(D.computeDueDate({ y: 2025, m: 12, d: 20 }, 30, {}).dueDate, 2026, 1, 19));

  // term > LME ceiling ⇒ due date still computed but termCompliant false (computation ≠ legality)
  const over = D.computeDueDate({ y: 2026, m: 1, d: 15 }, 90, {});
  check("term 90 ⇒ termCompliant false, due date STILL computed", over.ok === true && over.termCompliant === false && eq(over.dueDate, 2026, 4, 15));

  // term 0 ⇒ due = issue date
  check("term 0 ⇒ due = issue date", eq(D.computeDueDate({ y: 2026, m: 6, d: 10 }, 0, {}).dueDate, 2026, 6, 10));

  // fail-closed
  check("invalid issue date ⇒ INVALID_ISSUE_DATE", D.computeDueDate({ y: 2026, m: 2, d: 30 }, 30, {}).code === "INVALID_ISSUE_DATE");
  check("bad term ⇒ BAD_TERM", D.computeDueDate({ y: 2026, m: 1, d: 1 }, -1, {}).code === "BAD_TERM");
  check("non-object issue date ⇒ INVALID_ISSUE_DATE", D.computeDueDate(null, 30, {}).code === "INVALID_ISSUE_DATE");

  // honesty + determinism + frozen + contract
  check("note: no business-day shift, LME general ceiling not verdict", /No business-day shift/.test(net.note) && /not a legal verdict/.test(net.note));
  check("deterministic", JSON.stringify(D.computeDueDate({ y: 2026, m: 1, d: 15 }, 45, {})) === JSON.stringify(net));
  check("frozen", Object.isFrozen(net) && Object.isFrozen(net.dueDate));
  check("contract: composes-modifies-neither, EOM-two-readings, no-shift, inherits-ceiling",
    D.FR_DUE_DATE_CONTRACT.invariants.some((s: string) => /MODIFIES NEITHER/.test(s)) &&
    D.FR_DUE_DATE_CONTRACT.invariants.some((s: string) => /TWO lawful readings/.test(s)) &&
    D.FR_DUE_DATE_CONTRACT.invariants.some((s: string) => /does NOT shift the due date to a business day/.test(s)) &&
    D.FR_DUE_DATE_CONTRACT.invariants.some((s: string) => /NOT a definitive legal verdict/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-fr-due-date (composes REAL calendar + payment-terms, modifies neither: NET 2026-01-15+45⇒2026-03-01 Sun; EOM variant⇒2026-03-31 [two lawful readings flagged]; fidelity vs addDays/endOfMonth/checkTermCompliance; leap 2024-02-29; across-year; term>60 still computes but termCompliant false; invalid-date/bad-term fail-closed; no business-day shift; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
