#!/usr/bin/env node
"use strict";
/*
 * V174 Addendum-B (§2/§3/§4/§5/§8/§10 — 15-métier certification & readiness planner + 300-calendar-day plan). PURE,
 * deterministic, fail-closed. Recovers the CANONICAL 15 métier identities (profession-p*-reference modules) — not invented.
 *
 * Classifies each métier's market-entry requirement into the 4 directive categories (A legally-mandatory / B activity-
 * qualification / C voluntary-commercial / D not-required) AND the distinct requirementKind (§2: never confuse company-cert /
 * product-conformity / person-qualification / body-accreditation / regulatory-conformity). Computes a 300-calendar-day plan
 * distinguishing calendar-days / working-days / person-days / external-wait, and flags any requirement whose external audit/
 * decision timeline CANNOT fit 300 days — never shortening a regulatory delay.
 *
 * HONESTY (strict): NO certification is declared obtained (all statuses NOT_STARTED; CERTIFIED requires a real body decision).
 * NO fabricated evidence. External regulatory deadlines (e.g. CRA 2027) are reported as-is. This plans PREPARATION only.
 */

const STATUS = Object.freeze(["NOT_STARTED", "IN_PROGRESS", "READY_FOR_APPLICATION", "SUBMITTED", "CERTIFIED", "BLOCKED", "NOT_REQUIRED"]);
const CATEGORY = Object.freeze({ A: "A_LEGALLY_MANDATORY", B: "B_ACTIVITY_QUALIFICATION", C: "C_VOLUNTARY_COMMERCIAL", D: "D_NOT_REQUIRED" });
const KIND = Object.freeze(["COMPANY_CERT", "PRODUCT_CONFORMITY", "PERSON_QUALIFICATION", "BODY_ACCREDITATION", "REGULATORY_CONFORMITY", "NONE"]);

// Canonical 15 métiers (recovered from profession-p*-reference + P5/P8 module identities — NOT invented).
// requirements: the entry requirement(s) for commercializing an ODG *software/tooling* product in that métier (ODG sells
// tools, not regulated professional acts). externalWaitDays = typical body audit+decision wait (0 if self-declared).
const METIERS = Object.freeze([
  { id: "P1", name: "Fullstack / product engineering", category: CATEGORY.D, kind: "NONE", requirement: "none mandatory to sell software; ISO 27001 (C) raises enterprise trust", externalWaitDays: 0, prepDaysOdg: 5, prepDaysHuman: 3 },
  { id: "P2", name: "AI / ML", category: CATEGORY.C, kind: "COMPANY_CERT", requirement: "ISO/IEC 42001 (AI management) voluntary-commercial; EU AI Act conformity only if a HIGH-RISK system (scope-dependent → A if so)", externalWaitDays: 150, prepDaysOdg: 20, prepDaysHuman: 15 },
  { id: "P3", name: "Security / supply chain", category: CATEGORY.C, kind: "COMPANY_CERT", requirement: "ISO/IEC 27001 (C, strong market access); PASSI-type qualification (B) only if performing regulated security AUDIT acts", externalWaitDays: 180, prepDaysOdg: 25, prepDaysHuman: 20 },
  { id: "P4", name: "Data engineering", category: CATEGORY.A, kind: "REGULATORY_CONFORMITY", requirement: "GDPR conformity (A, mandatory for any personal-data processing) — not a body cert; ISO 27001 (C) complements", externalWaitDays: 0, prepDaysOdg: 15, prepDaysHuman: 12 },
  { id: "P5", name: "Cloud / DevOps / Platform", category: CATEGORY.C, kind: "COMPANY_CERT", requirement: "SOC 2 / ISO 27001 (C) for enterprise procurement; none legally mandatory", externalWaitDays: 150, prepDaysOdg: 15, prepDaysHuman: 10 },
  { id: "P6", name: "Eval / quality", category: CATEGORY.D, kind: "NONE", requirement: "none", externalWaitDays: 0, prepDaysOdg: 3, prepDaysHuman: 2 },
  { id: "P7", name: "SRE / reliability", category: CATEGORY.D, kind: "NONE", requirement: "none mandatory; SLAs contractual", externalWaitDays: 0, prepDaysOdg: 4, prepDaysHuman: 2 },
  { id: "P8", name: "API / integration", category: CATEGORY.D, kind: "NONE", requirement: "none", externalWaitDays: 0, prepDaysOdg: 4, prepDaysHuman: 2 },
  { id: "P9", name: "FinOps", category: CATEGORY.D, kind: "NONE", requirement: "none mandatory; FinOps-Certified-Platform (C) voluntary trust", externalWaitDays: 60, prepDaysOdg: 6, prepDaysHuman: 4 },
  { id: "P10", name: "Regulatory assurance", category: CATEGORY.C, kind: "COMPANY_CERT", requirement: "ODG supplies compliance TOOLING, not regulated advice; ISO 27001/42001 (C) raise trust; NO person-qualification if no regulated act is performed", externalWaitDays: 150, prepDaysOdg: 18, prepDaysHuman: 12 },
  { id: "P11", name: "Document intelligence", category: CATEGORY.A, kind: "REGULATORY_CONFORMITY", requirement: "GDPR conformity (A) when documents carry personal data", externalWaitDays: 0, prepDaysOdg: 8, prepDaysHuman: 5 },
  { id: "P12", name: "Streaming / realtime", category: CATEGORY.D, kind: "NONE", requirement: "none", externalWaitDays: 0, prepDaysOdg: 4, prepDaysHuman: 2 },
  { id: "P13", name: "AI infrastructure", category: CATEGORY.C, kind: "COMPANY_CERT", requirement: "ISO 27001 / SOC 2 (C) for enterprise; none legally mandatory", externalWaitDays: 150, prepDaysOdg: 12, prepDaysHuman: 8 },
  { id: "P14", name: "Developer experience", category: CATEGORY.D, kind: "NONE", requirement: "none", externalWaitDays: 0, prepDaysOdg: 3, prepDaysHuman: 2 },
  { id: "P15", name: "Workflow / orchestration", category: CATEGORY.D, kind: "NONE", requirement: "none", externalWaitDays: 0, prepDaysOdg: 4, prepDaysHuman: 2 },
]);

