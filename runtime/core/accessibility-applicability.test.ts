#!/usr/bin/env node
"use strict";
/* V146 MÉTIER 5 — EAA/RGAA applicability correction. Source: EAA Art. 4(5) + EU Rec. 2003/361/EC + FR C. conso. L.412-13
 * (research: microenterprise SERVICE exemption = <10 employees AND turnover-OR-balance-sheet ≤ 2 M€; products not covered).
 * Locks the directive's edge cases and that the WRONG simplified rule (">10 OR >2M€") is NOT used. */
const A = require("./accessibility-applicability.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const svc = (over: any) => Object.assign({ role: "SERVICE_PROVIDER", serviceInScope: true }, over);

function main() {
  // < 10 employees AND turnover ≤ 2M€ ⇒ EXEMPT (microenterprise service).
  check("<10 emp + turnover ≤2M€ ⇒ EXEMPT_MICROENTERPRISE_SERVICE", A.determineObligation(svc({ employees: 5, turnoverEur: 1_000_000 })).obligation === "EXEMPT_MICROENTERPRISE_SERVICE");
  // < 10 employees AND balance-sheet ≤ 2M€ (turnover high/unknown) ⇒ EXEMPT (OR on the financial criterion).
  check("<10 emp + balance-sheet ≤2M€ (turnover 5M) ⇒ EXEMPT (financial OR)", A.determineObligation(svc({ employees: 8, turnoverEur: 5_000_000, balanceSheetEur: 1_500_000 })).obligation === "EXEMPT_MICROENTERPRISE_SERVICE");
  check("<10 emp + balance-sheet ≤2M€ (turnover unknown) ⇒ EXEMPT", A.determineObligation(svc({ employees: 8, balanceSheetEur: 1_500_000 })).obligation === "EXEMPT_MICROENTERPRISE_SERVICE");

  // ≥ 10 employees ⇒ OBLIGATED (headcount fails the microenterprise test regardless of finances).
  check("≥10 employees ⇒ OBLIGATED", A.determineObligation(svc({ employees: 10, turnoverEur: 500_000 })).obligation === "OBLIGATED");
  check("12 employees + tiny turnover ⇒ OBLIGATED (not a microenterprise)", A.determineObligation(svc({ employees: 12, turnoverEur: 100_000, balanceSheetEur: 100_000 })).obligation === "OBLIGATED");

  // < 10 employees BUT both financial criteria exceeded ⇒ OBLIGATED.
  check("<10 emp but turnover>2M AND balance>2M ⇒ OBLIGATED", A.determineObligation(svc({ employees: 6, turnoverEur: 3_000_000, balanceSheetEur: 3_000_000 })).obligation === "OBLIGATED");

  // service not in scope ⇒ NOT_IN_SCOPE (never sell an obligation to an unconcerned entity).
  check("service not in scope ⇒ NOT_IN_SCOPE", A.determineObligation(svc({ employees: 5, turnoverEur: 1_000_000, serviceInScope: false })).obligation === "NOT_IN_SCOPE");

  // PRODUCT operator ⇒ OBLIGATED (microenterprise service exemption does NOT cover products).
  check("product operator (even if micro) ⇒ OBLIGATED (exemption is service-only)", A.determineObligation({ role: "PRODUCT_OPERATOR", employees: 3, turnoverEur: 100_000 }).obligation === "OBLIGATED");
  check("BOTH products+services (micro) ⇒ OBLIGATED for products", A.determineObligation({ role: "BOTH", employees: 3, turnoverEur: 100_000 }).obligation === "OBLIGATED");

  // unknown headcount or financials ⇒ NEEDS_DETERMINATION (fail-closed, never an assumed obligation).
  check("unknown employees ⇒ NEEDS_DETERMINATION (fail-closed)", A.determineObligation(svc({ turnoverEur: 1_000_000 })).needsDetermination === true);
  check("unknown financials ⇒ NEEDS_DETERMINATION (fail-closed)", A.determineObligation(svc({ employees: 5 })).needsDetermination === true);
  check("unknown role ⇒ NEEDS_DETERMINATION", A.determineObligation({ employees: 5, turnoverEur: 1 }).obligation === "NEEDS_DETERMINATION");
  check("garbage ⇒ NEEDS_DETERMINATION, no throw", A.determineObligation(null).needsDetermination === true);

  // the WRONG V145 rule must NOT be used: a service micro with turnover just over 2M but balance ≤2M stays EXEMPT (not obligated).
  check("corrects V145: turnover 2.5M but balance ≤2M + <10 emp ⇒ EXEMPT (not the naive >2M⇒obligated)", A.determineObligation(svc({ employees: 4, turnoverEur: 2_500_000, balanceSheetEur: 1_000_000 })).obligation === "EXEMPT_MICROENTERPRISE_SERVICE");

  // every verdict cites its source + is honest about not being legal advice / certification.
  check("verdict cites source + is not legal advice/certification", /EAA Art. 4\(5\)/.test(A.determineObligation(svc({ employees: 5, turnoverEur: 1 })).source) && /NOT legal advice/.test(A.determineObligation(svc({ employees: 5, turnoverEur: 1 })).note));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — EAA/RGAA applicability (micro service exemption = <10 emp AND turnover-OR-balance ≤2M€; products not covered; unknown ⇒ NEEDS_DETERMINATION; V145 over-simplification corrected)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
