#!/usr/bin/env node
"use strict";
/* V145 MÉTIER 2 — order-to-cash coherence battery (SYNTHETIC data, clearly labelled — never a real client/result). Proves the
 * differentiator: a coherent devis↔facture passes; each incoherence (total drift, missing line, unquoted line, line drift,
 * order mismatch, invalid invoice, missing traceability) is detected as a concrete explainable finding; fail-closed on a
 * missing document; integer-minor arithmetic (no float drift). */
const O = require("./order-coherence-check.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const INV = (over: any = {}) => Object.assign({ id: "INV-1", issueDate: "2026-11-12", currency: "EUR", seller: { name: "S" }, buyer: { name: "B" }, quoteRef: "Q-1", lines: [{ id: "L1", netMinor: 10000 }, { id: "L2", netMinor: 5000 }], totals: { lineNetSumMinor: 15000, taxExclusiveMinor: 15000, vatMinor: 3000, taxInclusiveMinor: 18000 } }, over);
const QUOTE = (over: any = {}) => Object.assign({ id: "Q-1", acceptedTotalMinor: 18000, lines: [{ id: "L1", netMinor: 10000 }, { id: "L2", netMinor: 5000 }] }, over);
const codes = (r: any) => r.findings.map((f: any) => f.code);

function main() {
  check("coherent devis↔facture (totals + lines + traceable) ⇒ coherent, 0 findings", O.checkCoherence({ quote: QUOTE(), invoice: INV() }).coherent === true && O.checkCoherence({ quote: QUOTE(), invoice: INV() }).findingCount === 0);

  check("C1 total drift (quote 17000 vs invoice 18000) ⇒ TOTAL_DRIFT", codes(O.checkCoherence({ quote: QUOTE({ acceptedTotalMinor: 17000 }), invoice: INV() })).includes("TOTAL_DRIFT"));
  check("C2 quoted line not billed ⇒ MISSING_LINE", codes(O.checkCoherence({ quote: QUOTE({ lines: [{ id: "L1", netMinor: 10000 }, { id: "L2", netMinor: 5000 }, { id: "L3", netMinor: 0 }] }), invoice: INV() })).includes("MISSING_LINE"));
  check("C3 invoice line never quoted ⇒ UNQUOTED_LINE", codes(O.checkCoherence({ quote: QUOTE({ lines: [{ id: "L1", netMinor: 10000 }] }), invoice: INV() })).includes("UNQUOTED_LINE"));
  check("C4 line billed ≠ quoted ⇒ LINE_AMOUNT_DRIFT", codes(O.checkCoherence({ quote: QUOTE({ lines: [{ id: "L1", netMinor: 9000 }, { id: "L2", netMinor: 5000 }] }), invoice: INV() })).includes("LINE_AMOUNT_DRIFT"));
  check("C5 order total ≠ quote ⇒ ORDER_MISMATCH", codes(O.checkCoherence({ quote: QUOTE(), order: { totalMinor: 19000 }, invoice: INV() })).includes("ORDER_MISMATCH"));
  check("C6 invalid invoice (totals inconsistent) ⇒ INVOICE_INVALID surfaced", codes(O.checkCoherence({ quote: QUOTE({ acceptedTotalMinor: 18001 }), invoice: INV({ totals: { lineNetSumMinor: 15000, taxExclusiveMinor: 15000, vatMinor: 3000, taxInclusiveMinor: 18001 } }) })).includes("INVOICE_INVALID"));
  check("C7 invoice not referencing quote ⇒ NOT_TRACEABLE", codes(O.checkCoherence({ quote: QUOTE(), invoice: INV({ quoteRef: "WRONG" }) })).includes("NOT_TRACEABLE"));

  // fail-closed: a missing document is never assumed coherent.
  check("missing invoice ⇒ CANNOT_VERIFY (fail-closed, not coherent)", O.checkCoherence({ quote: QUOTE() }).coherent === false && codes(O.checkCoherence({ quote: QUOTE() })).includes("CANNOT_VERIFY"));
  check("garbage input ⇒ CANNOT_VERIFY, no throw", O.checkCoherence(null).coherent === false && O.checkCoherence({}).findingCount === 1);

  // integer-minor arithmetic: equal totals (no float) ⇒ coherent (no spurious drift).
  check("integer-minor equal totals ⇒ no spurious drift (exact)", O.checkCoherence({ quote: QUOTE({ acceptedTotalMinor: 18000 }), invoice: INV() }).findings.every((f: any) => f.code !== "TOTAL_DRIFT"));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — order-coherence-check (devis↔facture coherence; 7 incoherence classes detected; fail-closed; integer-minor; synthetic demo ≠ real result)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
