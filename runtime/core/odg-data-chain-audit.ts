#!/usr/bin/env node
"use strict";
/*
 * V217 §6 — DATA-CHAIN QUALIFICATION MATRIX. PURE, READ-ONLY, deterministic. This is the §3 qualification matrix as an
 * inspectable artifact: for each existing data chain it records the verified end-to-end path, the composing modules, the
 * REAL non-test consumers, the fail-closed / provenance / dedup / real-vs-synthetic controls, the honesty-ladder status,
 * and the honest limits. It BUILDS NOTHING new — no pipeline, extractor, registry or dashboard — it only projects facts
 * established by a code audit (grep of requires + module contracts) dated 2026-11-16. It is a DATED AUDIT SNAPSHOT, NOT a
 * live integration checker: if consumers change, re-run the audit — this file does not re-derive them at runtime.
 *
 * HARD HONESTY (§3): a passing SYNTHETIC test does NOT prove real-world data quality; a technically-correct EXTRACTION
 * does NOT prove the economic or legal correctness of the content. Statuses use the ladder and are never inferred upward.
 * Two honest findings are recorded (renovation-quote-normalize NOT_INTEGRATED; native binary .xlsx ABSENT) — neither is a
 * code defect: the first is a product-D8 activation decision, the second a dependency decision; both OWNER_GATED. Dual export.
 */

const AUDIT_DATE = "2026-11-16";
const PROVENANCE = "V217 §6 code audit (require-graph + module contracts) on 2026-11-16";

// Ladder (never inferred upward): DOCUMENTED < BUILT < TESTED < INTEGRATED < INDEPENDENTLY_INSPECTED < ACCEPTED < OPERATIONAL < DEPLOYED < REAL_WORLD_VALIDATED.
const CHAINS = Object.freeze([
  Object.freeze({ id: "external-input-ingestion", stage: "INGESTION/ADMISSION GATE",
    path: "SOURCE → declared real/synthetic → provenance-independence → content-digest integrity → duplicate(digest) → real/synthetic separation → label-independence(eval) → audit record → accept/REJECT",
    modules: ["external-input-ingestion", "evidence-provenance", "broad-it-eval-ingest"], consumers: ["(admission gate; unblocks register items only on REAL_ADMITTED)"],
    controls: "deny-by-default; self-authored 'real' REJECTED (never downgraded to a synthetic PASS); content-digest tamper detection; idempotent dedup by digest",
    status: "INTEGRATED", classification: "A", realVsSynthetic: "explicit declaredReal boolean required; NO synthetic ever unblocks a MEASURED/real item",
    limits: "writes nothing; grants no authority; a REAL admission still only means eligible-to-unblock, not validated" }),
  Object.freeze({ id: "document-intelligence", stage: "DOCUMENT EXTRACTION + RECONCILIATION (M2 BTP)",
    path: "devis → commande → facture → bon de livraison → rapprochement (REUSES order-coherence-check; EN 16931 shape)",
    modules: ["document-intelligence", "order-coherence-check"], consumers: ["2 non-test consumers (verified)"],
    controls: "fail-closed MISSING_DATA when quote+invoice absent; integer minor-unit arithmetic", status: "INTEGRATED", classification: "A",
    realVsSynthetic: "tested on synthetic fixtures — a correct extraction does NOT prove the real content is accurate",
    limits: "reconciliation ≠ accounting certification; QUOTE/ORDER/INVOICE/DELIVERY/RECEIPT types only" }),
  Object.freeze({ id: "einvoice-chain", stage: "PDF → FACTUR-X → PARSE → VALIDATE",
    path: "PDF(pdf-extract, sha256, bounded) → embedded XML(factur-x-extract) → parse(einvoice-parser, format detect) → validate(einvoice-validator, EN 16931 subset)",
    modules: ["pdf-extract", "factur-x-extract", "einvoice-parser", "einvoice-validator"],
    consumers: ["einvoice-validator → order-coherence-check, einvoice-export, einvoice-workflow-demonstrator (verified imports)", "einvoice-parser → factur-x-extract, einvoice-export, einvoice-workflow-demonstrator (verified imports)"],
    controls: "MANDATORY-field fail-closed; EXACT integer minor units (floats rejected via Number.isSafeInteger, no silent rounding); count invariant validCount+invalidCount+errorCount===count; bounded MAX_PDF/MAX_INFLATE (zip-bomb guard)",
    status: "INTEGRATED", classification: "A", realVsSynthetic: "validates STRUCTURE/arithmetic — NOT the legal/tax truth of the invoice content",
    limits: "the VALIDATION layer (parser/validator) is import-consumed; the UPSTREAM extractors (pdf-extract, factur-x-extract) have NO non-test import consumer — the live PDF-ingestion front-end is test-only (p11-document-routing composes the chain's output SHAPES by argument, it does not import the extractors). SUPPORTED_SUBSET of EN 16931 with declared KNOWN_GAPS; synthetic corpus, no real-world invoice corpus measured" }),
  Object.freeze({ id: "economic-extractor", stage: "ECONOMIC FIELD EXTRACTION",
    path: "structured source → jsonPointer selection → decimalToMinor (exact) → economic fields",
    modules: ["economic-extractor"], consumers: ["capability-executors, prove-the-number-demonstrator (verified)"],
    controls: "exact decimal→minor conversion (no float drift)", status: "INTEGRATED", classification: "A",
    realVsSynthetic: "extracts declared figures — does NOT verify they are economically correct",
    limits: "selection/conversion only; semantic correctness of the number is the source's responsibility" }),
  Object.freeze({ id: "data-connector", stage: "TABULAR INGESTION (CSV/JSON)",
    path: "text payload(synthetic, labelled) → parse CSV/JSON → fieldMap → schema+6-dim quality(REUSES profession-p4-data-reference incl. timeliness) → dedup → anomaly report",
    modules: ["data-connector", "profession-p4-data-reference"], consumers: ["data-quality engine (feeds existing P4)"],
    controls: "fail-closed on malformed (INVALID_JSON / never partial silent success); duplicate detection; READ-ONLY (never writes/fetches)",
    status: "INTEGRATED", classification: "A", realVsSynthetic: "synthetic/labelled data only; a quality PASS on synthetic rows is not a real-data guarantee",
    limits: "CSV + JSON text ONLY" }),
  Object.freeze({ id: "renovation-quote-normalize", stage: "PRODUCT D8 — energy-renovation quote normalization/comparison",
    path: "raw devis → canonical model(renovation-quote/1) → EXACT BigInt line/total recompute + cross-check(fail-closed) → category compare (refuses 'cheapest' on differing scope/incomplete data)",
    modules: ["renovation-quote-normalize", "evidence-provenance"], consumers: ["NONE (no canonical non-test consumer)"],
    controls: "fail-closed on total mismatch (never silently corrected); MaPrimeRénov'/CEE + compliance pass through 'declared, unverified' (never computed); integrity digest via evidence-provenance",
    status: "BUILT_TESTED_NOT_INTEGRATED", classification: "C", realVsSynthetic: "prices are client-supplied figures only, recomputed in BigInt — never invented",
    limits: "FINDING: no canonical consumer — Product D8 not activated. Activation is a PRODUCT decision (OWNER_GATED), NOT a code defect; module itself is correct + fail-closed." }),
]);

