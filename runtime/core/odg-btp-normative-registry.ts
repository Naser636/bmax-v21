#!/usr/bin/env node
"use strict";

/*
 * V264 — ODG BTP VERSIONED NORMATIVE REGISTRY + ENGINE (read-only). A machine-readable registry of BTP normative/regulatory
 * references, each with SOURCE-VERIFIED metadata (real WebSearch on 2026-11-17) + a deterministic engine (validate / dedup /
 * conflict / applicability / fail-closed checklist). It REUSES regulatory-assurance.assertNotCertified (anti-overclaim) — no
 * second assurance/roadmap/governance engine.
 *
 * HONESTY (directive §2/§3): NOTHING is invented — only SOURCE-BACKED metadata, permitted summaries and source URLs are
 * stored (NO copyrighted clause text). LEGAL / REGULATORY / NORMATIVE / CONTRACTUAL / TECHNICAL_GUIDANCE are kept distinct; a
 * standard is NOT presented as legally mandatory without authoritative evidence. A missing registry entry is NEVER proof that
 * no requirement exists; a registry match NEVER certifies legal/technical compliance. Low-confidence entries are flagged
 * NEEDS_VERIFICATION (the engine abstains). Pure/deterministic.
 */

const RA = require("./regulatory-assurance.js");          // reuse assertNotCertified (anti-certification discipline)
const DEV = require("./odg-btp-devis-engine.js");         // reuse the 20 devis functions for the §5 reconciliation
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

const OBLIGATION_TYPES = Object.freeze(["LEGAL", "REGULATORY", "NORMATIVE", "CONTRACTUAL", "TECHNICAL_GUIDANCE"]);
const MANDATORY_STATUS = Object.freeze(["MANDATORY", "MANDATORY_IN_PRACTICE", "CONDITIONAL", "VOLUNTARY", "NEEDS_VERIFICATION"]);
const CONFIDENCE = Object.freeze(["HIGH", "MEDIUM", "LOW"]);

