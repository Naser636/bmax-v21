#!/usr/bin/env node
"use strict";

/*
 * V268 — PHASE 0 (§44) reconciliation of the owner-authored "ODG BTP INTERNATIONAL — MASTER GROWTH & WORLD-CLASS ROADMAP
 * V2.0" additive strategic extension, against existing V12.4 work. READ-ONLY, deterministic. This is the Phase-0 deliverable
 * the roadmap itself mandates: "reconcile with V12.4, verify existing capabilities, identify duplicates, map dependencies →
 * canonical additive integration PROPOSAL + verified mission graph" — it does NOT mutate any canonical register and does NOT
 * force the OWNER_GATED V261 v124-consolidation guard.
 *
 * It does two verifiable things:
 *   (1) PROGRAM MAP — maps each V2.0 program to EXISTING fs-verified repository components (anti-duplication; the test grounds
 *       every backing module on disk). Honest status ladder per §5: ABSENT/PARTIAL/EXISTING/TESTED/PRODUCTION_READY/
 *       INDEPENDENTLY_VALIDATED — nothing is claimed PRODUCTION_READY/operational here.
 *   (2) FINANCIAL MODEL — INDEPENDENTLY recomputes the §25-§29/§61 plan from the published monthly schedule (integer EUR) and
 *       confirms the document's own arithmetic (€635,345 year-one, €134,000 M12 MRR, €22,500 paid media, LTV/CAC, cost
 *       envelope). Every figure is a PLANNING_ESTIMATE — NONE is measured, achieved or guaranteed.
 *
 * HONESTY: additive ONLY — no parallel roadmap/Boussole/Radar/orchestrator, no 10th primitive, no duplicate register. Canonical
 * v124 integration remains OWNER_GATED (V261 guard: section∉A-R ⇒ ORPHAN). started=false. REUSES the existing extension-registry/
 * reconciliation pattern (odg-v124-extension-registry / odg-roadmap-reconciliation) — a SEPARATE map for the V2.0 growth document,
 * not a second reconciliation engine. 1,000-customer target and 50% ad-reduction are TARGETS, never claimed achieved.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// honest capability status ladder (directive §5). A module existing on disk ≠ its function is operational.
const CAP_STATUS = Object.freeze(["ABSENT", "PARTIAL", "EXISTING", "TESTED", "PRODUCTION_READY", "INDEPENDENTLY_VALIDATED"]);
const PRIMITIVES = Object.freeze(["IDENTITY", "STATE", "CONTRACT", "POLICY", "RESOLVER", "EXECUTOR", "EVIDENCE", "RECOVERY", "ALLOCATOR"]);  // the nine — no 10th

const MASTER_ARTIFACT = "ODG_BTP_INTERNATIONAL_GROWTH_ROADMAP_V2.md";

// ---- V2.0 program → existing component map (every `modules` entry is fs-grounded by the test). ----
const PROGRAMS = Object.freeze([
  Object.freeze({ id: "P-RADAR", part: "II §4", name: "Continuous competitive Radar", status: "PARTIAL", modules: Object.freeze(["frontier-radar", "odg-global-opportunity-radar", "market-intelligence", "odg-radar-collection-adapter", "odg-radar-to-mission-loop"]), gap: "radar + collection exist; continuous INTERNATIONAL competitor research (Procore/Autodesk/Obat…) is NOT_MEASURED; autonomous egress OWNER_GATED" }),
  Object.freeze({ id: "P-COMPMATRIX", part: "II §5", name: "Competitive capability matrix", status: "PARTIAL", modules: Object.freeze(["metier-benchmark-multidim", "odg-program-metier-matrix", "odg-metier-business-matrix"]), gap: "benchmark/matrix machinery exists; a maintained versioned COMPETITOR matrix with source/retrieval-date per competitor is not populated" }),
  Object.freeze({ id: "P-BIZINTEL", part: "II §6 Adv A", name: "Construction business intelligence (quote↔cost↔cash)", status: "EXISTING", modules: Object.freeze(["chantier-profitability", "odg-btp-project-workflow", "odg-btp-billing-engine", "cost-accounting"]), gap: "the quote→cost→cash→margin loop exists deterministically (V266/V267); cross-project learning layer is PARTIAL" }),
  Object.freeze({ id: "P-LEARNING", part: "II §6 Adv B", name: "Closed-loop learning (estimate vs actual)", status: "PARTIAL", modules: Object.freeze(["odg-observation-currency", "memory-taxonomy"]), gap: "observation-vs-estimate discipline + memory taxonomy exist; a per-customer validated knowledge base with cross-company privacy boundaries is not built" }),
  Object.freeze({ id: "P-MULTIMODAL", part: "II §6 Adv C / §7.3-7.4", name: "Multimodal field intelligence (voice/vision/docs)", status: "PARTIAL", modules: Object.freeze(["odg-btp-vision-voice-pipeline"]), gap: "ingestion/extraction layer exists (V263); OCR/STT/video RECOGNITION is BLOCKED (no engine; download unauthorized) — never fabricated" }),
  Object.freeze({ id: "P-FINPROTECT", part: "II §6 Adv D", name: "Proactive financial protection (margin/cost alerts)", status: "PARTIAL", modules: Object.freeze(["chantier-profitability", "odg-btp-devis-engine"]), gap: "omission/underpricing detection + chantier anomaly surfacing exist; predictive supplier/delay/cash-risk alerting is not built" }),
  Object.freeze({ id: "P-QUOTE20", part: "III §7.1", name: "Intelligent quotation — 20 mandatory functions", status: "PARTIAL", modules: Object.freeze(["odg-btp-devis-engine", "odg-btp-normative-registry"]), gap: "9 BUILT / 7 PARTIAL / 4 BLOCKED (photo/plan/voice/PDF — recognition-dependent); qualified in V260/V264" }),
  Object.freeze({ id: "P-METRE", part: "III §7.2", name: "Intelligent measurement (métré)", status: "PARTIAL", modules: Object.freeze(["odg-btp-metre-engine", "odg-btp-vision-voice-pipeline"]), gap: "deterministic geometry/units/coefficients exist (V262); plan/image interpretation is recognition-BLOCKED; MEASURED/ESTIMATED/ASSUMED/HUMAN_VALIDATED kept distinct" }),
  Object.freeze({ id: "P-FUNNEL", part: "VII §14", name: "Full commercial funnel + CRM", status: "EXISTING", modules: Object.freeze(["commercial-pipeline", "autonomous-commercial-cycle", "client-intake"]), gap: "pipeline/intake/cycle exist; stage-by-stage attribution with time limits + audit trail is PARTIAL" }),
  Object.freeze({ id: "P-LUCY", part: "VII §15 / §41", name: "Lucy — commercial assistance", status: "PARTIAL", modules: Object.freeze(["client-intake", "commercial-offer-builder", "odg-prospect-qualification"]), gap: "intake/qualification/offer exist; Lucy as a named assistant with language detection + demo scheduling + support triage is not consolidated; must not invent features/commitments" }),
  Object.freeze({ id: "P-SPEEDMARKET", part: "VII §16 / §40", name: "SpeedMarket — distribution & campaigns", status: "PARTIAL", modules: Object.freeze(["campaign-engine", "campaign-controller", "commercial-intelligence-chain", "market-intelligence"]), gap: "campaign engine/controller + market-intel exist; landing-page/creative/channel-attribution + external publication are OWNER_GATED and not wired" }),
  Object.freeze({ id: "P-ODG-CENTRAL", part: "VII §17 / XIII §39", name: "ODG central intelligence & orchestration", status: "EXISTING", modules: Object.freeze(["campaign-controller", "odg-mission-orchestrator"]), gap: "Boussole (ROADMAP.json) remains the sole mission guide; funnel-wide analysis composing Lucy+SpeedMarket is PARTIAL" }),
  Object.freeze({ id: "P-PRICING", part: "IX §21 / X §24", name: "Pricing & revenue architecture", status: "EXISTING", modules: Object.freeze(["odg-business-model-families", "odg-economic-scaling-model", "odg-three-person-economic-model"]), gap: "business-model/ARPA/scaling + 3-person constraint modelled; the specific €59/119/249/499 tiers are PLANNING hypotheses" }),
  Object.freeze({ id: "P-ACQENGINES", part: "V §11 / XI §32", name: "Five acquisition engines (partner/referral/SEO/demo/outbound)", status: "PARTIAL", modules: Object.freeze(["odg-global-opportunity-radar", "commercial-pipeline"]), gap: "outbound-signal + pipeline exist; dedicated partner-portal / referral-tracking / SEO-content / demo-library engines are largely ABSENT (to be built in Phase 3-5)" }),
  Object.freeze({ id: "P-ECOSYSTEM", part: "VIII §18-§20", name: "Supplier marketplace & partner ecosystem", status: "ABSENT", modules: Object.freeze([]), gap: "no supplier-marketplace / partner-portal module exists; prices would require source/date/unit/region/confidence (no live-pricing claim). To be built later." }),
  Object.freeze({ id: "P-INTL", part: "XII §37-§38", name: "Internationalization & localization", status: "PARTIAL", modules: Object.freeze(["odg-language-management", "odg-btp-normative-registry"]), gap: "language management + per-jurisdiction normative records exist (never auto-certified); full country-readiness (VAT/invoicing/employment/data-protection) per market is not populated — FR rules NOT applied to other countries" }),
  Object.freeze({ id: "P-V124-INTEGRATION", part: "I §3 / XV §44", name: "Canonical additive integration into v124", status: "PARTIAL", modules: Object.freeze(["odg-v124-consolidation", "odg-v124-extension-registry", "odg-roadmap-reconciliation", "odg-mission-crosswalk"]), gap: "OWNER_GATED — the v124 consolidation guard rejects any section∉A-R (V261). The V2.0 growth missions cannot be appended to docs/odg/v124-consolidated-roadmap.json without owner-authorized guard evolution; started=false, no mutation here." }),
]);

const PROHIBITIONS = Object.freeze({
  noParallelRoadmap: true, noSecondBoussole: true, noSecondRadar: true, noTenthPrimitive: true, noParallelOrchestrator: true, noDuplicateRegister: true,
  canonicalIntegration: "OWNER_GATED (V261 v124-consolidation guard — section∉A-R ⇒ ORPHAN)",
});

// ===================== independent financial-model recomputation (§25-§29, §61) — PLANNING_ESTIMATE only =====================
// published monthly schedule §25 [active, grossNew]. The ONLY input; everything else is derived (integer EUR).
const MONTHLY = Object.freeze([
  Object.freeze({ m: 1, active: 10, grossNew: 10 }), Object.freeze({ m: 2, active: 25, grossNew: 15 }), Object.freeze({ m: 3, active: 50, grossNew: 26 }),
  Object.freeze({ m: 4, active: 90, grossNew: 42 }), Object.freeze({ m: 5, active: 140, grossNew: 53 }), Object.freeze({ m: 6, active: 210, grossNew: 74 }),
  Object.freeze({ m: 7, active: 300, grossNew: 96 }), Object.freeze({ m: 8, active: 410, grossNew: 119 }), Object.freeze({ m: 9, active: 540, grossNew: 142 }),
  Object.freeze({ m: 10, active: 680, grossNew: 156 }), Object.freeze({ m: 11, active: 830, grossNew: 170 }), Object.freeze({ m: 12, active: 1000, grossNew: 195 }),
]);
const ASSUMPTIONS = Object.freeze({ saasArpaEur: 119, ecosystemPerCustomerEur: 15, ecosystemFromMonth: 6, onboardingPerCustomerEur: 60, maturityArpaEur: 134, grossMargin: 0.70, monthlyChurn: 0.03 });

/** recomputeAmbitious() -> independently derive the §26 ambitious-scenario revenue from the monthly schedule (integer EUR). */
function recomputeAmbitious(): any {
  const customerMonths = MONTHLY.reduce((a: number, r: any) => a + r.active, 0);
  const ecosystemMonths = MONTHLY.filter((r: any) => r.m >= ASSUMPTIONS.ecosystemFromMonth).reduce((a: number, r: any) => a + r.active, 0);
  const grossAcquisitions = MONTHLY.reduce((a: number, r: any) => a + r.grossNew, 0);
  const saas = customerMonths * ASSUMPTIONS.saasArpaEur;
  const ecosystem = ecosystemMonths * ASSUMPTIONS.ecosystemPerCustomerEur;
  const onboarding = grossAcquisitions * ASSUMPTIONS.onboardingPerCustomerEur;
  const yearOneRevenue = saas + ecosystem + onboarding;
  const active12 = MONTHLY[MONTHLY.length - 1].active;
  const mrrM12 = active12 * ASSUMPTIONS.saasArpaEur + active12 * ASSUMPTIONS.ecosystemPerCustomerEur;
  const arrRunRate = mrrM12 * 12;
  return Object.freeze({ basis: "PLANNING_ESTIMATE", customerMonths, ecosystemMonths, grossAcquisitions, saasEur: saas, ecosystemEur: ecosystem, onboardingEur: onboarding, yearOneRevenueEur: yearOneRevenue, mrrM12Eur: mrrM12, arrRunRateEur: arrRunRate });
}

