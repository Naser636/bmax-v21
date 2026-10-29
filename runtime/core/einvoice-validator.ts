#!/usr/bin/env node
/**
 * einvoice-validator — PRODUCT SLICE 1 of `e-invoice-finance-operations`: a structured-invoice validator implementing
 * the EN 16931 CORE calculation business rules with EXACT integer money, plus mandatory-field and duplicate checks.
 * It is the honest, interoperable foundation for the French 2026 e-invoicing reform (structured Factur-X/UBL/CII,
 * EN 16931 Confort profile) — NOT a certified Plateforme de Dématérialisation Partenaire (PDP) / Plateforme Agréée;
 * ODG claims no official approval. VAT handling here is ARITHMETIC CONSISTENCY, not tax-law advice.
 *
 * Grounded (retrieved 2026-10-29):
 *   - France B2B e-invoicing: from 2026-09-01 all VAT-registered businesses must RECEIVE structured e-invoices; only
 *     structured formats (Factur-X/UBL/CII, EN 16931 Confort+) are accepted; B2B via approved platforms, B2G via Chorus Pro.
 *     (dddinvoices.com, eu-einvoicing.com, e-invoice.app — 2026-10-29)
 *   - EN 16931 calculation rules (peppolvalidator.com, invoicenavigator.eu, validatefin.com — 2026-10-29):
 *     BR-CO-10: Σ line net amounts (BT-131) == sum of line net (BT-106).
 *     BR-CO-13: total without VAT (BT-109) == BT-106 − document allowances (BT-107) + document charges (BT-108).
 *     BR-CO-15: total with VAT (BT-112) == BT-109 + total VAT (BT-110).
 *
 * Reuses economic-unit (exact integer minor units; same-currency enforcement, no float, no implicit FX). Findings use
 * the {id,area,severity,detail,remediation,evidence} shape (SARIF-emittable). Pure/deterministic. NO new primitive.
 */
"use strict";

const EU = require("./economic-unit.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isInt(n: any): boolean { return typeof n === "number" && Number.isInteger(n); }
function q(cur: string, minor: number): any { return EU.quantity(cur, EU.KIND.COST_UNIT, minor, 2); }

// mandatory EN 16931 business terms we check at this slice (subset of the Confort profile core).
const MANDATORY = [
  ["id", "BT-1 Invoice number"], ["issueDate", "BT-2 Issue date"], ["currency", "BT-5 Invoice currency"],
];

/**
 * validateInvoice(inv): inv = { id, issueDate, currency, seller:{name,siren?}, buyer:{name,siren?},
 *   lines:[{id, netMinor}], documentAllowancesMinor?, documentChargesMinor?,
 *   totals:{ lineNetSumMinor (BT-106), taxExclusiveMinor (BT-109), vatMinor (BT-110), taxInclusiveMinor (BT-112) } }.
 * Amounts are integer MINOR units (cents). Returns { ok, report:{ findings, summary, valid } }. Fail-closed.
 */
function validateInvoice(inv: any): any {
  if (!isObj(inv)) return { ok: false, code: "INVALID_INPUT", reason: "invoice object required" };
  const findings: any[] = [];
  const add = (id: string, area: string, severity: string, detail: string, remediation: string, evidence: string) => findings.push({ id, area, severity, detail, remediation, evidence });

  // ---- mandatory business terms ----
  for (const [field, bt] of MANDATORY) if (inv[field] === undefined || inv[field] === null || inv[field] === "") add(`mandatory:${field}`, "mandatory-field", "HIGH", `missing ${bt}`, `supply ${bt}`, `field '${field}' absent`);
  if (!isObj(inv.seller) || !inv.seller.name) add("mandatory:seller", "mandatory-field", "HIGH", "missing BG-4 Seller name (BT-27)", "supply the seller name", "seller.name absent");
  if (!isObj(inv.buyer) || !inv.buyer.name) add("mandatory:buyer", "mandatory-field", "HIGH", "missing BG-7 Buyer name (BT-44)", "supply the buyer name", "buyer.name absent");
  const lines = Array.isArray(inv.lines) ? inv.lines : [];
  if (lines.length === 0) add("mandatory:lines", "mandatory-field", "HIGH", "an invoice must have at least one line (BG-25)", "add at least one invoice line", "lines empty");

  const cur = typeof inv.currency === "string" && inv.currency ? inv.currency : null;
  const t = isObj(inv.totals) ? inv.totals : {};
  const intFields = { lineNetSumMinor: "BT-106", taxExclusiveMinor: "BT-109", vatMinor: "BT-110", taxInclusiveMinor: "BT-112" };
  let amountsOk = cur !== null;
  for (const [f, bt] of Object.entries(intFields)) if (!isInt((t as any)[f])) { add(`amount:${f}`, "amount-format", "HIGH", `${bt} missing or not an integer minor amount`, `supply ${bt} as integer minor units (cents)`, `totals.${f}=${(t as any)[f]}`); amountsOk = false; }
  for (const ln of lines) if (!isInt(ln && ln.netMinor)) { add(`amount:line`, "amount-format", "HIGH", "a line net amount (BT-131) is missing or not an integer minor amount", "supply each line netMinor as integer cents", `line ${ln && ln.id}`); amountsOk = false; }

  // ---- EN 16931 calculation rules (EXACT integer money; only when amounts are well-formed) ----
  if (amountsOk) {
    const allow = isInt(inv.documentAllowancesMinor) ? inv.documentAllowancesMinor : 0;
    const charge = isInt(inv.documentChargesMinor) ? inv.documentChargesMinor : 0;
    // BR-CO-10: Σ line nets == BT-106 (exact integer sum via economic-unit).
    let sum = q(cur as string, 0);
    for (const ln of lines) sum = EU.add(sum, q(cur as string, ln.netMinor));
    const bt106 = q(cur as string, t.lineNetSumMinor);
    if (EU.compare(sum, bt106) !== 0) add("BR-CO-10", "calculation", "HIGH", `BR-CO-10: Σ line net (${EU.format(sum)}) ≠ BT-106 sum of line net (${EU.format(bt106)})`, "correct BT-106 or the line nets so they sum exactly", `Σlines=${sum.minor} vs BT106=${t.lineNetSumMinor}`);
    // BR-CO-13: BT-109 == BT-106 − allowances + charges.
    const bt109expected = EU.add(EU.sub(bt106, q(cur as string, allow)), q(cur as string, charge));
    const bt109 = q(cur as string, t.taxExclusiveMinor);
    if (EU.compare(bt109expected, bt109) !== 0) add("BR-CO-13", "calculation", "HIGH", `BR-CO-13: BT-109 total w/o VAT (${EU.format(bt109)}) ≠ BT-106 − allowances + charges (${EU.format(bt109expected)})`, "correct BT-109 or the allowance/charge totals", `expected=${bt109expected.minor} vs BT109=${t.taxExclusiveMinor}`);
    // BR-CO-15: BT-112 == BT-109 + BT-110.
    const bt112expected = EU.add(bt109, q(cur as string, t.vatMinor));
    const bt112 = q(cur as string, t.taxInclusiveMinor);
    if (EU.compare(bt112expected, bt112) !== 0) add("BR-CO-15", "calculation", "HIGH", `BR-CO-15: BT-112 total w/ VAT (${EU.format(bt112)}) ≠ BT-109 + BT-110 VAT (${EU.format(bt112expected)})`, "correct BT-112 or the VAT total", `expected=${bt112expected.minor} vs BT112=${t.taxInclusiveMinor}`);
  }

  const high = findings.filter((f) => f.severity === "HIGH").length;
  return {
    ok: true,
    report: {
      invoiceId: inv.id || null, currency: cur,
      findings: findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "HIGH" ? -1 : 1)),
      findingCount: findings.length,
      // EN16931-core-valid = no HIGH finding. NOT a legal conformity statement / not a certified-platform validation.
      valid: high === 0,
      profile: "EN16931-core (mandatory BT subset + BR-CO-10/13/15); exact integer money",
      limits: [
        "validates the EN 16931 CORE calculation rules + a mandatory-field subset — NOT the full 900+ rule set",
        "this is interoperability validation, NOT a certified PDP/Plateforme Agréée and NOT tax-law advice",
        "VAT is checked for arithmetic CONSISTENCY (BR-CO-15), not for correct tax treatment",
        "amounts are EXACT integer minor units; floats are rejected (no silent rounding)",
      ],
      note: "EN 16931-core e-invoice validation with exact integer money. 'valid' = no HIGH rule violation at this slice; not a legal/certified conformity claim. Nothing retained; nothing sent.",
    },
  };
}