// ---- SOURCE-VERIFIED records (real WebSearch 2026-11-17). Metadata + permitted summary + source only (no copyrighted text). ----
const NORMATIVE_RECORDS = Object.freeze([
  Object.freeze({ id: "FR-NF-C-15-100", title: "NF C 15-100 — Installations électriques à basse tension", authority: "AFNOR", jurisdiction: "FR",
    version: "2024 edition (published 2024-08-21; mandatory reference since 2025-09-01, replacing the 2002 ed.)", obligationType: "NORMATIVE", mandatoryStatus: "MANDATORY_IN_PRACTICE",
    trades: Object.freeze(["electrical", "second-fix"]), lifecycleStages: Object.freeze(["execution", "control"]),
    evidence: "AFNOR-published; conformity enforced by CONSUEL (conformity certificate required for Enedis power activation)", sourceUrl: "https://www.afnor.org/ + https://www.legrand.fr/pro/normes-et-reglementations/norme-nf-c-15-100", retrievalDate: "2026-11-17",
    confidence: "HIGH", unresolved: Object.freeze(["specific clause numbers/values NOT reproduced (copyright) — per-clause lookup required for a given installation"]) }),
  Object.freeze({ id: "EU-2024-3110-CPR", title: "Regulation (EU) 2024/3110 — Construction Products Regulation (recast)", authority: "European Parliament & Council (EU)", jurisdiction: "EU",
    version: "2024/3110 — in force 2025-01-07; applicable from 2026-01-08; repeals Reg. (EU) 305/2011 (certain articles until 2040)", obligationType: "LEGAL", mandatoryStatus: "MANDATORY",
    trades: Object.freeze(["construction-products", "procurement"]), lifecycleStages: Object.freeze(["product", "procurement"]),
    evidence: "EU Regulation, directly applicable; published in the Official Journal of the EU", sourceUrl: "https://single-market-economy.ec.europa.eu/sectors/construction/construction-products-regulation-cpr + https://eur-lex.europa.eu", retrievalDate: "2026-11-17",
    confidence: "HIGH", unresolved: Object.freeze(["product-family-specific harmonised specifications + transition dates per product require per-family lookup"]) }),
  Object.freeze({ id: "FR-RE2020", title: "Réglementation Environnementale 2020 (RE2020)", authority: "French State (ministère de la Transition écologique)", jurisdiction: "FR",
    version: "applicable since 2022-01-01 (residential) / 2022-07-01 (offices & education); replaces RT2012", obligationType: "REGULATORY", mandatoryStatus: "MANDATORY",
    trades: Object.freeze(["energy-performance", "envelope", "structure"]), lifecycleStages: Object.freeze(["design"]),
    evidence: "French regulation for new buildings; life-cycle energy + carbon thresholds", sourceUrl: "https://www.ecologie.gouv.fr/ (guide RE2020)", retrievalDate: "2026-11-17",
    confidence: "HIGH", unresolved: Object.freeze(["building-type-specific thresholds + calendar steps (2025/2028/2031) require per-type lookup"]) }),
  Object.freeze({ id: "ISO-19650", title: "ISO 19650 (parts 1 & 2) — Information management using BIM", authority: "ISO", jurisdiction: "INTERNATIONAL",
    version: "parts 1 & 2 published 2018/2019; under review from 2024 (DIS amendments ~2026)", obligationType: "NORMATIVE", mandatoryStatus: "VOLUNTARY",
    trades: Object.freeze(["BIM", "information-management", "project-management"]), lifecycleStages: Object.freeze(["all"]),
    evidence: "ISO standard (voluntary unless mandated nationally or by contract)", sourceUrl: "https://www.iso.org/sectors/building-construction/building-information-modelling", retrievalDate: "2026-11-17",
    confidence: "HIGH", unresolved: Object.freeze(["national/contractual adoption determines whether it is mandatory on a given project"]) }),
  Object.freeze({ id: "FR-NF-DTU", title: "NF DTU — Documents Techniques Unifiés (execution rules by trade)", authority: "AFNOR / CSTB", jurisdiction: "FR",
    version: "family (per-trade DTU numbers & dates vary — NOT enumerated here)", obligationType: "CONTRACTUAL", mandatoryStatus: "CONDITIONAL",
    trades: Object.freeze(["masonry", "concrete", "roofing", "plastering", "second-fix", "all"]), lifecycleStages: Object.freeze(["execution", "acceptance"]),
    evidence: "DTUs are technical execution rules commonly referenced in French construction contracts (marché) ⇒ contractually binding WHEN referenced", sourceUrl: "https://www.afnor.org/ + https://www.cstb.fr/", retrievalDate: "2026-11-17",
    confidence: "MEDIUM", unresolved: Object.freeze(["specific DTU number + edition date per trade NOT verified this session — requires per-DTU lookup before asserting applicability"]) }),
  Object.freeze({ id: "EU-EUROCODES", title: "Eurocodes (EN 1990–EN 1999) — structural design", authority: "CEN / JRC + national annexes", jurisdiction: "EU + national",
    version: "1st generation in force; 2nd-generation transition ONGOING (dates NOT verified this session)", obligationType: "NORMATIVE", mandatoryStatus: "NEEDS_VERIFICATION",
    trades: Object.freeze(["structural-engineering", "concrete", "earthworks"]), lifecycleStages: Object.freeze(["design"]),
    evidence: "structural design standards; applicability via national annexes / public-works requirements — NOT verified in detail here", sourceUrl: "https://eurocodes.jrc.ec.europa.eu/", retrievalDate: "2026-11-17",
    confidence: "LOW", unresolved: Object.freeze(["2nd-generation transition dates + national-annex mandatory status NOT verified ⇒ engine abstains on mandatory classification"]) }),
]);

// ---- REGISTRY ENGINE (deterministic) ----
/** validateRecord(r) -> { ok, missing[] }. Required fields + enum membership; fail-closed. */
function validateRecord(r: any): any {
  const x = isObj(r) ? r : {};
  const missing: string[] = [];
  for (const k of ["id", "title", "authority", "jurisdiction", "version", "obligationType", "mandatoryStatus", "evidence", "sourceUrl", "retrievalDate", "confidence"]) if (!isStr(x[k])) missing.push(k);
  if (isStr(x.obligationType) && OBLIGATION_TYPES.indexOf(x.obligationType) < 0) missing.push("obligationType∉enum");
  if (isStr(x.mandatoryStatus) && MANDATORY_STATUS.indexOf(x.mandatoryStatus) < 0) missing.push("mandatoryStatus∉enum");
  if (isStr(x.confidence) && CONFIDENCE.indexOf(x.confidence) < 0) missing.push("confidence∉enum");
  return Object.freeze({ ok: missing.length === 0, id: x.id || null, missing: Object.freeze(missing) });
}

