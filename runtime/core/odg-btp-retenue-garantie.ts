#!/usr/bin/env node
"use strict";
/*
 * BTP RETENUE DE GARANTIE (guarantee retention) — withholding per situation + deterministic release state.
 * PURE, deterministic, fail-closed, integer minor units, clock-free. Composes odg-gregorian-calendar.
 *
 * THE GAP (reconciled): odg-btp-billing-engine carries `retentionRate` only as a PASSTHROUGH field (never applied);
 * odg-btp-invoice-schedule splits the selling value into milestone lines but computes NO retenue and NO net-to-pay.
 * Nothing withholds the retenue de garantie on a situation de travaux, accumulates it, or schedules its release.
 * This does — the missing project-to-cash step in the BTP billing chain.
 *
 * Honesty: the retained amount is a WITHHELD-PER-CONTRACT figure, NEVER a realized or collected payment. Release is
 * OWNER/CONTRACT-GATED (reserves lifted AND the warranty delay elapsed) — NEVER automatic. The retention RATE and the
 * warranty DÉLAI are CALLER-SUPPLIED: the common French retenue légale 5% / 1-year garantie de parfait achèvement are
 * domain hints, NEVER hardcoded as legal truth — this module computes ARITHMETIC, not legal compliance. A caution
 * bancaire substituted for the retenue ⇒ nothing is withheld (disclosed). Cumulative = previous + this (no
 * double-count). No network/clock/randomness (dates are caller-supplied).
 */

const CAL = require("./odg-gregorian-calendar.js") as {
  isValidDate: (y: any, m: any, d: any) => boolean;
  addDays: (y: any, m: any, d: any, n: any) => any;
  daysBetween: (a: any, b: any) => any;
};

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function pad2(n: number): string { return String(n).padStart(2, "0"); }
function parseISODate(s: any): { y: number; m: number; d: number } | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  return CAL.isValidDate(y, mo, d) ? { y, m: mo, d } : null;
}
function fmtISO(dt: { y: number; m: number; d: number }): string { return `${dt.y}-${pad2(dt.m)}-${pad2(dt.d)}`; }

/**
 * withholdOnSituation(input) -> withheld retenue on ONE situation + running retained balance, or a typed refusal.
 * retainedThis = round(gross × rate); netToPay = gross − retainedThis; cumulative = previouslyRetained + retainedThis.
 * cautionSubstituted:true ⇒ retainedThis 0. FAIL-CLOSED: missing/out-of-range rate, bad gross/previous ⇒ refusal.
 */
function withholdOnSituation(input: any): any {
  if (!isObj(input)) return freeze({ ok: false, code: "BAD_INPUT", detail: "input must be an object" });
  const gross = input.grossSituationHTMinor;
  if (!isNonNegInt(gross)) return freeze({ ok: false, code: "BAD_GROSS", detail: "grossSituationHTMinor must be a non-negative integer (minor units)" });
  const prev = input.previouslyRetainedMinor === undefined ? 0 : input.previouslyRetainedMinor;
  if (!isNonNegInt(prev)) return freeze({ ok: false, code: "BAD_PREVIOUS", detail: "previouslyRetainedMinor, if given, must be a non-negative integer (minor units)" });
  const caution = input.cautionSubstituted === true;

  let retainedThis: number;
  if (caution) {
    retainedThis = 0;
  } else {
    const rate = input.retentionRate;
    if (rate === undefined || rate === null) return freeze({ ok: false, code: "NO_RATE", detail: "retentionRate (0..1) must be caller-supplied — the 5% retenue légale is not assumed" });
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 1) return freeze({ ok: false, code: "BAD_RATE", detail: "retentionRate must be a finite number in [0,1]" });
    retainedThis = Math.round(gross * rate);
  }
  return freeze({
    ok: true,
    chantierId: typeof input.chantierId === "string" ? input.chantierId : null,
    situationRef: typeof input.situationRef === "string" ? input.situationRef : null,
    grossSituationHTMinor: gross,
    retainedThisMinor: retainedThis,
    netToPayHTMinor: gross - retainedThis,
    cumulativeRetainedMinor: prev + retainedThis,
    cautionSubstituted: caution,
    note: caution
      ? "caution bancaire substitutes the retenue — nothing withheld on this situation (the guarantee is carried by the caution, not a cash withholding)"
      : "retainedThis = round(gross × caller-supplied rate); cumulative = previous + this (no double-count). The retained amount is WITHHELD per contract — NOT a collected payment. Rate is caller-supplied, not a legal determination.",
  });
}

