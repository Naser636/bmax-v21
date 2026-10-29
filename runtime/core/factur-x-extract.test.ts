#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves PRODUCT SLICE 3: Factur-X PDF → bounded embedded-XML extraction (Node zlib, no
// PDF lib) → existing CII/UBL parser + EN16931-core validator. Valid Factur-X validates; not-PDF / no-embedded /
// ambiguous / too-large / malformed-embedded are all fail-closed with explicit findings; a wrong total in the embedded
// XML surfaces as BR-CO-15 (invalid); uncompressed embedded XML also works. Nothing executed; input untrusted.
// Fixtures are MINIMAL synthetic PDF containers exercising the extraction path (real-world PDF/A-3 robustness = gap).
"use strict";
const assert = require("assert");
const zlib = require("zlib");
const X = require("./factur-x-extract.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// minimal CII XML (reused shape): 100.00+50.00 net, 30.00 VAT, GRAND total placeholder.
const cii = (grand) => `<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:cefact:data:CrossIndustryInvoice:100" xmlns:ram="urn:un:cefact:data:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:cefact:data:UnqualifiedDataType:100"><rsm:ExchangedDocument><ram:ID>FX-1</ram:ID><ram:IssueDateTime><udt:DateTimeString>20260915</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument><rsm:SupplyChainTradeTransaction><ram:IncludedSupplyChainTradeLineItem><ram:SpecifiedLineTradeSettlement><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>100.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem><ram:IncludedSupplyChainTradeLineItem><ram:SpecifiedLineTradeSettlement><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>50.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem><ram:ApplicableHeaderTradeAgreement><ram:SellerTradeParty><ram:Name>Seller SAS</ram:Name></ram:SellerTradeParty><ram:BuyerTradeParty><ram:Name>Buyer SARL</ram:Name></ram:BuyerTradeParty></ram:ApplicableHeaderTradeAgreement><ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode><ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>150.00</ram:LineTotalAmount><ram:TaxBasisTotalAmount>150.00</ram:TaxBasisTotalAmount><ram:TaxTotalAmount>30.00</ram:TaxTotalAmount><ram:GrandTotalAmount>${grand}</ram:GrandTotalAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>`;
// build a minimal Factur-X-like PDF with embedded flate (or raw) streams carrying the given XML payloads.
const pdf = (payloads, { compress = true, name = "factur-x.xml" } = {}) => {
  let parts = [Buffer.from("%PDF-1.7\n", "latin1")];
  payloads.forEach((xml, i) => {
    const bytes = compress ? zlib.deflateSync(Buffer.from(xml, "latin1")) : Buffer.from(xml, "latin1");
    parts.push(Buffer.from(`${i + 1} 0 obj\n<< /Type /EmbeddedFile ${compress ? "/Filter /FlateDecode " : ""}/F (${name}) >>\nstream\n`, "latin1"), bytes, Buffer.from("\nendstream\nendobj\n", "latin1"));
  });
  parts.push(Buffer.from("%%EOF\n", "latin1"));
  return Buffer.concat(parts);
};

// (1) valid Factur-X PDF ⇒ extract + parse + EN16931-core valid.
{
  const r = X.ingestFacturX(pdf([cii("180.00")]));
  ok("valid Factur-X PDF ⇒ CII extracted (factur-x.xml, FlateDecode) + validation.valid",
     r.ok && r.stage === "validate" && r.format === "CII" && r.pdfProvenance.embeddedName === "factur-x.xml" && r.pdfProvenance.compressed === true && r.validation.valid === true);
}
// (2) wrong grand total in the embedded XML ⇒ parses but BR-CO-15 ⇒ invalid.
{
  const r = X.ingestFacturX(pdf([cii("180.01")]));
  ok("wrong embedded total ⇒ extracted + EN16931 BR-CO-15 HIGH ⇒ invalid", r.ok && r.validation.valid === false && r.validation.findings.some((f) => f.id === "BR-CO-15"));
}
// (3) uncompressed embedded XML also extracted.
{
  const r = X.ingestFacturX(pdf([cii("180.00")], { compress: false }));
  ok("uncompressed embedded XML ⇒ extracted + valid; compressed flag false", r.ok && r.validation.valid === true && r.pdfProvenance.compressed === false);
}
// (4) not a PDF ⇒ NOT_PDF fail-closed.
{
  ok("non-PDF input ⇒ NOT_PDF + HIGH finding", X.ingestFacturX(Buffer.from("<rsm:CrossIndustryInvoice/>")).code === "NOT_PDF");
}
// (5) PDF with NO embedded invoice ⇒ NO_EMBEDDED_INVOICE (a non-invoice flate stream is not a false candidate).
{
  const junk = Buffer.concat([Buffer.from("%PDF-1.7\n<< /Filter /FlateDecode >>\nstream\n", "latin1"), zlib.deflateSync(Buffer.from("page content BT /F1 12 Tf ET")), Buffer.from("\nendstream\n%%EOF", "latin1")]);
  ok("PDF with no embedded invoice ⇒ NO_EMBEDDED_INVOICE", X.ingestFacturX(junk).code === "NO_EMBEDDED_INVOICE");
}
// (6) TWO distinct embedded invoice payloads ⇒ AMBIGUOUS_EMBEDDED (never silently pick one).
{
  const r = X.ingestFacturX(pdf([cii("180.00"), cii("200.00")]));
  ok("two distinct embedded invoices ⇒ AMBIGUOUS_EMBEDDED (fail-closed)", r.code === "AMBIGUOUS_EMBEDDED");
}
// (7) malformed embedded XML ⇒ extracted but parser PARSE_ERROR (fail-closed downstream).
{
  const bad = "<rsm:CrossIndustryInvoice><ram:ID>x</ram:ID>";   // recognised as candidate (hint) but not well-formed
  const r = X.ingestFacturX(pdf([bad]));
  ok("malformed embedded XML ⇒ extract ok, parse stage PARSE_ERROR (fail-closed)", r.ok === false && r.stage === "extract" ? false : (r.code === "PARSE_ERROR" || (r.findings && r.findings.some((f) => f.area === "xml"))));
}
// (8) over-size PDF ⇒ TOO_LARGE (bounded input).
{
  const big = Buffer.concat([Buffer.from("%PDF-1.7\n", "latin1"), Buffer.alloc(X.MAX_PDF + 10, 0x20)]);
  ok("PDF over size bound ⇒ TOO_LARGE", X.ingestFacturX(big).code === "TOO_LARGE");
}
// (9) honesty: knownGaps enumerated (encrypted/object-stream/non-Flate), no full-conformance claim.
{
  const r = X.ingestFacturX(Buffer.from("not a pdf"));
  ok("knownGaps enumerated (encrypted/object-stream/non-Flate/PDF-A3 strictness)", Array.isArray(r.knownGaps) && r.knownGaps.some((g) => /encrypted|object stream|Flate|PDF\/A-3/i.test(g)));
}

console.log(`\nFACTUR-X-EXTRACT suite — ${pass} assertions passed. (PDF→embedded XML→parse→validate; FlateDecode+raw; not-PDF/no-embedded/ambiguous/too-large/malformed fail-closed; BR-CO-15 from embedded XML; bounded+untrusted; honest gaps)`);
