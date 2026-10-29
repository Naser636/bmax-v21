#!/usr/bin/env node
/**
 * einvoice-export — PRODUCT D6 SLICE 4: generate interoperable e-invoice XML (CII or UBL) FROM the validated invoice
 * model — the inverse of einvoice-parser — and prove interoperability by ROUND-TRIP: model → XML → re-parse → re-validate.
 *
 * Fail-closed / honest (mandate D6):
 *  - EXPORT IS GATED ON VALIDITY: buildInvoiceXml refuses to emit XML for a model that fails EN16931-core validation
 *    (einvoice-validator) — we never produce a document that looks conformant from bad data. Returns INVALID_MODEL + findings.
 *  - money is rendered from EXACT integer minor units to 2dp (no float); text is XML-escaped (injection-safe, well-formed).
 *  - this emits the SUPPORTED SUBSET (the same business terms einvoice-parser maps), NOT a full EN16931 CII/UBL document,
 *    NOT a Factur-X PDF/A-3, NOT a certified Plateforme Agréée transmission. Enumerated SUPPORTED_SUBSET / KNOWN_GAPS.
 *  - exportAndVerify performs the real round-trip and reports whether the re-parsed model equals the source on mapped
 *    fields AND re-validates — a reproducible interoperability proof, not a self-asserted claim.
 * Composes einvoice-validator + einvoice-parser via their verified interfaces. NO new primitive. Deterministic
 * (XML build is pure; round-trip uses the parser's python3-stdlib reader, no network).
 */
"use strict";

