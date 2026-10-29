#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves PRODUCT D6 SLICE 4: interoperable CII/UBL export FROM the validated model, with a
// reproducible round-trip (model→XML→re-parse→re-validate). Fail-closed: export gated on EN16931-core validity; XML text
// escaped (injection-safe); money rendered exactly from integer minor. Composes validator+parser; no new primitive.
"use strict";
const assert = require("assert");
const X = require("./einvoice-export.js");
const P = require("./einvoice-parser.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const valid = () => ({ id: "INV-1", issueDate: "2026-10-29", currency: "EUR", seller: { name: "Seller SARL" }, buyer: { name: "Buyer SAS" },
  lines: [{ id: 1, netMinor: 120000 }, { id: 2, netMinor: 80000 }], totals: { lineNetSumMinor: 200000, taxExclusiveMinor: 200000, vatMinor: 40000, taxInclusiveMinor: 240000 } });

// (1) CII round-trip: mapped fields equal AND re-validates.
{
  const r = X.exportAndVerify(valid(), { format: "CII" });
  ok("CII export round-trips equal + re-validates EN16931-core", r.ok && r.roundTripEqual === true && r.revalidationValid === true && r.diff === null);
}
// (2) UBL round-trip.
{
  const r = X.exportAndVerify(valid(), { format: "UBL" });
  ok("UBL export round-trips equal + re-validates", r.ok && r.roundTripEqual === true && r.revalidationValid === true);
}
// (3) export is GATED on validity: a model that violates BR-CO-15 is REFUSED (no XML emitted).
{
  const bad = valid(); bad.totals.taxInclusiveMinor = 999999;   // BT-112 ≠ BT-109 + BT-110
  const b = X.buildInvoiceXml(bad, { format: "CII" });
  const e = X.exportAndVerify(bad, { format: "CII" });
  ok("invalid model (BR-CO-15) ⇒ INVALID_MODEL, no XML, findings surfaced (fail-closed)",
     b.ok === false && b.code === "INVALID_MODEL" && Array.isArray(b.findings) && b.findings.length > 0 && e.ok === false);
}
// (4) XML INJECTION safety: special chars in a party name are escaped, well-formed, and round-trip to the EXACT name.
{
  const m = valid(); m.seller.name = 'Acme <script> & "Co" \'x\'';
  const r = X.exportAndVerify(m, { format: "CII" });
  // the raw XML must not contain an unescaped '<script>' breaking structure; the re-parsed name must equal the original.
  ok("special chars in name ⇒ escaped, well-formed, round-trips to the exact original name (injection-safe)",
     r.ok && /&lt;script&gt;/.test(r.xml) && !/<script>/.test(r.xml) && r.roundTripEqual === true && r.reparsed.seller === 'Acme <script> & "Co" \'x\'');
}
// (5) money rendered EXACTLY from integer minor (no float): tiny + round amounts.
{
  const m = { id: "INV-2", issueDate: "2026-10-29", currency: "EUR", seller: { name: "S" }, buyer: { name: "B" },
    lines: [{ id: 1, netMinor: 5 }, { id: 2, netMinor: 100 }], totals: { lineNetSumMinor: 105, taxExclusiveMinor: 105, vatMinor: 0, taxInclusiveMinor: 105 } };
  const b = X.buildInvoiceXml(m, { format: "CII" });
  const r = X.exportAndVerify(m, { format: "CII" });
  ok("integer-minor money rendered exactly (5⇒'0.05', 100⇒'1.00') and round-trips", b.ok && />0\.05</.test(b.xml) && />1\.00</.test(b.xml) && r.roundTripEqual === true && r.reparsed.lines[0] === 5 && r.reparsed.lines[1] === 100);
}
// (6) fail-closed inputs.
{
  ok("missing model ⇒ fail-closed; bad format ⇒ UNSUPPORTED_FORMAT",
     X.buildInvoiceXml(null).ok === false && X.buildInvoiceXml(valid(), { format: "XML" }).code === "UNSUPPORTED_FORMAT");
}
// (7) emitted XML is recognised by the parser as the declared format (interop with our own reader at minimum).
{
  const cii = X.buildInvoiceXml(valid(), { format: "CII" });
  const ubl = X.buildInvoiceXml(valid(), { format: "UBL" });
  ok("parser detects emitted CII as CII and emitted UBL as UBL", P.parseInvoiceXml(cii.xml).format === "CII" && P.parseInvoiceXml(ubl.xml).format === "UBL");
}
// (8) projection is strict — different models project differently (round-trip equality is a real comparison, not vacuous).
{
  const a = X.projection(valid()); const b = valid(); b.totals.vatMinor = 41000; b.totals.taxInclusiveMinor = 241000;
  ok("projection distinguishes models (equality check is meaningful)", JSON.stringify(a) !== JSON.stringify(X.projection(b)));
}
// (9) honest scope: SUPPORTED_SUBSET + KNOWN_GAPS present and disclose NOT-certified / not-full-EN16931.
{
  const b = X.buildInvoiceXml(valid(), { format: "CII" });
  ok("export discloses supported subset + known gaps (not a certified Plateforme Agréée, not full EN16931)",
     b.supportedSubset.length > 0 && b.knownGaps.some((g) => /Plateforme Agréée|full EN16931/i.test(g)));
}

