#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the monthly model is lag-aware + honest: 12 rows; cashed-within-horizon < signed
// bookings (lags); early months have 0 signings (salesLag); longer lags + churn reduce cashed; stress (delay/churn)
// reduces cashed vs base; signed≠cashed; reproducible. €500k stays a TARGET; nothing tuned to hit it.
"use strict";
const assert = require("assert");
const S = require("./revenue-schedule.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const a = { months: 12, monthlyProspects: 40, conv: { prospectToInterested: 0.18, interestedToProposal: 0.5, proposalToSigned: 0.4 }, avgContractValue: 18000, recurringMonthly: 2000, costRatio: 0.3, salesLag: 1, deliveryLag: 1, paymentLag: 1, rampLag: 2, churn: 0.05 };
const p = S.projectMonthly(a);

// (1) 12 monthly rows + cumulative cashed monotonic.
ok("12 monthly rows, cumulativeCashed non-decreasing", p.rows.length === 12 && p.rows.every((r, i) => i === 0 || r.cumulativeCashed >= p.rows[i - 1].cumulativeCashed));
// (2) KEY honesty: cash lags invoice ⇒ cashedWithinHorizon < invoicedWithinHorizon (late invoices unpaid in-window).
ok("cashedWithinHorizon < invoicedWithinHorizon (cash lags invoice)", p.totals.cashedWithinHorizon < p.totals.invoicedWithinHorizon && p.totals.cashedWithinHorizon > 0);
// (3) salesLag ⇒ month 0 has 0 signings (first prospects sign in month salesLag).
ok("month 0 has 0 signings (salesLag=1)", p.rows[0].signings === 0 && p.rows[1].signings > 0);
// (4) KEY honesty: lags defer cash OUT of the 12-month horizon ⇒ cashed(with lag) < cashed(zero lag).
const noLag = S.projectMonthly({ ...a, salesLag: 0, deliveryLag: 0, paymentLag: 0, rampLag: 0 });
ok("lags reduce cashed-within-horizon vs zero-lag ideal", p.totals.cashedWithinHorizon < noLag.totals.cashedWithinHorizon);
// (5) longer payment lag ⇒ less cashed within horizon.
const slow = S.projectMonthly({ ...a, paymentLag: 3 });
ok("longer paymentLag reduces cashedWithinHorizon", slow.totals.cashedWithinHorizon < p.totals.cashedWithinHorizon);
// (6) higher churn ⇒ less recurring recognized.
const churny = S.projectMonthly({ ...a, churn: 0.3 });
ok("higher churn reduces recurringWithinHorizon", churny.totals.recurringWithinHorizon < p.totals.recurringWithinHorizon);
// (7) no recurring ⇒ recurringWithinHorizon == 0.
ok("no recurring ⇒ 0 recurring recognised", S.projectMonthly({ ...a, recurringMonthly: 0 }).totals.recurringWithinHorizon === 0);
// (8) stress (delay signings + delivery + churn) reduces cashed vs base.
const st = S.stressTest(a, { salesLagAdd: 2, deliveryLagAdd: 1, churnAdd: 0.1 });
ok("stress (delays + churn) ⇒ deltaCashed ≤ 0", st.deltaCashed <= 0 && st.stressed.cashedWithinHorizon <= st.base.cashedWithinHorizon);
// (9) honesty notes + reproducible.
ok("notes: cashed<signed + TARGET; reproducible", p.notes.some(x => /cashed-within-12-months is LOWER/.test(x)) && JSON.stringify(S.projectMonthly(a)) === JSON.stringify(p));
// (10) funnel exposed; gross margin from costRatio.
ok("funnel + grossMargin exposed", p.params.funnel === Math.round(0.18 * 0.5 * 0.4 * 100) / 100 && p.totals.grossMargin === Math.round(p.totals.cashedWithinHorizon * 0.7 * 100) / 100);

console.log(`\nREVENUE-SCHEDULE suite — ${pass} assertions passed. (monthly; lag-aware; cashed<signed; stress-tested)`);