/** recomputeUnitEconomics() -> §29 LTV / LTV:CAC / payback (planning assumptions). */
function recomputeUnitEconomics(cacEur: number): any {
  const grossProfitPerMonth = Math.round(ASSUMPTIONS.maturityArpaEur * ASSUMPTIONS.grossMargin * 100) / 100;   // 134 × 0.70
  const ltv = Math.round((ASSUMPTIONS.maturityArpaEur * ASSUMPTIONS.grossMargin / ASSUMPTIONS.monthlyChurn));   // ≈3127
  const ltvToCac = Math.round((ltv / cacEur) * 10) / 10;
  const paybackMonths = Math.round((cacEur / grossProfitPerMonth) * 10) / 10;
  return Object.freeze({ basis: "PLANNING_ESTIMATE/TARGET", grossProfitPerMonthEur: grossProfitPerMonth, ltvEur: ltv, cacEur, ltvToCac, paybackMonths, caveat: "TARGET only — 2025 B2B-SaaS median CAC payback ≈16 months; validate against actual sales motion, never claim as achieved" });
}

/** recomputePaidMedia() -> §10/§61 paid-media schedule + the (honest) reduction framing. */
function recomputePaidMedia(): any {
  const months13 = 3 * 3000, months412 = 9 * 1500;
  const annual = months13 + months412;                                 // 22,500
  const originalAnnual = 12 * 3000;                                     // 36,000
  return Object.freeze({
    basis: "PLANNING_TARGET", initialMonthlyEur: 3000, optimizedMonthlyEur: 1500, annualEur: annual, originalAnnualEur: originalAnnual,
    monthlyRecurringReductionPct: Math.round((1 - 1500 / 3000) * 1000) / 10,       // 50.0 — the claimed "50% cut" (monthly recurring, post-test)
    annualEnvelopeReductionPct: Math.round((1 - annual / originalAnnual) * 1000) / 10,  // 37.5 — the honest annual figure
    note: "the '50% reduction' is the MONTHLY RECURRING level after the test phase; the ANNUAL envelope falls 37.5% (the document states both — consistent).",
  });
}