// (10) AUDIT caveat (documented, FAIL-SAFE): a name containing a rival-format marker makes the re-parse mis-sniff ⇒
// roundTripEqual=false WITH a populated diff — conservative (never a false "true"), ok stays true.
{
  const m = valid(); m.seller.name = "Acme CrossIndustryInvoice Ltd";   // UBL doc whose text carries the CII marker
  const r = X.exportAndVerify(m, { format: "UBL" });
  ok("rival-format marker in a name ⇒ fail-safe roundTripEqual=false + diff (never a false pass)",
     r.ok === true && r.roundTripEqual === false && r.diff !== null);
}
// (11) AUDIT caveat (documented, FAIL-SAFE): whitespace-padded name re-parses stripped ⇒ roundTripEqual=false, not a false pass.
{
  const m = valid(); m.seller.name = "  Padded Seller  ";
  const r = X.exportAndVerify(m, { format: "CII" });
  ok("whitespace-padded name ⇒ fail-safe roundTripEqual=false (parser strips; conservative, diff reported)",
     r.ok === true && r.roundTripEqual === false && r.diff !== null && r.reparsed.seller === "Padded Seller");
}

// (12) BG-23 VAT breakdown round-trips through CII AND UBL (export→parse→validate), breakdown preserved exactly.
{
  const m = { ...valid(), vatBreakdown: [{ categoryCode: "S", rateBps: 2000, taxableMinor: 200000, taxMinor: 40000 }] };   // valid()=20% on 200000⇒40000=BT-110
  const cii = X.exportAndVerify(m, { format: "CII" });
  const ubl = X.exportAndVerify(m, { format: "UBL" });
  ok("BG-23 breakdown round-trips CII+UBL (equal + re-validates, breakdown preserved)",
     cii.roundTripEqual === true && ubl.roundTripEqual === true &&
     JSON.stringify(cii.reparsed.vatBreakdown) === JSON.stringify([{ categoryCode: "S", rateBps: 2000, taxableMinor: 200000, taxMinor: 40000 }]));
}
// (13) multi-category breakdown (20% + 5.5%) round-trips with exact rates (rateBps 2000 / 550).
{
  const m = { id: "INV-M", issueDate: "2026-10-29", currency: "EUR", seller: { name: "S" }, buyer: { name: "B" },
    lines: [{ id: 1, netMinor: 15000 }], totals: { lineNetSumMinor: 15000, taxExclusiveMinor: 15000, vatMinor: 1550, taxInclusiveMinor: 16550 },
    vatBreakdown: [{ categoryCode: "S", rateBps: 2000, taxableMinor: 5000, taxMinor: 1000 }, { categoryCode: "AA", rateBps: 550, taxableMinor: 10000, taxMinor: 550 }] };
  const r = X.exportAndVerify(m, { format: "UBL" });
  ok("multi-category BG-23 (20%+5.5%) round-trips with exact rateBps 2000/550", r.roundTripEqual === true && r.reparsed.vatBreakdown.length === 2 && r.reparsed.vatBreakdown[1].rateBps === 550);
}
// (14) absence: a model without a breakdown still round-trips (vatBreakdown null both sides — backward compatible).
{
  const r = X.exportAndVerify(valid(), { format: "CII" });
  ok("no breakdown ⇒ still round-trips, projection vatBreakdown null (backward compatible)", r.roundTripEqual === true && r.reparsed.vatBreakdown === null);
}
// (15) fail-closed: export refuses a breakdown with a negative amount (non-negative export subset) ⇒ INVALID_MODEL.
{
  const m = { ...valid(), vatBreakdown: [{ categoryCode: "S", rateBps: 2000, taxableMinor: -20000, taxMinor: -4000 }] };
  const b = X.buildInvoiceXml(m, { format: "CII" });
  ok("negative breakdown amount ⇒ INVALID_MODEL (export is the non-negative subset; no XML emitted)", b.ok === false && b.code === "INVALID_MODEL");
}

console.log(`\nEINVOICE-EXPORT suite — ${pass} assertions passed. (CII+UBL export from validated model; round-trip model→XML→parse→validate; export gated on validity; XML-escaped injection-safe; exact integer-minor money; fail-closed; honest subset)`);