/**
 * releaseState(input) -> deterministic release date + releasable amount, gated on reserves + warranty delay.
 * releaseDate = receptionDate + warrantyPeriodDays (via odg-gregorian-calendar). status:
 *   BLOCKED_RESERVES — reserves not lifted (owner/contract fact) ⇒ releasable 0.
 *   PENDING_DELAY    — reserves lifted but the warranty delay has not (provably) elapsed, OR asOfDate not supplied
 *                      (cannot confirm the delay elapsed — fail-closed) ⇒ releasable 0.
 *   RELEASABLE       — reserves lifted AND asOfDate ≥ releaseDate ⇒ releasable = cumulativeRetained.
 * FAIL-CLOSED: bad reception date / warranty / cumulative ⇒ refusal. Release is NEVER automatic.
 */
function releaseState(input: any): any {
  if (!isObj(input)) return freeze({ ok: false, code: "BAD_INPUT", detail: "input must be an object" });
  const reception = parseISODate(input.receptionDate);
  if (!reception) return freeze({ ok: false, code: "BAD_RECEPTION_DATE", detail: "receptionDate must be a valid ISO date (YYYY-MM-DD)" });
  const warranty = input.warrantyPeriodDays;
  if (!(typeof warranty === "number" && Number.isSafeInteger(warranty) && warranty > 0)) return freeze({ ok: false, code: "BAD_WARRANTY", detail: "warrantyPeriodDays must be a positive integer (caller-supplied; 1-year garantie is not assumed)" });
  const cumulative = input.cumulativeRetainedMinor;
  if (!isNonNegInt(cumulative)) return freeze({ ok: false, code: "BAD_CUMULATIVE", detail: "cumulativeRetainedMinor must be a non-negative integer (minor units)" });

  const rel = CAL.addDays(reception.y, reception.m, reception.d, warranty);
  const releaseDate = fmtISO({ y: rel.y, m: rel.m, d: rel.d });

  let status: string;
  let releasableMinor = 0;
  let note: string;
  if (input.reservesLifted !== true) {
    status = "BLOCKED_RESERVES";
    note = "reserves not lifted (levée des réserves) — nothing releasable (owner/contract fact; release is never automatic)";
  } else {
    const asOf = parseISODate(input.asOfDate);
    if (!asOf) {
      status = "PENDING_DELAY";
      note = "reserves lifted but asOfDate not supplied / invalid — cannot confirm the warranty delay elapsed; withheld (fail-closed)";
    } else {
      const between = CAL.daysBetween({ y: rel.y, m: rel.m, d: rel.d }, asOf); // days from releaseDate to asOf
      const elapsed = between && between.ok === true && between.days >= 0;     // asOf on/after releaseDate
      if (elapsed) { status = "RELEASABLE"; releasableMinor = cumulative; note = "reserves lifted AND the warranty delay has elapsed (asOfDate ≥ releaseDate) — the retained balance is RELEASABLE per contract (a release instruction, not a collected payment)"; }
      else { status = "PENDING_DELAY"; note = "reserves lifted but the warranty delay has not yet elapsed (asOfDate < releaseDate) — withheld until the délai de garantie"; }
    }
  }
  return freeze({ ok: true, releaseDate, releasableMinor, status, cumulativeRetainedMinor: cumulative, reservesLifted: input.reservesLifted === true, note });
}

const RETENUE_GARANTIE_CONTRACT = Object.freeze({
  id: "BTP-RETENUE-GARANTIE",
  purpose: "compute the retenue de garantie withheld on a situation de travaux (+ running balance) and its owner/contract-gated release — the project-to-cash step billing-engine (passthrough rate only) and invoice-schedule (no retenue) lack",
  reuses: Object.freeze(["odg-gregorian-calendar.addDays/daysBetween (release date — not reimplemented)"]),
  invariants: Object.freeze([
    "the retained amount is WITHHELD per contract — NEVER a realized or collected payment; netToPay = gross − retainedThis",
    "the retention RATE and warranty DÉLAI are CALLER-SUPPLIED — the French retenue légale 5% / 1-year garantie are hints, NEVER hardcoded as legal truth; this computes ARITHMETIC, not legal compliance",
    "release is OWNER/CONTRACT-GATED (reserves lifted AND the warranty delay elapsed) and NEVER automatic; absence of an asOfDate ⇒ PENDING_DELAY (fail-closed), never released",
    "a caution bancaire substituted for the retenue ⇒ nothing withheld (disclosed); cumulative = previous + this (no double-count); integer minor units",
    "fail-closed: missing/out-of-range rate, bad gross/previous/date/warranty ⇒ typed refusal; PURE/deterministic/frozen/clock-free",
  ]),
});

module.exports = { withholdOnSituation, releaseState, RETENUE_GARANTIE_CONTRACT };
export {};