/** recomputeCostEnvelope() -> §28 ambitious cost envelope + operating result (integer EUR). */
function recomputeCostEnvelope(): any {
  const lines = Object.freeze([
    ["team3", 144000], ["paidMedia", 22500], ["contentLocalization", 36000], ["partnerDistribution", 90000], ["infraSoftware", 24000],
    ["aiVariableDelivery", 34000], ["paymentCosts", 15900], ["supportLegalAccounting", 30000], ["launchSetup", 20000],
  ]);
  const total = lines.reduce((a: number, l: any) => a + l[1], 0);
  const revenue = recomputeAmbitious().yearOneRevenueEur;
  return Object.freeze({ basis: "PLANNING_ESTIMATE", lines: Object.freeze(lines.map((l: any) => Object.freeze({ item: l[0], eur: l[1] }))), totalEur: total, revenueEur: revenue, operatingResultEur: revenue - total, caveat: "scenario calculation, NOT guaranteed net profit; update with actual payroll/commissions/invoices/fees/tax" });
}

/** recomputeAcquisitionMix() -> §32 channel mix for the ambitious gross acquisitions. */
function recomputeAcquisitionMix(): any {
  const gross = recomputeAmbitious().grossAcquisitions;                // 1098
  const stated = Object.freeze([["paid", 0.10, 110], ["partner", 0.30, 329], ["customerReferral", 0.25, 275], ["seoContent", 0.20, 220], ["outbound", 0.15, 164]]);
  const shareSum = stated.reduce((a: number, r: any) => a + r[1], 0);
  const statedCustomerSum = stated.reduce((a: number, r: any) => a + r[2], 0);
  return Object.freeze({ basis: "PLANNING_TARGET", grossAcquisitions: gross, channels: Object.freeze(stated.map((r: any) => Object.freeze({ channel: r[0], share: r[1], statedCustomers: r[2], roundedFromShare: Math.round(gross * r[1]) }))), shareSum: Math.round(shareSum * 100) / 100, statedCustomerSum, note: "shares sum to 100% and stated per-channel customers sum to the 1,098 gross target (rounding). TARGET mix, not current performance." });
}

