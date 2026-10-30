#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves PRODUCT SLICE 1 (e-invoice-finance-operations): EN 16931-core validation with
// EXACT integer money — a valid invoice passes; each of BR-CO-10/13/15 violations is caught as a HIGH finding; missing
// mandatory BTs are caught; a 1-cent rounding mismatch is caught (no silent rounding); duplicates are detected in a
// batch; floats are rejected. Honest: 'valid' = EN16931-core only, not a certified-platform / legal conformity claim.
"use strict";
const assert = require("assert");
const V = require("./einvoice-validator.js");
const SARIF = require("./sarif-report.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// a well-formed EN 16931 invoice: 2 lines (100.00 + 50.00) = 150.00 net; 20% VAT = 30.00; total 180.00.
const good = () => ({ id: "FR-2026-001", issueDate: "2026-09-15", currency: "EUR", seller: { name: "Seller SAS", siren: "123456789" }, buyer: { name: "Buyer SARL" },
  lines: [{ id: "1", netMinor: 10000 }, { id: "2", netMinor: 5000 }],
  totals: { lineNetSumMinor: 15000, taxExclusiveMinor: 15000, vatMinor: 3000, taxInclusiveMinor: 18000 } });

// (1) a well-formed invoice ⇒ valid, 0 findings.
{
  const r = V.validateInvoice(good());
  ok("well-formed EN 16931 invoice ⇒ valid, 0 findings", r.ok && r.report.valid === true && r.report.findingCount === 0);
}
// (2) BR-CO-10: line nets do not sum to BT-106 ⇒ HIGH.
{
  const inv = good(); inv.totals.lineNetSumMinor = 14999;   // Σ lines = 15000 ≠ 14999
  const r = V.validateInvoice(inv);
  ok("BR-CO-10 violation (line sum ≠ BT-106) ⇒ HIGH, invalid", r.report.findings.some((f) => f.id === "BR-CO-10" && f.severity === "HIGH") && r.report.valid === false);
}
// (3) BR-CO-13: BT-109 ≠ BT-106 − allowances + charges ⇒ HIGH.
{
  const inv = good(); inv.documentChargesMinor = 1000; /* expected BT-109 = 16000 */ // but totals.taxExclusiveMinor stays 15000
  const r = V.validateInvoice(inv);
  ok("BR-CO-13 violation (charges not reflected in BT-109) ⇒ HIGH", r.report.findings.some((f) => f.id === "BR-CO-13" && f.severity === "HIGH"));
}
// (4) BR-CO-15: 1-cent rounding mismatch in grand total ⇒ HIGH (exact money, no silent rounding).
{
  const inv = good(); inv.totals.taxInclusiveMinor = 18001;   // 15000 + 3000 = 18000 ≠ 18001
  const r = V.validateInvoice(inv);
  ok("BR-CO-15 1-cent mismatch ⇒ HIGH (exact integer money, no rounding slip)", r.report.findings.some((f) => f.id === "BR-CO-15" && f.severity === "HIGH") && r.report.valid === false);
}
// (5) missing mandatory business terms ⇒ HIGH each.
{
  const r = V.validateInvoice({ currency: "EUR", seller: {}, buyer: {}, lines: [], totals: { lineNetSumMinor: 0, taxExclusiveMinor: 0, vatMinor: 0, taxInclusiveMinor: 0 } });
  const ids = r.report.findings.map((f) => f.id);
  ok("missing BT-1/seller/buyer/lines ⇒ HIGH findings", ids.includes("mandatory:id") && ids.includes("mandatory:seller") && ids.includes("mandatory:buyer") && ids.includes("mandatory:lines") && r.report.valid === false);
}
// (6) float / non-integer amount ⇒ rejected (HIGH amount-format), never silently rounded.
{
  const inv = good(); inv.totals.vatMinor = 30.5;
  const r = V.validateInvoice(inv);
  ok("non-integer minor amount ⇒ HIGH amount-format (floats rejected)", r.report.findings.some((f) => f.area === "amount-format" && f.severity === "HIGH"));
}
// (7) duplicate detection across a batch (same seller SIREN + BT-1 invoice number).
{
  const r = V.validateBatch([good(), good(), { ...good(), id: "FR-2026-002" }]);
  ok("batch: duplicate invoice (same seller+number) detected; distinct one not flagged", r.batch.duplicateCount === 1 && r.batch.duplicates[0].invoiceId === "FR-2026-001" && r.batch.count === 3 && r.batch.validCount === 3);
}
// (7b) malformed inputs are COUNTED (errorCount), never silently dropped — valid+invalid+error === count.
// (null ⇒ validateInvoice ok:false INVALID_INPUT ⇒ errorCount; {} ⇒ ok:true valid:false ⇒ invalidCount; good ⇒ valid.)
{
  const r = V.validateBatch([null, {}, good()]);
  const b = r.batch;
  ok("batch: malformed input counted in errorCount; valid+invalid+error === count (none dropped)",
    b.errorCount === 1 && b.validCount === 1 && b.invalidCount === 1 && (b.validCount + b.invalidCount + b.errorCount) === b.count && b.count === 3);
}
// (8) findings emit valid SARIF 2.1.0 (interoperable with CI/code-scanning, like the other ODG products).
{
  const inv = good(); inv.totals.taxInclusiveMinor = 99999;
  const r = V.validateInvoice(inv);
  const s = SARIF.toSarif({ ok: true, project: "einvoice", findings: r.report.findings }, { toolName: "ODG-EInvoice-Validator", version: "1" });
  ok("e-invoice findings ⇒ valid SARIF 2.1.0 (BR-CO HIGH→error)", s.ok && SARIF.isValidSarif(s.sarif) && s.sarif.runs[0].results.some((x) => x.level === "error"));
}
// (9) honesty: limits present + no certified-platform claim.
{
  const r = V.validateInvoice(good());
  ok("limits disclose EN16931-core-only + NOT a certified PDP/legal conformity", r.report.limits.length >= 3 && r.report.limits.some((l) => /PDP|Plateforme|certified/i.test(l)) && /not a legal\/certified/i.test(r.report.note));
}

// (10) precision ceiling (audit caveat a): an amount > 2^53 is rejected (exact-money guarantee honest).
{
  const inv = good(); inv.totals.taxInclusiveMinor = 9007199254740993;   // 2^53 + 1 — unsafe integer
  const r = V.validateInvoice(inv);
  ok("amount > 2^53 ⇒ rejected (HIGH amount-format; exact-money not silently broken)", r.report.findings.some((f) => f.area === "amount-format" && f.severity === "HIGH"));
}
// (11) duplicate key namespaced (audit caveat b): a SIREN value does NOT cross-collide with a name value.
{
  const a = { ...good(), seller: { siren: "ACME" } }; const b = { ...good(), seller: { name: "ACME" } };
  const r = V.validateBatch([a, b]);
  ok("seller siren 'ACME' vs seller name 'ACME' with same invoice number ⇒ NOT a false duplicate", r.batch.duplicateCount === 0);
}

// (12) BG-23 VAT breakdown present + consistent ⇒ still valid (20% of 15000 = 3000 = BT-110).
{
  const inv = good(); inv.vatBreakdown = [{ categoryCode: "S", rateBps: 2000, taxableMinor: 15000, taxMinor: 3000 }];
  const r = V.validateInvoice(inv);
  ok("valid BG-23 breakdown (BR-CO-17 per-category + BR-CO-14 sum) ⇒ valid, 0 findings", r.ok && r.report.valid === true && r.report.findingCount === 0);
}
// (13) BR-CO-17: a category tax ≠ taxable × rate ⇒ HIGH.
{
  const inv = good(); inv.vatBreakdown = [{ categoryCode: "S", rateBps: 2000, taxableMinor: 15000, taxMinor: 2999 }];
  const r = V.validateInvoice(inv);
  ok("BR-CO-17: category tax ≠ taxable×rate ⇒ HIGH finding, invalid", r.report.findings.some((f) => f.id === "BR-CO-17") && r.report.valid === false);
}
// (14) BR-CO-14: Σ category tax ≠ BT-110 total VAT ⇒ HIGH (each entry self-consistent, only the sum is wrong).
{
  const inv = good(); inv.vatBreakdown = [{ categoryCode: "S", rateBps: 2000, taxableMinor: 12500, taxMinor: 2500 }];   // 2500 ≠ BT-110 3000
  const r = V.validateInvoice(inv);
  ok("BR-CO-14: Σ category tax (2500) ≠ BT-110 (3000) ⇒ HIGH, no spurious BR-CO-17", r.report.findings.some((f) => f.id === "BR-CO-14") && !r.report.findings.some((f) => f.id === "BR-CO-17") && r.report.valid === false);
}
// (15) fail-closed: a non-integer breakdown amount ⇒ amount-format HIGH (no silent rounding, breakdown not summed).
{
  const inv = good(); inv.vatBreakdown = [{ categoryCode: "S", rateBps: 2000, taxableMinor: 15000, taxMinor: 30.0001 }];
  const r = V.validateInvoice(inv);
  ok("BG-23 non-integer taxMinor ⇒ amount-format HIGH (fail-closed), invalid", r.report.findings.some((f) => f.area === "amount-format" && /vatBreakdown/.test(f.id)) && r.report.valid === false);
}

// (16) CREDIT-NOTE (negative BT-116): BR-CO-17 must round symmetrically (half-away-from-zero). True tax of
// -20000 × 55% = -11000 (exact). Correct value ⇒ NO BR-CO-17; off-by-one (-10999, the toward-zero-truncation bug) ⇒ BR-CO-17.
{
  const okNeg = { ...good(), vatBreakdown: [{ categoryCode: "S", rateBps: 5500, taxableMinor: -20000, taxMinor: -11000 }] };
  const badNeg = { ...good(), vatBreakdown: [{ categoryCode: "S", rateBps: 5500, taxableMinor: -20000, taxMinor: -10999 }] };
  const r1 = V.validateInvoice(okNeg); const r2 = V.validateInvoice(badNeg);
  ok("BR-CO-17 negative BT-116 (credit note): exact -11000 ⇒ no BR-CO-17; off-by-one -10999 ⇒ BR-CO-17 (symmetric rounding)",
     !r1.report.findings.some((f) => f.id === "BR-CO-17") && r2.report.findings.some((f) => f.id === "BR-CO-17"));
}

console.log(`\nEINVOICE-VALIDATOR suite — ${pass} assertions passed. (EN 16931-core: mandatory BTs + BR-CO-10/13/15; exact integer money, 1-cent mismatch caught; floats rejected; batch duplicate detection; valid SARIF; honest non-certified scope)`);