/** validateBatch(invoices): validate many + detect DUPLICATES by seller SIREN (or name) + invoice number (BT-1). */
function validateBatch(invoices: any): any {
  if (!Array.isArray(invoices)) return { ok: false, code: "INVALID_INPUT", reason: "invoices array required" };
  const seen = new Map<string, string>();
  const results: any[] = [];
  const duplicates: any[] = [];
  for (const inv of invoices) {
    const r = validateInvoice(inv);
    const key = `${(inv && inv.seller && (inv.seller.siren || inv.seller.name)) || "?"}|${(inv && inv.id) || "?"}`;
    if (inv && inv.id && seen.has(key)) duplicates.push({ invoiceId: inv.id, firstSeenAs: seen.get(key), key });
    else if (inv && inv.id) seen.set(key, inv.id);
    results.push(r.ok ? { invoiceId: inv && inv.id, valid: r.report.valid, findingCount: r.report.findingCount } : r);
  }
  return {
    ok: true,
    batch: {
      count: invoices.length,
      validCount: results.filter((x) => x.valid === true).length,
      invalidCount: results.filter((x) => x.valid === false).length,
      duplicates, duplicateCount: duplicates.length,
      results,
      note: "Batch EN16931-core validation + duplicate detection (seller SIREN/name + BT-1 invoice number). Duplicates surfaced, never netted away.",
    },
  };
}

export { validateInvoice, validateBatch, MANDATORY };
module.exports = { validateInvoice, validateBatch, MANDATORY };

if (require.main === module) {
  const demo = validateInvoice({
    id: "FR-2026-001", issueDate: "2026-09-15", currency: "EUR", seller: { name: "Seller SAS", siren: "123456789" }, buyer: { name: "Buyer SARL" },
    lines: [{ id: "1", netMinor: 10000 }, { id: "2", netMinor: 5000 }],
    totals: { lineNetSumMinor: 15000, taxExclusiveMinor: 15000, vatMinor: 3000, taxInclusiveMinor: 18000 },
  });
  process.stdout.write(JSON.stringify({ valid: demo.report.valid, findings: demo.report.findingCount }, null, 2) + "\n");
}