/** financialConsistency() -> compares the independent recompute to the document's published figures; flags any mismatch. */
function financialConsistency(): any {
  const a = recomputeAmbitious(); const cost = recomputeCostEnvelope(); const media = recomputePaidMedia(); const mix = recomputeAcquisitionMix();
  const checks = [
    ["customerMonths=4285", a.customerMonths === 4285], ["ecosystemMonths=3970", a.ecosystemMonths === 3970], ["grossAcquisitions=1098", a.grossAcquisitions === 1098],
    ["saas=509915", a.saasEur === 509915], ["ecosystem=59550", a.ecosystemEur === 59550], ["onboarding=65880", a.onboardingEur === 65880],
    ["yearOneRevenue=635345", a.yearOneRevenueEur === 635345], ["mrrM12=134000", a.mrrM12Eur === 134000], ["arrRunRate=1608000", a.arrRunRateEur === 1608000],
    ["costEnvelope=416400", cost.totalEur === 416400], ["operatingResult=218945", cost.operatingResultEur === 218945],
    ["paidMediaAnnual=22500", media.annualEur === 22500], ["monthlyRecurringReduction=50.0", media.monthlyRecurringReductionPct === 50.0], ["annualEnvelopeReduction=37.5", media.annualEnvelopeReductionPct === 37.5],
    ["acquisitionMixShares=1.0", mix.shareSum === 1.0], ["acquisitionMixCustomers=1098", mix.statedCustomerSum === 1098],
  ];
  const mismatches = checks.filter((c: any) => c[1] !== true).map((c: any) => c[0]);
  // the one figure that CANNOT be independently reproduced: the prudent/central scenario totals lack a published monthly schedule.
  const notIndependentlyDerivable = Object.freeze(["prudent/central scenario year-one revenue (§27): no published monthly active+acquisition schedule ⇒ only the SaaS portion (customerMonths×€119) is checkable; ecosystem+onboarding split NOT_INDEPENDENTLY_DERIVABLE"]);
  return Object.freeze({ basis: "PLANNING_ESTIMATE (NOT measured/achieved)", documentArithmeticConsistent: mismatches.length === 0, checks: Object.freeze(checks.map((c: any) => Object.freeze({ claim: c[0], reproduced: c[1] }))), mismatches: Object.freeze(mismatches), notIndependentlyDerivable });
}