const V = require("./einvoice-validator.js");
const P = require("./einvoice-parser.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isSafeNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function xmlEscape(s: any): string { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
/** render a non-negative integer minor amount as a 2-decimal string using integer math only (no float). */
function money(minor: number): string { const w = Math.trunc(minor / 100); const f = minor - w * 100; return `${w}.${String(f).padStart(2, "0")}`; }

const SUPPORTED_SUBSET = Object.freeze(["BT-1 id", "BT-2 issueDate", "BT-5 currency", "seller.name (BT-27)", "buyer.name (BT-44)", "BT-131 line nets", "BT-106/109/110/112 totals"]);
const KNOWN_GAPS = Object.freeze([
  "party tax ids (SIREN/VAT), addresses, VAT breakdown lines (BG-23), allowances/charges detail",
  "CII date is emitted verbatim (not reformatted to UNCL-2379 format-102 YYYYMMDD) — a documented subset simplification",
  "no Factur-X PDF/A-3 embedding; no schema (XSD) / Schematron validation of the emitted XML",
  "NOT a certified Plateforme Agréée transmission, NOT full EN16931 (900+ rules)",
  "exportAndVerify re-detects the format from the emitted XML (independent self-identification proof) and the parser strips whitespace in text: a legitimate invoice whose id/name contains a rival format's marker string, or a party name with leading/trailing spaces, yields roundTripEqual=false (fail-safe — conservative, never a false pass; the diff is reported)",
]);

/**
 * buildInvoiceXml(model, opts?): opts.format ∈ "CII" | "UBL" (default "CII"). Returns { ok, format, xml } or a
 * fail-closed { ok:false, code, findings }. Export is REFUSED unless the model passes EN16931-core validation.
 */
function buildInvoiceXml(model: any, opts: any = {}): any {
  const format = String(opts.format || "CII").toUpperCase();
  if (format !== "CII" && format !== "UBL") return { ok: false, code: "UNSUPPORTED_FORMAT", reason: "format must be CII or UBL" };
  const v = V.validateInvoice(model);
  if (!v.ok) return { ok: false, code: v.code || "INVALID_INPUT", reason: v.reason };
  if (!v.report.valid) return { ok: false, code: "INVALID_MODEL", reason: "model fails EN16931-core validation; refusing to emit a document that would look conformant from invalid data", findings: v.report.findings };
  // amounts must be integer minor (validator already enforces, but guard before rendering).
  const t = model.totals || {};
  for (const k of ["lineNetSumMinor", "taxExclusiveMinor", "vatMinor", "taxInclusiveMinor"]) if (!isSafeNonNegInt(t[k])) return { ok: false, code: "INVALID_MODEL", reason: `totals.${k} must be a safe non-negative integer minor amount` };
  for (const ln of model.lines) if (!isSafeNonNegInt(ln.netMinor)) return { ok: false, code: "INVALID_MODEL", reason: "each line netMinor must be a safe non-negative integer minor amount" };
  // optional BG-23 breakdown: emit only when present; export is the NON-NEGATIVE subset (negative credit-note amounts
  // are a documented gap), so every breakdown amount/rate must be a safe non-negative integer.
  const bd: any[] | null = Array.isArray(model.vatBreakdown) && model.vatBreakdown.length ? model.vatBreakdown : null;
  if (bd) for (const b of bd) if (!isSafeNonNegInt(b.taxableMinor) || !isSafeNonNegInt(b.taxMinor) || !isSafeNonNegInt(b.rateBps)) return { ok: false, code: "INVALID_MODEL", reason: "each vatBreakdown entry needs safe non-negative integer taxableMinor, taxMinor and rateBps" };

  const cur = xmlEscape(model.currency);
  const id = xmlEscape(model.id);
  const issue = xmlEscape(model.issueDate);
  const sName = xmlEscape(model.seller.name);
  const bName = xmlEscape(model.buyer.name);
  let xml: string;
  if (format === "CII") {
    const lineItems = model.lines.map((ln: any, i: number) =>
      `    <ram:IncludedSupplyChainTradeLineItem>\n      <ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>\n      <ram:SpecifiedLineTradeSettlement><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${money(ln.netMinor)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement>\n    </ram:IncludedSupplyChainTradeLineItem>`).join("\n");
    // money() renders value/100 to 2dp — reused for rateBps (2000⇒"20.00", 550⇒"5.50") since rateBps is bps where 10000=100%.
    const ciiTax = bd ? bd.map((b: any) => `      <ram:ApplicableTradeTax>\n        <ram:CalculatedAmount>${money(b.taxMinor)}</ram:CalculatedAmount>\n        <ram:TypeCode>VAT</ram:TypeCode>\n        <ram:BasisAmount>${money(b.taxableMinor)}</ram:BasisAmount>\n        <ram:CategoryCode>${xmlEscape(b.categoryCode)}</ram:CategoryCode>\n        <ram:RateApplicablePercent>${money(b.rateBps)}</ram:RateApplicablePercent>\n      </ram:ApplicableTradeTax>\n`).join("") : "";
    xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">\n  <rsm:ExchangedDocument>\n    <ram:ID>${id}</ram:ID>\n    <ram:IssueDateTime><udt:DateTimeString>${issue}</udt:DateTimeString></ram:IssueDateTime>\n  </rsm:ExchangedDocument>\n  <rsm:SupplyChainTradeTransaction>\n${lineItems}\n    <ram:ApplicableHeaderTradeAgreement>\n      <ram:SellerTradeParty><ram:Name>${sName}</ram:Name></ram:SellerTradeParty>\n      <ram:BuyerTradeParty><ram:Name>${bName}</ram:Name></ram:BuyerTradeParty>\n    </ram:ApplicableHeaderTradeAgreement>\n    <ram:ApplicableHeaderTradeSettlement>\n      <ram:InvoiceCurrencyCode>${cur}</ram:InvoiceCurrencyCode>\n${ciiTax}      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>\n        <ram:LineTotalAmount>${money(t.lineNetSumMinor)}</ram:LineTotalAmount>\n        <ram:TaxBasisTotalAmount>${money(t.taxExclusiveMinor)}</ram:TaxBasisTotalAmount>\n        <ram:TaxTotalAmount>${money(t.vatMinor)}</ram:TaxTotalAmount>\n        <ram:GrandTotalAmount>${money(t.taxInclusiveMinor)}</ram:GrandTotalAmount>\n      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>\n    </ram:ApplicableHeaderTradeSettlement>\n  </rsm:SupplyChainTradeTransaction>\n</rsm:CrossIndustryInvoice>\n`;
  } else {
    const lineItems = model.lines.map((ln: any, i: number) =>
      `  <cac:InvoiceLine>\n    <cbc:ID>${i + 1}</cbc:ID>\n    <cbc:LineExtensionAmount currencyID="${cur}">${money(ln.netMinor)}</cbc:LineExtensionAmount>\n  </cac:InvoiceLine>`).join("\n");
    // document TaxAmount (BT-110) FIRST, then per-category TaxSubtotals (so the parser's "first TaxAmount in TaxTotal" stays BT-110).
    const ublSub = bd ? bd.map((b: any) => `\n    <cac:TaxSubtotal>\n      <cbc:TaxableAmount currencyID="${cur}">${money(b.taxableMinor)}</cbc:TaxableAmount>\n      <cbc:TaxAmount currencyID="${cur}">${money(b.taxMinor)}</cbc:TaxAmount>\n      <cac:TaxCategory><cbc:ID>${xmlEscape(b.categoryCode)}</cbc:ID><cbc:Percent>${money(b.rateBps)}</cbc:Percent></cac:TaxCategory>\n    </cac:TaxSubtotal>`).join("") : "";
    xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">\n  <cbc:ID>${id}</cbc:ID>\n  <cbc:IssueDate>${issue}</cbc:IssueDate>\n  <cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>\n  <cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>${sName}</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>\n  <cac:AccountingCustomerParty><cac:Party><cac:PartyName><cbc:Name>${bName}</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>\n  <cac:TaxTotal><cbc:TaxAmount currencyID="${cur}">${money(t.vatMinor)}</cbc:TaxAmount>${ublSub}</cac:TaxTotal>\n  <cac:LegalMonetaryTotal>\n    <cbc:LineExtensionAmount currencyID="${cur}">${money(t.lineNetSumMinor)}</cbc:LineExtensionAmount>\n    <cbc:TaxExclusiveAmount currencyID="${cur}">${money(t.taxExclusiveMinor)}</cbc:TaxExclusiveAmount>\n    <cbc:TaxInclusiveAmount currencyID="${cur}">${money(t.taxInclusiveMinor)}</cbc:TaxInclusiveAmount>\n  </cac:LegalMonetaryTotal>\n${lineItems}\n</Invoice>\n`;
  }
  return { ok: true, format, xml, supportedSubset: SUPPORTED_SUBSET, knownGaps: KNOWN_GAPS };
}

/** mapped-field projection used for round-trip equality (the exact business terms the parser maps). */
function projection(m: any): any {
  if (!isObj(m)) return null;
  const t = isObj(m.totals) ? m.totals : {};
  return {
    id: m.id ?? null, issueDate: m.issueDate ?? null, currency: m.currency ?? null,
    seller: (isObj(m.seller) ? m.seller.name : null) ?? null,
    buyer: (isObj(m.buyer) ? m.buyer.name : null) ?? null,
    lines: Array.isArray(m.lines) ? m.lines.map((l: any) => (l && l.netMinor) ?? null) : null,
    totals: { lineNetSumMinor: t.lineNetSumMinor ?? null, taxExclusiveMinor: t.taxExclusiveMinor ?? null, vatMinor: t.vatMinor ?? null, taxInclusiveMinor: t.taxInclusiveMinor ?? null },
    vatBreakdown: Array.isArray(m.vatBreakdown) ? m.vatBreakdown.map((b: any) => ({ categoryCode: b.categoryCode ?? null, rateBps: b.rateBps ?? null, taxableMinor: b.taxableMinor ?? null, taxMinor: b.taxMinor ?? null })) : null,
  };
}

/**
 * exportAndVerify(model, opts?): export → re-parse → re-validate; a reproducible interoperability round-trip proof.
 * Returns { ok, format, xml, roundTripEqual, reparsed, revalidationValid, diff }. roundTripEqual is true ONLY when the
 * re-parsed model equals the source on every mapped field AND the re-parsed model re-validates EN16931-core.
 */
function exportAndVerify(model: any, opts: any = {}): any {
  const built = buildInvoiceXml(model, opts);
  if (!built.ok) return built;
  const parsed = P.parseInvoiceXml(built.xml, {});
  if (!parsed.ok) return { ok: false, code: "ROUNDTRIP_PARSE_FAILED", format: built.format, xml: built.xml, findings: parsed.findings };
  const want = projection(model), got = projection(parsed.model);
  const wantS = JSON.stringify(want), gotS = JSON.stringify(got);
  const reval = V.validateInvoice(parsed.model);
  const revalidationValid = !!(reval.ok && reval.report.valid);
  const roundTripEqual = wantS === gotS && revalidationValid;
  return { ok: true, format: built.format, xml: built.xml, roundTripEqual, revalidationValid, reparsed: got, diff: roundTripEqual ? null : { want, got }, note: "Interoperability round-trip: model→XML→re-parse→re-validate. roundTripEqual requires mapped-field equality AND re-validation. Supported subset only; NOT a certified transmission." };
}

export { buildInvoiceXml, exportAndVerify, projection, SUPPORTED_SUBSET, KNOWN_GAPS };
module.exports = { buildInvoiceXml, exportAndVerify, projection, SUPPORTED_SUBSET, KNOWN_GAPS };

if (require.main === module) {
  const model = { id: "INV-1", issueDate: "2026-10-29", currency: "EUR", seller: { name: "Seller SARL" }, buyer: { name: "Buyer SAS" },
    lines: [{ id: 1, netMinor: 120000 }, { id: 2, netMinor: 80000 }], totals: { lineNetSumMinor: 200000, taxExclusiveMinor: 200000, vatMinor: 40000, taxInclusiveMinor: 240000 } };
  const fmt = process.argv[2] === "UBL" ? "UBL" : "CII";
  const r = exportAndVerify(model, { format: fmt });
  process.stdout.write(JSON.stringify({ format: r.format, roundTripEqual: r.roundTripEqual, revalidationValid: r.revalidationValid }, null, 2) + "\n");
}
