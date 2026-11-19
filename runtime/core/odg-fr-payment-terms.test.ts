#!/usr/bin/env node
"use strict";
/* Tests for odg-fr-payment-terms (LME ceiling + due-day + late penalty + €40 indemnity). PURE. Hand-verified. */
const P = require("./odg-fr-payment-terms.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // LME constants
  check("LME: default 30, max 60, EOM 45, indemnity €40 (4000c)", P.LME.DEFAULT_DAYS === 30 && P.LME.MAX_DAYS === 60 && P.LME.MAX_DAYS_EOM === 45 && P.LME.INDEMNITY_MINOR === 4000);

  // checkTermCompliance: ≤60 compliant; >60 not
  check("30 days compliant", P.checkTermCompliance(30).compliant === true);
  check("60 days compliant (ceiling)", P.checkTermCompliance(60).compliant === true);
  check("61 days NOT compliant (exceeds ceiling)", (() => { const r = P.checkTermCompliance(61); return r.compliant === false && /exceeds the general LME ceiling/.test(r.reason); })());
  check("compliance note disclaims definitive legal verdict", /NOT a definitive legal-compliance verdict/.test(P.checkTermCompliance(30).note));
  check("bad term ⇒ BAD_TERM", P.checkTermCompliance(-1).code === "BAD_TERM");

  // dueDay: integer day-index arithmetic
  check("dueDay(100,60) = 160", P.dueDay(100, 60).dueDay === 160);
  check("dueDay note flags EOM variant not computed", /END-OF-MONTH variant.*NOT computed/i.test(P.dueDay(100, 60).note));
  check("bad issue day ⇒ BAD_ISSUE_DAY", P.dueDay(-1, 60).code === "BAD_ISSUE_DAY");

  // latePenalty: outstanding 1200€, 30 days late, 10% annual ⇒ round(120000·0.10·30/365) = 986; + €40 indemnity
  const lp = P.latePenalty({ outstandingMinor: 120000, daysLate: 30, annualRateBps: 1000, applyIndemnity: true });
  check("penalty 986 (= round(120000·10%·30/365))", lp.penaltyMinor === 986);
  check("indemnity 4000 (€40), total 124986", lp.indemnityMinor === 4000 && lp.totalDueMinor === 124986);

  // not late ⇒ no penalty, no indemnity
  const onTime = P.latePenalty({ outstandingMinor: 120000, daysLate: 0, annualRateBps: 1000 });
  check("0 days late ⇒ penalty 0, indemnity 0, total = outstanding", onTime.penaltyMinor === 0 && onTime.indemnityMinor === 0 && onTime.totalDueMinor === 120000);

  // applyIndemnity:false ⇒ penalty still computed, indemnity suppressed
  const noInd = P.latePenalty({ outstandingMinor: 120000, daysLate: 30, annualRateBps: 1000, applyIndemnity: false });
  check("applyIndemnity:false ⇒ penalty 986, indemnity 0", noInd.penaltyMinor === 986 && noInd.indemnityMinor === 0);

  // penalty scales with daysLate (60 days ≈ 2× of 30 days penalty)
  check("penalty scales with daysLate", P.latePenalty({ outstandingMinor: 120000, daysLate: 60, annualRateBps: 1000 }).penaltyMinor === 1973);

  // rate is caller-supplied (note disclaims determination); default applyIndemnity true
  check("latePenalty note: caller-supplied rate, not legal advice, €40 statutory", /CALLER-supplied rate/.test(lp.note) && /NOT legal advice/.test(lp.note) && /€40 statutory recovery indemnity/.test(lp.note));
  check("applyIndemnity defaults true (omitted) when late", P.latePenalty({ outstandingMinor: 1000, daysLate: 5, annualRateBps: 1000 }).indemnityMinor === 4000);

  // fail-closed
  check("negative outstanding ⇒ BAD_OUTSTANDING", P.latePenalty({ outstandingMinor: -1, daysLate: 5, annualRateBps: 1000 }).code === "BAD_OUTSTANDING");
  check("float daysLate ⇒ BAD_DAYS_LATE", P.latePenalty({ outstandingMinor: 1000, daysLate: 5.5, annualRateBps: 1000 }).code === "BAD_DAYS_LATE");
  check("negative rate ⇒ BAD_RATE", P.latePenalty({ outstandingMinor: 1000, daysLate: 5, annualRateBps: -1 }).code === "BAD_RATE");
  check("overflow ⇒ OVERFLOW", P.latePenalty({ outstandingMinor: 900000000000, daysLate: 100000, annualRateBps: 1000 }).code === "OVERFLOW");

  // honesty + determinism + frozen + contract
  check("deterministic", JSON.stringify(P.latePenalty({ outstandingMinor: 120000, daysLate: 30, annualRateBps: 1000, applyIndemnity: true })) === JSON.stringify(lp));
  check("frozen", Object.isFrozen(lp) && Object.isFrozen(P.checkTermCompliance(30)));
  check("contract: general-ceiling-not-verdict, caller-rate-not-determined, €40-statutory, no-clock, fail-closed",
    P.FR_PAYMENT_TERMS_CONTRACT.invariants.some((s: string) => /NOT a definitive legal verdict/.test(s)) &&
    P.FR_PAYMENT_TERMS_CONTRACT.invariants.some((s: string) => /NOT determined here/.test(s)) &&
    P.FR_PAYMENT_TERMS_CONTRACT.invariants.some((s: string) => /STATUTORY fixed recovery indemnity/.test(s)) &&
    P.FR_PAYMENT_TERMS_CONTRACT.invariants.some((s: string) => /fail-closed/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-fr-payment-terms (LME: 30/60/45 + €40; checkTermCompliance ≤60 compliant / 61 not [general ceiling NOT a legal verdict]; dueDay integer day-index [EOM not computed]; latePenalty 986 @1200€/30d/10% + €40 indemnity = 124986, 0-days⇒0, scales with days, rate CALLER-supplied not determined; negative/float/overflow fail-closed; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