/** reconcile() -> the full Phase-0 integration proposal (program map + financial check + OWNER_GATED status). */
function reconcile(): any {
  const count = (s: string) => PROGRAMS.filter((p: any) => p.status === s).length;
  const fin = financialConsistency();
  return Object.freeze({
    phase: "PHASE_0 (§44) — canonical additive integration PROPOSAL + verified program map",
    masterArtifact: MASTER_ARTIFACT, started: false,
    programCount: PROGRAMS.length, programs: PROGRAMS,
    statusTally: Object.freeze({ ABSENT: count("ABSENT"), PARTIAL: count("PARTIAL"), EXISTING: count("EXISTING"), TESTED: count("TESTED"), PRODUCTION_READY: count("PRODUCTION_READY"), INDEPENDENTLY_VALIDATED: count("INDEPENDENTLY_VALIDATED") }),
    financial: fin, prohibitions: PROHIBITIONS,
    canonicalIntegration: "OWNER_GATED — v124 consolidation guard (V261) rejects non-A-R sections; the V2.0 growth missions are NOT appended to docs/odg/v124-consolidated-roadmap.json in this work; a guard evolution is required and is the owner's to authorize.",
    note: "Phase-0 reconciliation ONLY: maps the V2.0 roadmap to existing components (anti-duplication), independently confirms the document's financial arithmetic as internally consistent PLANNING estimates (never achieved), and preserves every canonical register. No parallel roadmap/Boussole/Radar/orchestrator/primitive; nothing OPERATIONAL/world-class; 1,000-customer + 50% ad-cut are TARGETS.",
  });
}