// Mutualizable certifications (§4 — never pay redundant certs): ISO 27001 covers P3/P4/P5/P10/P13; ISO 42001 covers P2/P10/P13;
// GDPR conformity is company-wide (covers P4/P11 + all personal-data). EAA + CRA are PRODUCT_CONFORMITY tied to the product, not the métier.
const MUTUALIZATION = Object.freeze([
  { cert: "ISO/IEC 27001", kind: "COMPANY_CERT", category: CATEGORY.C, covers: ["P3", "P4", "P5", "P10", "P13"], note: "one company cert unlocks 5 métiers — highest leverage" },
  { cert: "ISO/IEC 42001 (AI mgmt)", kind: "COMPANY_CERT", category: CATEGORY.C, covers: ["P2", "P10", "P13"], note: "AI-management cert across the AI métiers" },
  { cert: "GDPR conformity (company-wide)", kind: "REGULATORY_CONFORMITY", category: CATEGORY.A, covers: ["P4", "P11"], note: "mandatory for personal data; self-assessed + documented (no body decision)" },
  { cert: "CRA product conformity", kind: "PRODUCT_CONFORMITY", category: CATEGORY.A, covers: ["P1", "P3", "P5", "P13"], note: "per-PRODUCT, EU market placement; external deadline 2027-12-11 (BEYOND 300 days)" },
  { cert: "EAA accessibility conformity", kind: "PRODUCT_CONFORMITY", category: CATEGORY.A, covers: ["P1", "P11"], note: "per-PRODUCT; in force since 2025-06-28; self-declared + audit (no body decision)" },
]);

// 300-day capacity model (§5): calendar → working → person-days, with realistic deductions.
const CAL_DAYS = 300;
function capacity(people: number): any {
  const weekends = Math.round((CAL_DAYS / 7) * 2);           // ~86
  const holidays = Math.round((CAL_DAYS / 365) * 11);        // ~9 FR public holidays pro-rata
  const workingDays = CAL_DAYS - weekends - holidays;        // ~205
  const leaveAndAdminFactor = 0.78;                          // leave + admin + direction/sales overhead
  const personDays = Math.round(workingDays * people * leaveAndAdminFactor);
  return Object.freeze({ calendarDays: CAL_DAYS, workingDays, personDays, people, deductions: "weekends + ~9 holidays + 22% leave/admin/direction" });
}

/* plan(opts?) — the 300-day consolidated plan. Each métier: requirement category/kind, 3-point timeline (optimistic/central/
 * prudent incl. external wait), fits300, status (default NOT_STARTED). Aggregates prep person-days vs capacity. */
