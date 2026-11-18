#!/usr/bin/env node
"use strict";

/*
 * V277 §4 (P3 Radar) — ODG BTP COMPETITOR INTELLIGENCE (deterministic, provenance-first). Converts REAL authorized web
 * research into a durable capability (NOT just a report): a source-verified competitor-finding store that fail-closes on
 * missing provenance, grades confidence honestly, distinguishes source types, and compares findings to ODG's real capabilities.
 *
 * PROVENANCE OF THE SEEDED FINDINGS: a REAL WebSearch (authorized Radar research) was executed on 2026-11-18 for French BTP
 * devis/facture software. The returned data are from THIRD-PARTY COMPARISON/REVIEW sites (SECONDARY_REVIEW) — NOT official
 * vendor documentation — so every pricing/feature claim is graded confidence LOW / NEEDS_PRIMARY_VERIFICATION and is NOT
 * presented as verified fact. Official-doc verification is recorded as the required next step.
 *
 * HONESTY (V268 §4/§5 discipline): a competitor claim is NEVER asserted as ODG fact; absence of a feature on a review site is
 * NOT proof the competitor lacks it; a finding without a source URL + retrieval date is REJECTED (fail-closed); VENDOR_CLAIM ≠
 * INDEPENDENT_REVIEW ≠ OFFICIAL_DOC ≠ FACT; pricing from review sites ⇒ NEEDS_PRIMARY_VERIFICATION. Deterministic/read-only
 * (findings are a static provenance-tagged snapshot; no live network at import). Feeds the V268 §5 competitive matrix.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

const SOURCE_TYPE = Object.freeze(["OFFICIAL_DOC", "GOV_STATS", "INDEPENDENT_REVIEW", "SECONDARY_REVIEW", "VENDOR_CLAIM", "HYPOTHESIS"]);
const CONFIDENCE = Object.freeze(["HIGH", "MEDIUM", "LOW", "NEEDS_PRIMARY_VERIFICATION"]);

// ---- REAL findings from the 2026-11-18 authorized WebSearch (third-party comparison sites ⇒ SECONDARY_REVIEW / LOW). ----
const COMPETITOR_FINDINGS = Object.freeze([
  Object.freeze({ competitor: "Tolteck", claim: "≈19 €/HT per month (annual plan); emphasises simplicity + fast entry; works offline; unlimited users + built-in works library; NO AI quote generation, NO GPS site tracking, NO client online payment (per review)", sourceUrl: "https://www.nstudiodigital.fr/blog/tolteck-vs-obat-logiciel-btp.html", sourceTitle: "Tolteck vs Obat : quel logiciel de devis choisir ?", publisher: "N/ Studio Digital", retrievalDate: "2026-11-18", sourceType: "SECONDARY_REVIEW", confidence: "LOW", limitations: "third-party comparison site, not official Tolteck documentation; pricing/features may be outdated or affiliate-influenced; NEEDS_PRIMARY_VERIFICATION against tolteck.com" }),
  Object.freeze({ competitor: "Obat", claim: "≈25–39 €/HT per month (by VAT regime); professional quotes, EN 16931-conformant e-invoices, end-to-end site management, planning, purchasing, pro account, communication studio (per review)", sourceUrl: "https://www.monlogicielpro.com/logiciel/obat/", sourceTitle: "Obat : avis, tarifs 2026 et alternatives du logiciel BTP", publisher: "monlogicielpro.com", retrievalDate: "2026-11-18", sourceType: "SECONDARY_REVIEW", confidence: "LOW", limitations: "third-party review/comparison site, not official Obat documentation; pricing tiers and feature set NEEDS_PRIMARY_VERIFICATION against obat.fr" }),
  Object.freeze({ competitor: "market", claim: "2026 French BTP-software market segments devis/facture tools by simplicity (Tolteck) vs breadth (Obat/Batappli); several comparison sites rank them for artisans", sourceUrl: "https://outilios.fr/meilleur-logiciel-devis/", sourceTitle: "Logiciel devis facture BTP 2026 : comparatif artisans", publisher: "outilios.fr", retrievalDate: "2026-11-18", sourceType: "SECONDARY_REVIEW", confidence: "LOW", limitations: "SEO/affiliate comparison content; positioning is editorial, not a measured benchmark" }),
]);

/** validateFinding(f) -> fail-closed: a usable finding MUST carry a source URL + retrieval date + valid source-type + confidence. */
function validateFinding(f: any): any {
  const x = isObj(f) ? f : {};
  const missing: string[] = [];
  if (!isStr(x.competitor)) missing.push("competitor");
  if (!isStr(x.claim)) missing.push("claim");
  if (!(isStr(x.sourceUrl) && /^https?:\/\//.test(x.sourceUrl))) missing.push("sourceUrl(http)");
  if (!isStr(x.retrievalDate)) missing.push("retrievalDate");
  if (SOURCE_TYPE.indexOf(x.sourceType) < 0) missing.push("sourceType∈enum");
  if (CONFIDENCE.indexOf(x.confidence) < 0) missing.push("confidence∈enum");
  if (!isStr(x.limitations)) missing.push("limitations");
  return Object.freeze({ ok: missing.length === 0, missing: Object.freeze(missing) });
}

/** auditFindings(findings) -> every finding provenance-valid; roll-up by source-type/confidence; flags primary-verification needs. */
function auditFindings(findings?: any): any {
  const list = (Array.isArray(findings) ? findings : COMPETITOR_FINDINGS).filter(isObj);
  const invalid = list.filter((f: any) => !validateFinding(f).ok).map((f: any) => ({ competitor: f.competitor || "?", missing: validateFinding(f).missing }));
  const bySourceType: Record<string, number> = {}; const byConfidence: Record<string, number> = {};
  for (const f of list) { bySourceType[f.sourceType] = (bySourceType[f.sourceType] || 0) + 1; byConfidence[f.confidence] = (byConfidence[f.confidence] || 0) + 1; }
  const needPrimary = list.filter((f: any) => f.sourceType === "SECONDARY_REVIEW" || f.sourceType === "VENDOR_CLAIM" || f.confidence === "LOW" || f.confidence === "NEEDS_PRIMARY_VERIFICATION").map((f: any) => f.competitor);
  return Object.freeze({
    ok: invalid.length === 0, count: list.length, invalid: Object.freeze(invalid), bySourceType: Object.freeze(bySourceType), byConfidence: Object.freeze(byConfidence),
    anyOfficialDoc: list.some((f: any) => f.sourceType === "OFFICIAL_DOC"), needsPrimaryVerification: Object.freeze([...new Set(needPrimary)]),
    note: "every finding carries a source URL + retrieval date; third-party review data is SECONDARY_REVIEW / LOW and NEEDS_PRIMARY_VERIFICATION against official vendor docs. A competitor claim is never an ODG fact; absence on a review site is not proof of absence.",
  });
}

// ---- compare competitor capability themes to ODG's REAL implementation (honest gap view; feeds V268 §5 matrix). ----
const ODG_CAPABILITY_MAP = Object.freeze([
  Object.freeze({ theme: "devis / quotation", odgStatus: "BUILT", odgModule: "odg-btp-devis-engine (V260)", note: "deterministic integer-cent costing; AI photo/plan/voice input ABSENT (recognition-blocked)" }),
  Object.freeze({ theme: "e-invoice / facturation", odgStatus: "BUILT", odgModule: "einvoice-validator + odg-btp-billing-engine (V267)", note: "EN 16931 validation + progress billing/cash; external transmission OWNER_GATED" }),
  Object.freeze({ theme: "site management / suivi chantier", odgStatus: "BUILT", odgModule: "odg-btp-project-workflow (V266)", note: "lifecycle/planning/materials/closure; GPS pointage ABSENT" }),
  Object.freeze({ theme: "métré / takeoff", odgStatus: "BUILT", odgModule: "odg-btp-metre-engine (V262)", note: "deterministic geometry/units; plan-image extraction recognition-blocked" }),
  Object.freeze({ theme: "AI quote from photo/plan/voice", odgStatus: "ABSENT", odgModule: null, note: "OCR/STT/vision recognition absent (NEEDS_SPECIALIZED_ENGINE) — same gap competitors' reviews note for Tolteck" }),
  Object.freeze({ theme: "online client payment", odgStatus: "PARTIAL", odgModule: "payments.ts / commercial-pipeline", note: "payment seam exists; live external payment OWNER_GATED (never autonomous)" }),
]);

/** compareToODG() -> theme-by-theme honest gap view (competitor claims unverified; ODG status real). */
function compareToODG(): any {
  const audit = auditFindings();
  return Object.freeze({
    ok: true, competitorFindings: COMPETITOR_FINDINGS, competitorEvidenceQuality: audit.byConfidence,
    odgCapabilities: ODG_CAPABILITY_MAP,
    gaps: Object.freeze(ODG_CAPABILITY_MAP.filter((c: any) => c.odgStatus === "ABSENT" || c.odgStatus === "PARTIAL").map((c: any) => Object.freeze({ theme: c.theme, odgStatus: c.odgStatus, note: c.note }))),
    note: "theme-by-theme comparison: ODG status is REAL (built/partial/absent, from merged engines); competitor claims are SECONDARY_REVIEW (unverified, LOW confidence) and NOT asserted as fact. The ABSENT 'AI quote from photo/plan/voice' + PARTIAL online-payment are the genuine ODG gaps, consistent with the recognition-engine blocker — recorded as roadmap gaps, not as proof competitors have superior verified capability.",
  });
}

const COMPETITOR_INTELLIGENCE_CONTRACT = Object.freeze({
  id: "V277-ODG-BTP-COMPETITOR-INTELLIGENCE",
  source: "V277 §4 (P3 Radar) — source-verified BTP competitor intelligence from authorized web research",
  sourceTypes: SOURCE_TYPE, confidences: CONFIDENCE,
  researchProvenance: "REAL WebSearch executed 2026-11-18 (authorized Radar); results from third-party comparison/review sites (SECONDARY_REVIEW)",
  invariants: Object.freeze([
    "every finding carries a source URL + retrieval date + source-type + confidence + limitations; a finding missing provenance is REJECTED (fail-closed)",
    "research data from comparison/review sites is SECONDARY_REVIEW / LOW confidence / NEEDS_PRIMARY_VERIFICATION — NOT official docs, NOT presented as verified fact",
    "a competitor claim is NEVER asserted as an ODG fact; absence of a feature on a review site is NOT proof the competitor lacks it (V268 §4 discipline)",
    "ODG capability status is REAL (from merged engines); gaps (ABSENT AI-quote / PARTIAL online-payment) are recorded as roadmap gaps, not as proof of competitor superiority",
    "deterministic/read-only (static provenance-tagged snapshot, no live network at import); feeds the V268 §5 competitive matrix — no new radar/primitive; research converted to a durable capability, not a report",
  ]),
});

module.exports = { SOURCE_TYPE, CONFIDENCE, COMPETITOR_FINDINGS, ODG_CAPABILITY_MAP, validateFinding, auditFindings, compareToODG, COMPETITOR_INTELLIGENCE_CONTRACT };

export {};