const GROWTH_ROADMAP_RECONCILIATION_CONTRACT = Object.freeze({
  id: "V268-ODG-BTP-GROWTH-ROADMAP-RECONCILIATION",
  source: "V2.0 MASTER GROWTH & WORLD-CLASS ROADMAP — Phase 0 (§44) canonical reconciliation",
  capStatuses: CAP_STATUS, primitives: PRIMITIVES,
  reuses: Object.freeze(["odg-v124-extension-registry (PARKED program→component pattern)", "odg-roadmap-reconciliation / odg-mission-crosswalk (reconciliation pattern)", "odg-v124-consolidation (the OWNER_GATED guard)", "odg-business-model-families / odg-three-person-economic-model (economics)"]),
  invariants: Object.freeze([
    "additive ONLY — no parallel roadmap/Boussole/Radar/orchestrator, no 10th primitive, no duplicate mission register",
    "canonical v124 integration is OWNER_GATED (V261 guard: section∉A-R ⇒ ORPHAN); started=false; NO canonical register mutated",
    "program map is anti-duplicative + fs-grounded (every backing module exists on disk); honest status ladder — a module on disk ≠ operational; nothing PRODUCTION_READY/INDEPENDENTLY_VALIDATED claimed here",
    "financial figures are INDEPENDENTLY recomputed (integer EUR) and are PLANNING_ESTIMATES/TARGETS — NEVER measured, achieved or guaranteed; the prudent/central scenario split is NOT_INDEPENDENTLY_DERIVABLE and is flagged, not invented",
    "1,000-customer target + 50% paid-ad reduction are TARGETS; ARR run-rate ≠ revenue earned; unpaid invoices ≠ collected cash; deterministic/read-only (no Date.now/Math.random/I/O)",
  ]),
});

module.exports = {
  CAP_STATUS, PRIMITIVES, MASTER_ARTIFACT, PROGRAMS, PROHIBITIONS, MONTHLY, ASSUMPTIONS,
  recomputeAmbitious, recomputeUnitEconomics, recomputePaidMedia, recomputeCostEnvelope, recomputeAcquisitionMix, financialConsistency, reconcile,
  GROWTH_ROADMAP_RECONCILIATION_CONTRACT,
};

export {};