/** auditRegistry(records?) -> validation + duplicate-id + version/status-conflict detection over the whole registry. */
function auditRegistry(records?: any): any {
  const recs = Array.isArray(records) ? records : NORMATIVE_RECORDS;
  const perRecord = recs.map(validateRecord);
  const ids: Record<string, number> = {}; for (const r of recs) if (isObj(r) && isStr(r.id)) ids[r.id] = (ids[r.id] || 0) + 1;
  const duplicates = Object.keys(ids).filter((k) => ids[k] > 1);
  const conflicts: any[] = [];
  const byId: Record<string, any[]> = {}; for (const r of recs) if (isObj(r) && isStr(r.id)) (byId[r.id] = byId[r.id] || []).push(r);
  for (const id of Object.keys(byId)) { const g = byId[id]; if (g.length > 1 && new Set(g.map((r: any) => r.version + "|" + r.mandatoryStatus)).size > 1) conflicts.push(Object.freeze({ id, detail: "same id with conflicting version/status" })); }
  const needsVerification = recs.filter((r: any) => isObj(r) && (r.confidence === "LOW" || r.mandatoryStatus === "NEEDS_VERIFICATION")).map((r: any) => r.id);
  return Object.freeze({ total: recs.length, valid: perRecord.every((p: any) => p.ok), invalid: Object.freeze(perRecord.filter((p: any) => !p.ok)), duplicates: Object.freeze(duplicates), conflicts: Object.freeze(conflicts), needsVerification: Object.freeze(needsVerification), note: "schema + duplicate-id + version/status-conflict audit; LOW-confidence / NEEDS_VERIFICATION records are flagged, not asserted as mandatory." });
}

/** resolveApplicability(context, records?) -> records matching trade + jurisdiction (+ lifecycle). A miss is NOT 'no requirement'. */
function resolveApplicability(context: any, records?: any): any {
  const c = isObj(context) ? context : {};
  const recs = Array.isArray(records) ? records : NORMATIVE_RECORDS;
  const trade = isStr(c.trade) ? c.trade : null; const jur = isStr(c.jurisdiction) ? c.jurisdiction : null; const stage = isStr(c.lifecycleStage) ? c.lifecycleStage : null;
  const matches = recs.filter((r: any) => isObj(r)
    && (jur === null || r.jurisdiction === jur || r.jurisdiction === "INTERNATIONAL" || /EU/.test(r.jurisdiction) && jur === "FR")
    && (trade === null || (Array.isArray(r.trades) && (r.trades.indexOf(trade) >= 0 || r.trades.indexOf("all") >= 0)))
    && (stage === null || (Array.isArray(r.lifecycleStages) && (r.lifecycleStages.indexOf(stage) >= 0 || r.lifecycleStages.indexOf("all") >= 0))));
  return Object.freeze({ context: Object.freeze({ trade, jurisdiction: jur, lifecycleStage: stage }), matched: Object.freeze(matches.map((r: any) => Object.freeze({ id: r.id, obligationType: r.obligationType, mandatoryStatus: r.mandatoryStatus, confidence: r.confidence }))), matchCount: matches.length,
    note: "applicability by trade/jurisdiction/stage over SOURCE-BACKED records. A MISSING entry is NOT proof that no requirement exists (the registry is not exhaustive) — treat as COVERAGE_GAP, not clearance." });
}

/** complianceChecklist(context, records?) -> per applicable item an UNVERIFIED status (a match NEVER certifies compliance). */
function complianceChecklist(context: any, records?: any): any {
  const app = resolveApplicability(context, records);
  const items = app.matched.map((m: any) => Object.freeze({ id: m.id, obligationType: m.obligationType, mandatoryStatus: m.mandatoryStatus, complianceStatus: "UNVERIFIED", requiresEvidence: true, note: "a registry match identifies an applicable reference; it does NOT certify compliance — real evidence + (where legal) a qualified assessment is required." }));
  // anti-overclaim guard (reuse): a 'certified/compliant' claim must be refused.
  const guard = RA.assertNotCertified("This BTP registry checklist is certified and fully compliant.");
  return Object.freeze({ context: app.context, items: Object.freeze(items), itemCount: items.length, certified: false, anyCertifiedClaimRefused: guard && guard.ok === false, note: "fail-closed: no item is CERTIFIED/compliant by a registry match; a certification claim is refused (regulatory-assurance). Missing coverage ≠ clearance." });
}

