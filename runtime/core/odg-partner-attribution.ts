#!/usr/bin/env node
"use strict";
/*
 * V319 Addendum §6.12 — PARTNER REFERRAL ATTRIBUTION + FRAUD + PAYOUT ELIGIBILITY (closes the PARTIAL). PURE,
 * deterministic, in-memory, fail-closed. EXTENDS partner-channel (qualifyPartner/commission/attributeDeals) — it does
 * NOT reimplement commission economics. Adds the three missing pieces:
 *   - attributeReferral : link a conversion to a partner via referral CODE within an attribution WINDOW (else UNATTRIBUTED);
 *   - detectFraud       : self-referral / conversion-before-referral / duplicate flags;
 *   - payout            : eligibility = collected cash AND no fraud AND a computed commission; the PAYOUT itself is
 *                         ALWAYS OWNER_GATED (explicit owner authorization) — no commission is ever auto-paid.
 * Timestamps are caller-supplied (deterministic, no clock). No network/randomness. Commission amount via partner-channel.
 */
const PC = require("./partner-channel.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isPosInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v > 0; }
function freeze(o: any): any { return Object.freeze(o); }

/**
 * attributeReferral({ conversion:{ id, customerId?, tsMs, referralCode }, referrals:[{ partnerId, code, tsMs }], windowDays })
 * -> { ok, attributed, partnerId?, referral?, reason }. Fail-closed: no matching code / expired window / conversion
 * before the referral ⇒ UNATTRIBUTED (never guesses a partner).
 */
function attributeReferral(input: any): any {
  const i = isObj(input) ? input : {};
  const conv = isObj(i.conversion) ? i.conversion : null;
  const refs = Array.isArray(i.referrals) ? i.referrals.filter(isObj) : [];
  const windowDays = isPosInt(i.windowDays) ? i.windowDays : null;
  if (!conv || !isStr(conv.id) || typeof conv.tsMs !== "number" || !Number.isFinite(conv.tsMs)) return freeze({ ok: false, code: "BAD_CONVERSION" });
  if (windowDays === null) return freeze({ ok: false, code: "NO_WINDOW", detail: "attribution windowDays (positive int) required" });
  if (!isStr(conv.referralCode)) return freeze({ ok: true, attributed: false, reason: "NO_REFERRAL_CODE" });
  const windowMs = windowDays * 86400000;
  const match = refs.find((r: any) => isStr(r.code) && r.code === conv.referralCode && isStr(r.partnerId) && typeof r.tsMs === "number");
  if (!match) return freeze({ ok: true, attributed: false, reason: "NO_MATCHING_REFERRAL" });
  const dt = conv.tsMs - match.tsMs;
  if (dt < 0) return freeze({ ok: true, attributed: false, reason: "CONVERSION_BEFORE_REFERRAL", partnerId: null });
  if (dt > windowMs) return freeze({ ok: true, attributed: false, reason: "OUTSIDE_WINDOW", partnerId: null });
  return freeze({ ok: true, attributed: true, partnerId: match.partnerId, referral: freeze({ code: match.code, tsMs: match.tsMs }), reason: "ATTRIBUTED_IN_WINDOW" });
}

/** detectFraud({ conversion, referral, seenConversionIds? }) -> { fraud, flags }. */
function detectFraud(input: any): any {
  const i = isObj(input) ? input : {};
  const conv = isObj(i.conversion) ? i.conversion : {};
  const ref = isObj(i.referral) ? i.referral : {};
  const seen = Array.isArray(i.seenConversionIds) ? i.seenConversionIds : [];
  const flags: string[] = [];
  if (isStr(ref.partnerId) && isStr(conv.customerId) && ref.partnerId === conv.customerId) flags.push("SELF_REFERRAL");
  if (typeof conv.tsMs === "number" && typeof ref.tsMs === "number" && conv.tsMs < ref.tsMs) flags.push("CONVERSION_BEFORE_REFERRAL");
  if (isStr(conv.id) && seen.includes(conv.id)) flags.push("DUPLICATE_CONVERSION");
  return freeze({ fraud: flags.length > 0, flags: freeze(flags) });
}

/**
 * payout({ partnerId, dealValueMinor, pct, type?, basis?, collected, fraud, auth }) -> eligibility + OWNER_GATED payout.
 * Eligible ONLY when: collected===true AND fraud.fraud!==true AND a commission is computed. Payout requires explicit
 * owner authorization — a commission is NEVER auto-paid.
 */
function payout(input: any): any {
  const i = isObj(input) ? input : {};
  if (!isStr(i.partnerId)) return freeze({ ok: false, code: "NO_PARTNER" });
  const comm = PC.commission({ dealValue: i.dealValueMinor, pct: i.pct, type: i.type, basis: i.basis });
  if (!comm || comm.ok === false) return freeze({ ok: false, code: "BAD_COMMISSION", detail: comm && comm.reason });
  const collected = i.collected === true;
  const fraud = isObj(i.fraud) && i.fraud.fraud === true;
  const eligible = collected && !fraud;
  if (!eligible) return freeze({ ok: true, eligible: false, paid: false, commissionAmount: comm.commissionAmount, reason: !collected ? "NOT_COLLECTED (commission accrues on collected cash only)" : "FRAUD_FLAGGED", requiresOwnerAuthorization: true });
  const a = isObj(i.auth) ? i.auth : {};
  if (a.ownerAuthorized !== true || !isStr(a.owner)) return freeze({ ok: true, eligible: true, paid: false, commissionAmount: comm.commissionAmount, reason: "OWNER_GATED", detail: "eligible, but paying a commission requires explicit owner authorization; never auto-paid", requiresOwnerAuthorization: true });
  return freeze({ ok: true, eligible: true, paid: true, commissionAmount: comm.commissionAmount, owner: a.owner, requiresOwnerAuthorization: true, note: "commission paid under explicit owner authorization on collected cash with no fraud flags" });
}

const PARTNER_ATTRIBUTION_CONTRACT = Object.freeze({
  id: "V319-ADDENDUM-PARTNER-ATTRIBUTION",
  purpose: "§6.12 — referral-code attribution within a window + fraud detection + OWNER_GATED commission payout, over partner-channel economics",
  reuses: Object.freeze(["partner-channel.commission (COST on collected cash)", "partner-channel.attributeDeals (dealId dedup)"]),
  invariants: Object.freeze([
    "attribution requires a matching referral code WITHIN the window; no code / no match / outside window / conversion-before-referral ⇒ UNATTRIBUTED (never guesses)",
    "fraud flags: SELF_REFERRAL, CONVERSION_BEFORE_REFERRAL, DUPLICATE_CONVERSION",
    "payout eligibility = collected cash AND no fraud AND a computed commission; commission is NEVER auto-paid",
    "paying a commission is ALWAYS OWNER_GATED (explicit ownerAuthorized + owner); eligible≠paid",
    "commission amount via partner-channel.commission (no reimplementation); PURE/deterministic (caller tsMs); no clock/net/rng",
  ]),
});

module.exports = { attributeReferral, detectFraud, payout, PARTNER_ATTRIBUTION_CONTRACT };
export {};
