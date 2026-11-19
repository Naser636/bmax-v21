#!/usr/bin/env node
"use strict";
/*
 * FRENCH INVOICE PRE-CHECK — mandatory-mention completeness + fiscal consistency, composing the FR fiscal cluster.
 * PURE, deterministic, READ-ONLY-compose. MODIFIES NOTHING.
 *
 *  - odg-fr-identifier-validation.validateSiret : seller SIRET checksum (Luhn)
 *  - odg-fr-vat.vatBreakdown                    : recompute VAT from the lines (internal consistency)
 *  - odg-fr-payment-terms.checkTermCompliance   : payment term vs the LME ceiling
 *
 * This complements einvoice-validator (which checks the EN 16931 CORE structural/calc rules) with the distinctly-FRENCH
 * mandatory legal mentions (mentions obligatoires: seller SIRET, payment term, late-penalty rate mention, €40 recovery
 * indemnity mention) + the checksum/consistency those modules compute. It is the consumer that ties the fiscal cluster.
 *
 * THE HONESTY BOUNDARY (inherited from every module it composes): this is a COMPLETENESS + CHECKSUM + internal-CONSISTENCY
 * PRE-CHECK — NOT a legal-compliance CERTIFICATION. A `ready:true` means the structural/computable requirements are met;
 * it does NOT assert the invoice is legally valid, that the SIRET entity EXISTS, that the VAT RATE legally applies, or
 * that the term is lawful in a specific sector — those are professional/accountant determinations. No network/clock/randomness.
 */

const SIRET = require("./odg-fr-identifier-validation.js");
const VAT = require("./odg-fr-vat.js");
const TERMS = require("./odg-fr-payment-terms.js");

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function isPosInt(v: any): boolean { return isNonNegInt(v) && v > 0; }
function freeze(o: any): any { return Object.freeze(o); }

const MANDATORY_FIELDS = Object.freeze(["sellerName", "sellerSiret", "buyerName", "invoiceNumber", "issueDate", "paymentTermDays"]);

/**
 * precheckInvoice(invoice) -> { ok, ready, checks[], computed, note }.
 * invoice = { sellerName, sellerSiret, buyerName, invoiceNumber, issueDate, paymentTermDays,
 *   lineItems:[{ label?, qty, unitPriceHTMinor, vatRateBps }], statedTotalVatMinor?,
 *   penaltyRateMentionPresent?:bool, indemnityMentionPresent?:bool }.
 * ready = every HIGH-severity check passes. READ-ONLY: composes the three FR modules; computes totals; asserts no legality.
 */