function plan(opts?: any): any {
  const people = opts && opts.people ? opts.people : 3;
  const cap = capacity(people);
  const rows = METIERS.map((m: any) => {
    const prepHuman = m.prepDaysHuman;
    // timelines in CALENDAR days = prep (parallelisable, ~working) + external audit/decision wait.
    const optimistic = Math.round(prepHuman * 1.6) + Math.round(m.externalWaitDays * 0.7);
    const central = Math.round(prepHuman * 2.2) + m.externalWaitDays;
    const prudent = Math.round(prepHuman * 3.2) + Math.round(m.externalWaitDays * 1.4);
    const fits300 = central <= CAL_DAYS;
    return Object.freeze({
      metier: m.id, name: m.name, category: m.category, requirementKind: m.kind, requirement: m.requirement,
      status: "NOT_STARTED",
      prepDaysOdg: m.prepDaysOdg, prepDaysHuman: prepHuman, externalWaitDays: m.externalWaitDays,
      timelineCalendarDays: Object.freeze({ optimistic, central, prudent }),
      fits300CalendarDays: fits300,
      canStartWithoutCertification: m.category === CATEGORY.D || (m.category === CATEGORY.A && m.externalWaitDays === 0),
    });
  });
  const totalPrepHuman = rows.reduce((a: number, r: any) => a + r.prepDaysHuman, 0);
  const notFitting = rows.filter((r: any) => !r.fits300CalendarDays);
  return Object.freeze({
    capacity: cap,
    metiers: Object.freeze(rows),
    mutualization: MUTUALIZATION,
    counts: Object.freeze({
      A_legallyMandatory: rows.filter((r: any) => r.category === CATEGORY.A).length,
      B_activityQualification: rows.filter((r: any) => r.category === CATEGORY.B).length,
      C_voluntaryCommercial: rows.filter((r: any) => r.category === CATEGORY.C).length,
      D_notRequired: rows.filter((r: any) => r.category === CATEGORY.D).length,
      canStartNowWithoutCert: rows.filter((r: any) => r.canStartWithoutCertification).length,
    }),
    totalPrepHumanDays: totalPrepHuman,
    prepFitsCapacity: totalPrepHuman <= cap.personDays,
    metiersNotFitting300: Object.freeze(notFitting.map((r: any) => r.metier)),
    criticalFirstCerts: Object.freeze(["ISO/IEC 27001 (unlocks P3/P4/P5/P10/P13 — highest leverage, start FIRST)", "GDPR conformity (company-wide, A, no external decision — fast)", "EAA + CRA product conformity (per-product; CRA external deadline 2027-12-11 is BEYOND 300 days — honest)"]),
    note: "PREPARATION plan only. NO certification declared obtained (all NOT_STARTED; CERTIFIED needs a real body decision). External regulatory delays (e.g. CRA 2027-12-11) are reported as-is, NEVER shortened. 300-day target TESTED per métier, not imposed.",
  });
}

const METIER_CERTIFICATION_CONTRACT = Object.freeze({
  id: "V174B-METIER-CERTIFICATION-PLANNER",
  purpose: "Addendum-B §2–§10 — 15-métier certification/readiness classification + 300-calendar-day preparation plan, with mutualization + honest external-delay handling",
  canonicalMetiers: "recovered from profession-p*-reference + P5(Cloud/DevOps)/P8(API) module identities — NOT invented",
  invariants: Object.freeze([
    "4 categories (A legally-mandatory / B activity-qualification / C voluntary-commercial / D not-required) + distinct requirementKind (never confuse company-cert/product-conformity/person-qualification/body-accreditation/regulatory-conformity)",
    "NO certification declared obtained — all statuses NOT_STARTED; CERTIFIED requires a real competent-body decision; NO fabricated evidence",
    "external regulatory/audit delays reported as-is (e.g. CRA 2027-12-11 is BEYOND 300 days) — NEVER shortened to hit the target",
    "mutualization identified (ISO 27001 unlocks 5 métiers) to avoid redundant certs; métiers with NO required cert can start immediately",
    "300-day capacity distinguishes calendar/working/person-days/external-wait; deterministic + fail-closed",
  ]),
});
module.exports = { METIERS, MUTUALIZATION, STATUS, CATEGORY, KIND, capacity, plan, METIER_CERTIFICATION_CONTRACT };
export {};
