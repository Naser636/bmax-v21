#!/usr/bin/env node
"use strict";
/*
 * V146 MÉTIER 5 (digital accessibility) — EAA / RGAA OBLIGATION APPLICABILITY. PURE, deterministic, fail-closed. Corrects the
 * V145 over-simplification ("> 10 employees OR > 2 M€ turnover ⇒ obligated"), which was WRONG. The real rule (European
 * Accessibility Act Art. 4(5); EU Recommendation 2003/361/EC microenterprise definition; FR Code de la consommation
 * L.412-13):
 *   - The MICROENTERPRISE exemption applies ONLY to SERVICE providers that are microenterprises.
 *   - A microenterprise = fewer than 10 employees AND (annual turnover ≤ 2 M€ OR balance-sheet total ≤ 2 M€).
 *     (The financial side is an OR of two alternative criteria — NOT turnover alone.)
 *   - For PRODUCTS (manufacturer/importer/distributor), the service-microenterprise exemption does NOT apply ⇒ obligated.
 *   - Exemption disappears as soon as EITHER threshold is crossed.
 * It NEVER certifies conformance and NEVER sells an obligation to an organisation that is not concerned: unknown headcount/
 * financials ⇒ NEEDS_DETERMINATION (fail-closed), not an assumed obligation. Sources must be cited + dated by the caller's
 * evidence; this module encodes the logic, not legal advice. Dual export.
 */
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v) && v >= 0; }
const EMP_THRESHOLD = 10;            // microenterprise: fewer than 10 employees
const FIN_THRESHOLD_EUR = 2_000_000; // and turnover OR balance-sheet ≤ 2 M€
const ROLES = Object.freeze(["SERVICE_PROVIDER", "PRODUCT_OPERATOR", "BOTH"]);

/** determineObligation(input) -> frozen verdict. input = { role, employees, turnoverEur, balanceSheetEur, serviceInScope }.
 * obligation: OBLIGATED | EXEMPT_MICROENTERPRISE_SERVICE | NOT_IN_SCOPE | NEEDS_DETERMINATION. Fail-closed on unknown data. */
function determineObligation(input: any): any {
  const i = isObj(input) ? input : {};
  const role = ROLES.includes(i.role) ? i.role : null;
  const source = "EAA Art. 4(5) + EU Rec. 2003/361/EC + FR C. conso. L.412-13";
  if (!role) return Object.freeze({ obligation: "NEEDS_DETERMINATION", needsDetermination: true, reason: "role unknown (SERVICE_PROVIDER / PRODUCT_OPERATOR / BOTH) — cannot determine (fail-closed)", source });

  // PRODUCTS: the microenterprise SERVICE exemption does not apply. (A BOTH entity cannot use it for its products.)
  if (role === "PRODUCT_OPERATOR" || role === "BOTH") {
    return Object.freeze({ obligation: "OBLIGATED", needsDetermination: false, isMicroenterprise: null, reason: "product operator (manufacturer/importer/distributor) — the microenterprise exemption applies only to SERVICES, not products", source, manualDetermination: "confirm the product/service categories actually in scope with the official text" });
  }

  // SERVICE_PROVIDER:
  if (i.serviceInScope === false) return Object.freeze({ obligation: "NOT_IN_SCOPE", needsDetermination: false, reason: "the service is not among the EAA-covered categories (sourced determination required)", source });
  // fail-closed: without headcount AND at least one financial figure, the microenterprise test cannot be evaluated.
  const empKnown = isNum(i.employees);
  const finKnown = isNum(i.turnoverEur) || isNum(i.balanceSheetEur);
  if (!empKnown || !finKnown) return Object.freeze({ obligation: "NEEDS_DETERMINATION", needsDetermination: true, reason: `insufficient data (employees=${empKnown ? i.employees : "?"}, financials=${finKnown ? "partial" : "unknown"}) — microenterprise test not evaluable (fail-closed, never assume obligation)`, source });

  const underEmp = i.employees < EMP_THRESHOLD;
  // financial alternative: EITHER criterion ≤ threshold qualifies (only known figures count; an unknown one does not disqualify).
  const finOk = (isNum(i.turnoverEur) && i.turnoverEur <= FIN_THRESHOLD_EUR) || (isNum(i.balanceSheetEur) && i.balanceSheetEur <= FIN_THRESHOLD_EUR);
  const isMicro = underEmp && finOk;
  return Object.freeze({
    obligation: isMicro ? "EXEMPT_MICROENTERPRISE_SERVICE" : "OBLIGATED",
    needsDetermination: false,
    isMicroenterprise: isMicro,
    reason: isMicro
      ? `microenterprise service provider (employees ${i.employees} < 10 AND turnover/balance-sheet ≤ 2 M€) ⇒ exempt from EAA service accessibility obligations`
      : `not a microenterprise service provider (${!underEmp ? "≥ 10 employees" : "neither turnover nor balance-sheet ≤ 2 M€"}) ⇒ obligated`,
    thresholds: { employees: EMP_THRESHOLD, financialEur: FIN_THRESHOLD_EUR, financialRule: "turnover ≤ 2 M€ OR balance-sheet ≤ 2 M€" },
    source,
    note: "encodes the applicability logic from the cited sources; NOT legal advice and NOT a conformance certification; a borderline case needs a sourced legal determination.",
  });
}

const ACCESSIBILITY_APPLICABILITY_CONTRACT = Object.freeze({
  id: "V146-ACCESSIBILITY-APPLICABILITY",
  reuses: ["(logic only — no new primitive)"],
  invariants: Object.freeze([
    "microenterprise SERVICE exemption = employees < 10 AND (turnover ≤ 2M€ OR balance-sheet ≤ 2M€) — financial is an OR",
    "the exemption does NOT apply to products (PRODUCT_OPERATOR / BOTH ⇒ obligated for products)",
    "unknown headcount or unknown financials ⇒ NEEDS_DETERMINATION (fail-closed; never an assumed obligation or exemption)",
    "never certifies conformance; never sells an obligation to an entity that is NOT_IN_SCOPE; cites its source",
  ]),
});
module.exports = { determineObligation, ROLES, EMP_THRESHOLD, FIN_THRESHOLD_EUR, ACCESSIBILITY_APPLICABILITY_CONTRACT };
export {};