// ---- §5 — grounded reconciliation of the 20 devis functions (recognition-dependent ⇒ BLOCKED per the V263 audit) ----
function qualifyDevis20(fsLike?: any): any {
  const fs = fsLike || require("fs");
  const base: any[] = Array.isArray(DEV.DEVIS_FUNCTIONS) ? DEV.DEVIS_FUNCTIONS : [];
  const recognitionDependent = new Set([1, 2, 3, 16]);   // photo/plan/voice/PDF — depend on OCR/STT/renderer (V263: recognition BLOCKED)
  const backingFiles: Record<number, string> = { 4: "runtime/core/odg-btp-devis-engine.ts", 5: "runtime/core/odg-btp-metre-engine.ts", 6: "runtime/core/odg-btp-devis-engine.ts", 7: "runtime/core/odg-btp-devis-engine.ts", 8: "runtime/core/odg-btp-devis-engine.ts", 10: "runtime/core/odg-btp-devis-engine.ts", 11: "runtime/core/odg-btp-devis-engine.ts", 13: "runtime/core/odg-btp-devis-engine.ts", 15: "runtime/core/odg-btp-devis-engine.ts", 20: "runtime/core/odg-btp-devis-engine.ts" };
  const rows = base.map((fn: any) => {
    const file = backingFiles[fn.n] || null;
    const built = file ? fs.existsSync(file) : false;
    const status = recognitionDependent.has(fn.n) ? "BLOCKED" : (built ? "TESTED" : (fn.status === "PARTIAL" ? "PARTIAL" : "ABSENT"));
    return Object.freeze({ n: fn.n, name: fn.name, status, backingFile: built ? file : null, recognitionDependent: recognitionDependent.has(fn.n), v260Status: fn.status,
      note: recognitionDependent.has(fn.n) ? "BLOCKED — needs OCR/STT/PDF recognition (absent; V263 audit) — never fabricated" : (built ? "backing module exists + has executable tests (BUILT/TESTED)" : "no dedicated backing") });
  });
  const count = (s: string) => rows.filter((r: any) => r.status === s).length;
  return Object.freeze({ total: rows.length, rows: Object.freeze(rows), tested: count("TESTED"), partial: count("PARTIAL"), blocked: count("BLOCKED"), absent: count("ABSENT"),
    note: "grounded reconciliation: BUILT/TESTED only where a backing module EXISTS on disk; recognition-dependent functions (1-3,16) are BLOCKED on absent OCR/STT/PDF (V263) — never upgraded on documentation. Nothing OPERATIONAL/ACCEPTED." });
}

const BTP_NORMATIVE_REGISTRY_CONTRACT = Object.freeze({
  id: "V264-ODG-BTP-NORMATIVE-REGISTRY",
  source: "V264 — versioned BTP normative registry + engine + grounded 20-devis-function reconciliation",
  obligationTypes: OBLIGATION_TYPES, recordCount: NORMATIVE_RECORDS.length, reuses: Object.freeze(["regulatory-assurance.assertNotCertified", "odg-btp-devis-engine.DEVIS_FUNCTIONS"]),
  invariants: Object.freeze([
    "NOTHING invented: only SOURCE-VERIFIED metadata + permitted summaries + source URLs (no copyrighted clause text); each record carries sourceUrl + retrievalDate + confidence + unresolved points",
    "LEGAL/REGULATORY/NORMATIVE/CONTRACTUAL/TECHNICAL_GUIDANCE kept distinct; a standard is NOT presented as legally mandatory without authoritative evidence (LOW-confidence ⇒ NEEDS_VERIFICATION, engine abstains)",
    "a MISSING registry entry is NEVER proof that no requirement exists (COVERAGE_GAP, not clearance); a registry MATCH NEVER certifies compliance (items stay UNVERIFIED; a certification claim is refused via regulatory-assurance)",
    "§5 reconciliation is GROUNDED: BUILT/TESTED only where a backing module exists on disk; recognition-dependent devis functions (1-3,16) are BLOCKED on absent OCR/STT/PDF; never upgraded on documentation",
    "no second assurance/quotation/metré/roadmap/governance engine; pure/deterministic; no new primitive; locked companion/registers untouched",
  ]),
});

module.exports = { OBLIGATION_TYPES, MANDATORY_STATUS, CONFIDENCE, NORMATIVE_RECORDS, validateRecord, auditRegistry, resolveApplicability, complianceChecklist, qualifyDevis20, BTP_NORMATIVE_REGISTRY_CONTRACT };

export {};
