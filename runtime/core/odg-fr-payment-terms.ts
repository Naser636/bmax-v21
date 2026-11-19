#!/usr/bin/env node
"use strict";
/*
 * FRENCH PAYMENT TERMS (LME) + LATE-PAYMENT PENALTIES. PURE, deterministic, integer minor-unit, fail-closed.
 *
 * THE GAP (reconciled): odg-btp-billing-engine.paymentTerms structures contractual MILESTONES (percent/amount/retention);
 * it does NOT check the LME legal-ceiling, derive a due day, or compute late-payment penalties. This adds those, for the
 * invoice / supplier-commitment stack.
 *
 * THE HONESTY BOUNDARY (same as the VAT module — compute given inputs, do NOT make the legal determination):
 *  - checkTermCompliance checks the GENERAL LME ceiling (60 days, or 45 days end-of-month; 30 days if nothing agreed) —
 *    specific sectors and exemptions have DIFFERENT maxima; this is a general-ceiling check, NOT a definitive legal verdict;
 *  - latePenalty computes the FORMULA result given a CALLER-supplied annual rate + daysLate — the law sets a MINIMUM rate
 *    (ECB rate + 10 points, or ≥ 3× the legal interest rate if contractual), but this module does NOT determine the
 *    applicable rate (the caller does, from the contract/law) and it is NOT legal advice / not a claim of enforceability;
 *  - the €40 (4000 centimes) recovery indemnity is the STATUTORY fixed amount per late invoice. No network/clock/randomness.
 */

function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function freeze(o: any): any { return Object.freeze(o); }

const LME = Object.freeze({
  DEFAULT_DAYS: 30,            // no agreement ⇒ 30 days from receipt (Art. L441-10 Code de commerce)
  MAX_DAYS: 60,               // general contractual ceiling: 60 days from invoice date
  MAX_DAYS_EOM: 45,           // alternative: 45 days end-of-month
  INDEMNITY_MINOR: 4000,      // €40 fixed recovery indemnity per late invoice (centimes)
});

/** checkTermCompliance(termDays) -> { ok, termDays, compliant, generalMaxDays, reason }. General LME ceiling only (not a legal verdict). */
function checkTermCompliance(termDays: any): any {
  if (!isNonNegInt(termDays)) return freeze({ ok: false, code: "BAD_TERM", detail: "termDays must be a non-negative integer (days)" });
  const compliant = termDays <= LME.MAX_DAYS;
  return freeze({ ok: true, termDays, compliant, generalMaxDays: LME.MAX_DAYS,
    reason: compliant ? `≤ general LME ceiling (${LME.MAX_DAYS} days)` : `exceeds the general LME ceiling of ${LME.MAX_DAYS} days`,
    note: "GENERAL ceiling check only — specific sectors/exemptions have different maxima; NOT a definitive legal-compliance verdict. (45-day end-of-month alternative is a separate regime not evaluated here.)" });
}

/** dueDay(issueDay, termDays) -> { ok, issueDay, termDays, dueDay }. Integer day-index arithmetic (caller's scale; NO clock). */
function dueDay(issueDay: any, termDays: any): any {
  if (!isNonNegInt(issueDay)) return freeze({ ok: false, code: "BAD_ISSUE_DAY" });
  if (!isNonNegInt(termDays)) return freeze({ ok: false, code: "BAD_TERM" });
  return freeze({ ok: true, issueDay, termDays, dueDay: issueDay + termDays,
    note: "due day = issue day + term days on the caller's integer day-index scale (NO clock). The 45-day END-OF-MONTH variant needs a calendar and is NOT computed here." });
}

/**
 * latePenalty({ outstandingMinor, daysLate, annualRateBps, applyIndemnity? }) -> penalty + statutory indemnity + total.
 * penalty = round(outstanding · annualRateBps/10000 · daysLate / 365). The rate is CALLER-supplied (not determined here).
 */
function latePenalty(input: any): any {
  const i = input !== null && typeof input === "object" ? input : {};
  if (!isNonNegInt(i.outstandingMinor)) return freeze({ ok: false, code: "BAD_OUTSTANDING", detail: "outstandingMinor must be a non-negative safe integer (centimes)" });
  if (!isNonNegInt(i.daysLate)) return freeze({ ok: false, code: "BAD_DAYS_LATE", detail: "daysLate must be a non-negative integer" });
  if (!isNonNegInt(i.annualRateBps)) return freeze({ ok: false, code: "BAD_RATE", detail: "annualRateBps must be a non-negative integer (basis points)" });
  // numerator = outstanding · annualRateBps · daysLate ; guard each product against safe-integer overflow
  const p1 = i.outstandingMinor * i.annualRateBps;
  if (!Number.isSafeInteger(p1)) return freeze({ ok: false, code: "OVERFLOW" });
  const numerator = p1 * i.daysLate;
  if (!Number.isSafeInteger(numerator)) return freeze({ ok: false, code: "OVERFLOW" });
  const penaltyMinor = Math.round(numerator / (10000 * 365));
  const applyIndemnity = i.applyIndemnity !== false; // default true
  const indemnityMinor = applyIndemnity && i.daysLate > 0 ? LME.INDEMNITY_MINOR : 0;
  return freeze({ ok: true, outstandingMinor: i.outstandingMinor, daysLate: i.daysLate, annualRateBps: i.annualRateBps,
    penaltyMinor, indemnityMinor, totalDueMinor: i.outstandingMinor + penaltyMinor + indemnityMinor,
    note: "penalty = outstanding · (annualRate) · daysLate/365 at the CALLER-supplied rate (the law sets a MINIMUM rate the caller applies; not determined here). €40 statutory recovery indemnity when late. NOT legal advice / not a claim of enforceability." });
}

const FR_PAYMENT_TERMS_CONTRACT = Object.freeze({
  id: "FR-PAYMENT-TERMS",
  purpose: "French LME payment-term ceiling check + due-day + late-payment penalty (pénalités de retard) + €40 statutory indemnity — the gap next to billing-engine's milestone terms",
  reuses: Object.freeze(["integer minor-unit / day-index conventions; composes with odg-btp-invoice-schedule / supplier-commitment"]),
  invariants: Object.freeze([
    "checkTermCompliance = GENERAL LME ceiling (60 days) only — sectors/exemptions differ; NOT a definitive legal verdict",
    "latePenalty computes the FORMULA result at a CALLER-supplied rate — the law's MINIMUM rate (ECB+10pts / ≥3× legal interest) is NOT determined here; NOT legal advice / not a claim of enforceability",
    "€40 (4000 centimes) is the STATUTORY fixed recovery indemnity per late invoice; applied only when daysLate>0",
    "integer day-indices (NO clock); the 45-day end-of-month variant needs a calendar and is NOT computed",
    "fail-closed: negative/non-integer inputs / overflow ⇒ typed refusal; PURE/deterministic; no network/clock/randomness",
  ]),
});

module.exports = { LME, checkTermCompliance, dueDay, latePenalty, FR_PAYMENT_TERMS_CONTRACT };
export {};
