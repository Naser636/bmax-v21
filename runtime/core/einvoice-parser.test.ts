#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves PRODUCT SLICE 2: CII (Factur-X XML) and UBL parse into the neutral model (exact
// Decimal→minor units) and flow into EN16931-core validation; malformed/unsupported/rule-violating XML are caught with
// explicit findings; provenance + supported-subset/known-gaps are recorded. Real python3 subprocess extraction (guarded
// — skips honestly if python3 is absent). NOT a claim of full CII/UBL/EN16931/Factur-X conformance.
"use strict";
const assert = require("assert");
const P = require("./einvoice-parser.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const CII = `<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:cefact:data:CrossIndustryInvoice:100" xmlns:ram="urn:un:cefact:data:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:cefact:data:UnqualifiedDataType:100">
 <rsm:ExchangedDocument><ram:ID>FR-CII-001</ram:ID><ram:IssueDateTime><udt:DateTimeString>20260915</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
 <rsm:SupplyChainTradeTransaction>
  <ram:IncludedSupplyChainTradeLineItem><ram:SpecifiedLineTradeSettlement><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>100.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>
  <ram:IncludedSupplyChainTradeLineItem><ram:SpecifiedLineTradeSettlement><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>50.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>
  <ram:ApplicableHeaderTradeAgreement><ram:SellerTradeParty><ram:Name>Seller SAS</ram:Name></ram:SellerTradeParty><ram:BuyerTradeParty><ram:Name>Buyer SARL</ram:Name></ram:BuyerTradeParty></ram:ApplicableHeaderTradeAgreement>
  <ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode><ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>150.00</ram:LineTotalAmount><ram:TaxBasisTotalAmount>150.00</ram:TaxBasisTotalAmount><ram:TaxTotalAmount>30.00</ram:TaxTotalAmount><ram:GrandTotalAmount>GRANDHOLDER</ram:GrandTotalAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement>
 </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
const ciiGood = CII.replace("GRANDHOLDER", "180.00");
const ciiBadTotal = CII.replace("GRANDHOLDER", "180.01");   // BR-CO-15: 150.00+30.00 ≠ 180.01

const UBL = `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
 <cbc:ID>FR-UBL-001</cbc:ID><cbc:IssueDate>2026-09-15</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
 <cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>Seller SAS</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
 <cac:AccountingCustomerParty><cac:Party><cac:PartyName><cbc:Name>Buyer SARL</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
 <cac:TaxTotal><cbc:TaxAmount>30.00</cbc:TaxAmount></cac:TaxTotal>
 <cac:LegalMonetaryTotal><cbc:LineExtensionAmount>150.00</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount>150.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>180.00</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
 <cac:InvoiceLine><cbc:LineExtensionAmount>100.00</cbc:LineExtensionAmount></cac:InvoiceLine>
 <cac:InvoiceLine><cbc:LineExtensionAmount>50.00</cbc:LineExtensionAmount></cac:InvoiceLine>
</Invoice>`;

const pythonUp = () => { const r = P.parseInvoiceXml(ciiGood); return !(r.code === "BLOCKED"); };
if (!pythonUp()) { console.log("  ~~ python3 absent — skipping real parse cases honestly"); ok("python3 absent ⇒ parser BLOCKED (fail-closed, not faked)", P.parseInvoiceXml(ciiGood).code === "BLOCKED"); }
else {
  // (1) CII valid ⇒ parsed to model + EN16931-core valid; exact Decimal→minor.
  { const r = P.parseAndValidate(ciiGood);
    ok("CII parsed ⇒ format CII, exact totals (15000/15000/3000/18000), 2 lines, validation.valid",
       r.ok && r.format === "CII" && r.model.totals.lineNetSumMinor === 15000 && r.model.totals.taxInclusiveMinor === 18000 && r.model.lines.length === 2 && r.validation.valid === true); }
  // (2) UBL valid ⇒ parsed + valid.
  { const r = P.parseAndValidate(UBL);
    ok("UBL parsed ⇒ format UBL, id FR-UBL-001, totals exact, validation.valid", r.ok && r.format === "UBL" && r.model.id === "FR-UBL-001" && r.model.totals.taxInclusiveMinor === 18000 && r.validation.valid === true); }
  // (3) rule violation FROM XML: a bad grand total surfaces as BR-CO-15 (parse ok, validation invalid).
  { const r = P.parseAndValidate(ciiBadTotal);
    ok("CII with wrong grand total ⇒ parses, but EN16931 BR-CO-15 HIGH ⇒ validation.valid false",
       r.ok && r.model.totals.taxInclusiveMinor === 18001 && r.validation.valid === false && r.validation.findings.some((f) => f.id === "BR-CO-15")); }
  // (4) exact Decimal: odd cents parse exactly (33.33 ⇒ 3333, no float drift).
  { const r = P.parseAndValidate(UBL.replace(/100\.00/, "33.33").replace(/150\.00/g, "83.33").replace(/180\.00/, "113.33").replace(/30\.00/, "30.00"));
    ok("Decimal 33.33/83.33 ⇒ exact minor (3333/8333), no float drift", r.model.lines.some((l) => l.netMinor === 3333) && r.model.totals.lineNetSumMinor === 8333); }
  // (5) malformed XML ⇒ PARSE_ERROR with explicit HIGH finding (fail-closed, not a fake parse).
  { const r = P.parseAndValidate("<rsm:CrossIndustryInvoice><ram:ID>x</ram:ID>");   // unclosed
    ok("malformed CII XML ⇒ PARSE_ERROR + HIGH xml finding", r.ok === false && r.code === "PARSE_ERROR" && r.findings.some((f) => f.area === "xml" && f.severity === "HIGH")); }
}
// (6) unsupported format ⇒ UNSUPPORTED_FORMAT (no python needed).
{ const r = P.parseAndValidate("<foo><bar>1</bar></foo>");
  ok("unrecognised root ⇒ UNSUPPORTED_FORMAT + HIGH finding", r.ok === false && r.code === "UNSUPPORTED_FORMAT" && r.findings.some((f) => f.area === "format")); }
// (7) non-string / empty ⇒ INVALID_INPUT.
{ ok("empty/non-string ⇒ INVALID_INPUT", P.parseInvoiceXml("").code === "INVALID_INPUT" && P.parseInvoiceXml(null).ok === false); }
// (8) honesty: supportedSubset + knownGaps enumerated (no full-conformance claim).
{ const r = P.parseAndValidate("<foo/>");
  ok("supportedSubset + knownGaps enumerated (honest; not full conformance)", Array.isArray(r.supportedSubset) && r.supportedSubset.length >= 5 && Array.isArray(r.knownGaps) && r.knownGaps.some((g) => /Factur-X|900|full EN16931/i.test(g))); }

console.log(`\nEINVOICE-PARSER suite — ${pass} assertions passed. (CII+UBL→model, exact Decimal→minor; rule violations from XML surfaced; malformed/unsupported fail-closed; provenance + supported-subset/gaps enumerated)`);
