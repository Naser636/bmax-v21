#!/usr/bin/env node
"use strict";
/* V142 — EN 16931 BR-CO-18 strict conformance (research-driven P11 improvement). Source: EN 16931 business rules (confirmed
 * via real research — invoicenavigator.eu / infinite-it.com, 2026): an invoice SHALL have ≥1 VAT breakdown group (BG-23),
 * even at 0%. ODG's default slice treats absence as non-error; opts.enforceBR_CO_18 enforces full conformance WITHOUT changing
 * the default. Locks: default unchanged (back-compat), strict flags a missing breakdown, a present breakdown passes strict. */
const V = require("./einvoice-validator.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const INV = () => ({ id: "I", issueDate: "2026-11-12", currency: "EUR", seller: { name: "S" }, buyer: { name: "B" }, lines: [{ id: "l", netMinor: 15000 }], totals: { lineNetSumMinor: 15000, taxExclusiveMinor: 15000, vatMinor: 3000, taxInclusiveMinor: 18000 } });
const findings = (r: any) => (r.report ? r.report.findings : []);

function main() {
  // DEFAULT (back-compat): a missing VAT breakdown is NOT an error in the lenient slice.
  const d = V.validateInvoice(INV());
  check("DEFAULT: missing VAT breakdown ⇒ still valid (lenient slice preserved, back-compat)", d.report.valid === true && !findings(d).some((f: any) => f.id === "BR-CO-18"));

  // STRICT: a missing VAT breakdown ⇒ BR-CO-18 HIGH finding, invoice invalid.
  const s = V.validateInvoice(INV(), { enforceBR_CO_18: true });
  check("STRICT: missing VAT breakdown ⇒ BR-CO-18 HIGH + invalid (EN 16931 conformance)", s.report.valid === false && findings(s).some((f: any) => f.id === "BR-CO-18" && f.severity === "HIGH"));

  // STRICT + a well-formed breakdown ⇒ valid (BR-CO-18 satisfied; BR-CO-17/14 still verified).
  const ok = V.validateInvoice({ ...INV(), vatBreakdown: [{ categoryCode: "S", rateBps: 2000, taxableMinor: 15000, taxMinor: 3000 }] }, { enforceBR_CO_18: true });
  check("STRICT + present consistent breakdown ⇒ valid (BR-CO-18 satisfied)", ok.report.valid === true && !findings(ok).some((f: any) => f.id === "BR-CO-18"));

  // STRICT + an EMPTY breakdown array ⇒ still BR-CO-18 (at least ONE group required).
  const empty = V.validateInvoice({ ...INV(), vatBreakdown: [] }, { enforceBR_CO_18: true });
  check("STRICT + empty breakdown array ⇒ BR-CO-18 (≥1 group required)", findings(empty).some((f: any) => f.id === "BR-CO-18"));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — EN 16931 BR-CO-18 strict conformance (opt-in; default lenient preserved; ≥1 VAT breakdown enforced) [real research]" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