function precheckInvoice(invoice: any): any {
  const i = invoice !== null && typeof invoice === "object" ? invoice : {};
  const checks: any[] = [];
  const add = (name: string, pass: boolean, severity: string, detail: string) => checks.push(freeze({ name, pass, severity, detail }));

  // 1) mandatory-mention field presence
  const missing = MANDATORY_FIELDS.filter((f) => i[f] === undefined || i[f] === null || i[f] === "");
  add("mandatory-fields", missing.length === 0, "HIGH", missing.length ? `missing: ${missing.join(", ")}` : "all present");

  // 2) seller SIRET checksum (compose #731) — valid checksum ≠ entity exists
  let siret: any = null;
  if (isStr(i.sellerSiret)) { siret = SIRET.validateSiret(i.sellerSiret); add("siret-checksum", siret.ok === true && siret.valid === true, "HIGH", siret.ok && siret.valid ? "well-formed (checksum OK — NOT a confirmation the company exists)" : (siret.reason || "invalid")); }
  else add("siret-checksum", false, "HIGH", "sellerSiret absent");

  // 3) VAT consistency (compose #732): recompute from lines; compare to stated VAT if provided
  let computed: any = { totalHTMinor: null, totalVatMinor: null, totalTTCMinor: null };
  const lines = Array.isArray(i.lineItems) ? i.lineItems : [];
  if (lines.length === 0) add("line-items", false, "HIGH", "no line items");
  else {
    const vatLines: any[] = []; let badLine = -1;
    for (let k = 0; k < lines.length; k++) { const l = lines[k];
      if (!(l && typeof l === "object") || !isNonNegInt(l.qty) || !isNonNegInt(l.unitPriceHTMinor) || !isNonNegInt(l.vatRateBps)) { badLine = k; break; }
      const net = l.qty * l.unitPriceHTMinor;
      if (!Number.isSafeInteger(net)) { badLine = k; break; }
      vatLines.push({ netMinor: net, rateBps: l.vatRateBps });
    }
    if (badLine >= 0) add("line-items", false, "HIGH", `line ${badLine} invalid (qty/unitPriceHTMinor/vatRateBps must be non-negative safe integers)`);
    else {
      add("line-items", true, "HIGH", `${lines.length} valid lines`);
      const bd = VAT.vatBreakdown(vatLines);
      if (bd.ok !== true) add("vat-consistency", false, "HIGH", bd.code || "vat breakdown failed");
      else {
        computed = { totalHTMinor: bd.totals.netMinor, totalVatMinor: bd.totals.vatMinor, totalTTCMinor: bd.totals.grossMinor, byRate: bd.byRate };
        if (isNonNegInt(i.statedTotalVatMinor)) add("vat-consistency", i.statedTotalVatMinor === bd.totals.vatMinor, "HIGH", i.statedTotalVatMinor === bd.totals.vatMinor ? "stated VAT matches recomputed" : `stated VAT ${i.statedTotalVatMinor} ≠ recomputed ${bd.totals.vatMinor}`);
        else add("vat-consistency", true, "MEDIUM", "no stated VAT to cross-check; recomputed from lines");
      }
    }
  }

  // 4) payment term vs LME ceiling (compose #733)
  if (isPosInt(i.paymentTermDays)) { const c = TERMS.checkTermCompliance(i.paymentTermDays); add("lme-term-ceiling", c.ok === true && c.compliant === true, "HIGH", c.ok ? c.reason : "bad term"); }
  else add("lme-term-ceiling", false, "HIGH", "paymentTermDays absent/invalid");

  // 5) mandatory legal mentions present (presence only — the wording/rate is the caller's)
  add("penalty-rate-mention", i.penaltyRateMentionPresent === true, "HIGH", i.penaltyRateMentionPresent === true ? "present" : "late-penalty rate mention required (B2B) and not flagged present");
  add("indemnity-mention", i.indemnityMentionPresent === true, "HIGH", i.indemnityMentionPresent === true ? "present" : "€40 recovery-indemnity mention required (B2B) and not flagged present");

  const ready = checks.filter((c: any) => c.severity === "HIGH").every((c: any) => c.pass);
  return freeze({ ok: true, ready, checks: freeze(checks), computed: freeze(computed),
    failing: freeze(checks.filter((c: any) => !c.pass).map((c: any) => c.name)),
    note: "COMPLETENESS + CHECKSUM + internal-CONSISTENCY pre-check (composes the FR fiscal cluster; complements EN 16931 structural validation). ready:true ⇒ structural/computable requirements met — NOT a legal-compliance certification: it does NOT assert the invoice is legally valid, the SIRET entity exists, the VAT rate legally applies, or the term is lawful for the sector." });
}

const FR_INVOICE_COMPLIANCE_CONTRACT = Object.freeze({
  id: "FR-INVOICE-COMPLIANCE",
  purpose: "French invoice mandatory-mention completeness + fiscal-consistency PRE-CHECK composing SIRET/VAT/LME-term; complements EN 16931 structural validation",
  reuses: Object.freeze(["odg-fr-identifier-validation.validateSiret", "odg-fr-vat.vatBreakdown", "odg-fr-payment-terms.checkTermCompliance"]),
  invariants: Object.freeze([
    "composes the three FR fiscal modules and MODIFIES NONE — a consumer, not a new fiscal engine",
    "a PRE-CHECK: COMPLETENESS (mandatory mentions) + CHECKSUM (SIRET) + internal CONSISTENCY (VAT recompute, LME ceiling)",
    "ready:true is NOT a legal-compliance CERTIFICATION — it does NOT assert legal validity, entity existence, VAT-rate applicability, or sector lawfulness (professional determinations)",
    "SIRET checksum ≠ existence; VAT recompute ≠ correct-rate; term ≤ ceiling ≠ lawful-in-sector — each disclaimed",
    "PURE + deterministic; no network/clock/randomness; fail-closed per composed module",
  ]),
});

module.exports = { MANDATORY_FIELDS, precheckInvoice, FR_INVOICE_COMPLIANCE_CONTRACT };
export {};