// Cross-cutting + honest gaps.
const FINDINGS = Object.freeze([
  Object.freeze({ id: "renovation-quote-normalize-not-integrated", severity: "LOW", classification: "C",
    statement: "renovation-quote-normalize (Product D8) is BUILT+TESTED but has NO canonical consumer; activation is an OWNER_GATED product decision, not a code defect. NOT force-wired (that would fabricate integration).",
    action: "OWNER_GATED — activate D8 as a product flow, then wire to its real consumer." }),
  Object.freeze({ id: "no-native-xlsx-binary-parser", severity: "LOW", classification: "D",
    statement: "No native binary .xlsx parser exists in core — tabular ingestion is CSV/JSON (data-connector) only. Adding an xlsx binary parser is a DEPENDENCY decision (OWNER_GATED), not a reproducible defect.",
    action: "OWNER_GATED — decide whether a vetted xlsx parsing dependency is warranted; until then 'Excel' = export-to-CSV then data-connector." }),
  Object.freeze({ id: "pdf-extractors-test-only-consumed", severity: "LOW", classification: "C",
    statement: "pdf-extract and factur-x-extract have NO non-test import consumer: the live PDF→Factur-X ingestion front-end is exercised only by tests. The downstream validation layer (einvoice-parser/einvoice-validator) IS genuinely import-consumed. p11-document-routing composes the chain's output SHAPES passed as arguments; it does not import the extractors.",
    action: "wire the PDF-ingestion front-end to a real caller WHEN an authorized document-ingestion flow is activated (OWNER_GATED product decision); not force-wired here — modules are correct + fail-closed." }),
]);

/* audit() -> the §3 qualification matrix as a dated snapshot. Certifies no real-world data quality. */
function audit(): any {
  const integrated = CHAINS.filter((c: any) => c.status === "INTEGRATED").map((c: any) => c.id);
  const notIntegrated = CHAINS.filter((c: any) => c.status !== "INTEGRATED").map((c: any) => c.id);
  return Object.freeze({
    asOf: AUDIT_DATE, provenance: PROVENANCE,
    total: CHAINS.length, chains: CHAINS,
    summary: Object.freeze({
      integratedCount: integrated.length, integratedIds: Object.freeze(integrated),
      notIntegratedCount: notIntegrated.length, notIntegratedIds: Object.freeze(notIntegrated),
      classification: "mostly A (complete coverage, integrated) + 1×C (D8 not activated) + 1×D (no xlsx dep)",
    }),
    findings: FINDINGS,
    honesty: "DATED audit snapshot, NOT a live checker. A passing SYNTHETIC test does NOT prove real-world data quality; a technically-correct EXTRACTION does NOT prove the economic/legal correctness of the content. No chain certifies real data quality. No build was manufactured: the two findings are OWNER_GATED decisions, not code defects.",
  });
}

const DATA_CHAIN_AUDIT_CONTRACT = Object.freeze({
  id: "V217-DATA-CHAIN-AUDIT",
  purpose: "§6/§3 — qualification matrix over EXISTING data chains; audit-only, builds no new pipeline/extractor",
  invariants: Object.freeze([
    "READ-ONLY projection of verified audit facts; no new pipeline/extractor/registry/dashboard; dated snapshot (not a live checker)",
    "honesty ladder never inferred upward; synthetic-test PASS ≠ real data quality; correct extraction ≠ correct content",
    "renovation-quote-normalize recorded NOT_INTEGRATED (D8 not activated) — NOT force-wired (no fabricated integration)",
    "native .xlsx binary parser ABSENT recorded as an OWNER_GATED dependency decision, not a reproducible defect",
    "deterministic; dual export; composes nothing beyond referencing existing module facts",
  ]),
});

module.exports = { CHAINS, FINDINGS, audit, DATA_CHAIN_AUDIT_CONTRACT };
export {};
