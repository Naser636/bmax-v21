#!/usr/bin/env node
"use strict";
/* V319 Addendum §6.12 — tests for odg-partner-attribution (referral-code window attribution, fraud, OWNER_GATED payout). PURE. */
const A = require("./odg-partner-attribution.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const T0 = 1_700_000_000_000;
const DAY = 86400000;
const referrals = [{ partnerId: "P1", code: "REF-P1", tsMs: T0 }];

function main(): void {
  // attribution: in-window match
  const inWin = A.attributeReferral({ conversion: { id: "c1", customerId: "cust1", tsMs: T0 + 10 * DAY, referralCode: "REF-P1" }, referrals, windowDays: 30 });
  check("in-window code match ⇒ ATTRIBUTED to P1", inWin.ok && inWin.attributed === true && inWin.partnerId === "P1");
  // outside window
  const outWin = A.attributeReferral({ conversion: { id: "c2", tsMs: T0 + 40 * DAY, referralCode: "REF-P1" }, referrals, windowDays: 30 });
  check("outside window ⇒ UNATTRIBUTED (OUTSIDE_WINDOW)", outWin.attributed === false && outWin.reason === "OUTSIDE_WINDOW");
  // conversion before referral
  const before = A.attributeReferral({ conversion: { id: "c3", tsMs: T0 - 1, referralCode: "REF-P1" }, referrals, windowDays: 30 });
  check("conversion before referral ⇒ UNATTRIBUTED", before.attributed === false && before.reason === "CONVERSION_BEFORE_REFERRAL");
  // no code / no match
  check("no referral code ⇒ UNATTRIBUTED (NO_REFERRAL_CODE)", A.attributeReferral({ conversion: { id: "c4", tsMs: T0 + DAY }, referrals, windowDays: 30 }).reason === "NO_REFERRAL_CODE");
  check("unknown code ⇒ UNATTRIBUTED (NO_MATCHING_REFERRAL)", A.attributeReferral({ conversion: { id: "c5", tsMs: T0 + DAY, referralCode: "REF-ZZ" }, referrals, windowDays: 30 }).reason === "NO_MATCHING_REFERRAL");
  // fail-closed inputs
  check("bad conversion ⇒ BAD_CONVERSION", A.attributeReferral({ conversion: {}, referrals, windowDays: 30 }).code === "BAD_CONVERSION");
  check("no window ⇒ NO_WINDOW", A.attributeReferral({ conversion: { id: "c", tsMs: T0 }, referrals }).code === "NO_WINDOW");

  // fraud
  check("self-referral ⇒ fraud", A.detectFraud({ conversion: { id: "c", customerId: "P1", tsMs: T0 + DAY }, referral: { partnerId: "P1", tsMs: T0 } }).flags.includes("SELF_REFERRAL"));
  check("duplicate conversion ⇒ fraud", A.detectFraud({ conversion: { id: "c1", customerId: "x", tsMs: T0 + DAY }, referral: { partnerId: "P1", tsMs: T0 }, seenConversionIds: ["c1"] }).flags.includes("DUPLICATE_CONVERSION"));
  check("clean ⇒ no fraud", A.detectFraud({ conversion: { id: "c9", customerId: "cust", tsMs: T0 + DAY }, referral: { partnerId: "P1", tsMs: T0 } }).fraud === false);

  // payout
  const comm = { dealValueMinor: 100000, pct: 0.1, type: "referral", basis: "collected" };
  check("not collected ⇒ eligible false (accrues on collected cash)", A.payout(Object.assign({ partnerId: "P1", collected: false, fraud: { fraud: false } }, comm)).eligible === false);
  check("fraud flagged ⇒ eligible false", A.payout(Object.assign({ partnerId: "P1", collected: true, fraud: { fraud: true } }, comm)).reason === "FRAUD_FLAGGED");
  const gated = A.payout(Object.assign({ partnerId: "P1", collected: true, fraud: { fraud: false } }, comm));
  check("collected+no-fraud, no owner auth ⇒ OWNER_GATED (eligible, NOT paid)", gated.eligible === true && gated.paid === false && gated.reason === "OWNER_GATED");
  check("truthy-not-true owner ⇒ OWNER_GATED", A.payout(Object.assign({ partnerId: "P1", collected: true, fraud: { fraud: false }, auth: { ownerAuthorized: 1, owner: "x" } }, comm)).paid === false);
  const paid = A.payout(Object.assign({ partnerId: "P1", collected: true, fraud: { fraud: false }, auth: { ownerAuthorized: true, owner: "akabi" } }, comm));
  check("owner-authorized + collected + no-fraud ⇒ PAID, amount via partner-channel (10000)", paid.paid === true && paid.commissionAmount === 10000 && paid.owner === "akabi");
  check("bad commission economics ⇒ BAD_COMMISSION", A.payout({ partnerId: "P1", dealValueMinor: -5, pct: 0.1, collected: true, fraud: { fraud: false } }).code === "BAD_COMMISSION");
  check("no partner ⇒ NO_PARTNER", A.payout(Object.assign({ collected: true, fraud: { fraud: false } }, comm)).code === "NO_PARTNER");
  check("requiresOwnerAuthorization always present (eligible AND not)", A.payout(Object.assign({ partnerId: "P1", collected: false, fraud: { fraud: false } }, comm)).requiresOwnerAuthorization === true && gated.requiresOwnerAuthorization === true);

  // determinism + frozen
  check("deterministic", A.attributeReferral({ conversion: { id: "c1", tsMs: T0 + 10 * DAY, referralCode: "REF-P1" }, referrals, windowDays: 30 }).partnerId === "P1");
  check("frozen", Object.isFrozen(inWin) && Object.isFrozen(paid));

  check("contract: window attribution, fraud flags, OWNER_GATED payout, composes partner-channel", A.PARTNER_ATTRIBUTION_CONTRACT.invariants.some((s: string) => /OWNER_GATED/.test(s)) && A.PARTNER_ATTRIBUTION_CONTRACT.invariants.some((s: string) => /never guesses/.test(s)) && A.PARTNER_ATTRIBUTION_CONTRACT.reuses.length === 2);

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-partner-attribution (§6.12: referral-code window attribution [never guesses]; fraud flags self-referral/before/duplicate; payout eligible only on collected+no-fraud, ALWAYS owner-gated [eligible≠paid]; commission via partner-channel; deterministic)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
