#!/usr/bin/env node
"use strict";
/* V147 MÉTIER 2 — document-intelligence battery (SYNTHETIC BTP/TP documents, labelled ≠ real). Proves the vertical slice:
 * extraction (field provenance+confidence, no invention, no faked OCR) → devis→commande→facture→BL reconciliation reusing
 * order-coherence-check → explicit states MATCHED/MISMATCH/PARTIAL/DUPLICATE/MISSING_DATA/NOT_TRACEABLE. Covers the 7
 * directive demo dossiers + malformed/refusal cases. READ-ONLY: books/pays/emits nothing. */
const D = require("./document-intelligence.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const QUOTE = `TYPE: QUOTE
DOC_NUMBER: D-2026-001
SUPPLIER: BTP Mat SARL
CLIENT: Dupont SA
CHANTIER: CH-07
ISSUE_DATE: 2026-10-20
CURRENCY: EUR
LINE: id=L1; desc=Beton C25; qty=10; unit=m3; unitPriceMinor=12000; netMinor=120000
LINE: id=L2; desc=Main oeuvre; qty=8; unit=h; unitPriceMinor=5000; netMinor=40000
TOTAL_HT_MINOR: 160000
TAX_MINOR: 32000
TOTAL_TTC_MINOR: 192000`;
const INVOICE = `TYPE: INVOICE
DOC_NUMBER: F-2026-001
SUPPLIER: BTP Mat SARL
CLIENT: Dupont SA
QUOTE_REF: D-2026-001
CHANTIER: CH-07
ISSUE_DATE: 2026-11-01
CURRENCY: EUR
LINE: id=L1; desc=Beton C25; qty=10; unit=m3; unitPriceMinor=12000; netMinor=120000
LINE: id=L2; desc=Main oeuvre; qty=8; unit=h; unitPriceMinor=5000; netMinor=40000
TOTAL_HT_MINOR: 160000
TAX_MINOR: 32000
TOTAL_TTC_MINOR: 192000`;
const codes = (r: any) => r.anomalies.map((a: any) => a.code);

function main() {
  // --- EXTRACTION stage ---
  const ex = D.extractDocument(QUOTE);
  check("extraction: ok, docType QUOTE, docNumber, 2 lines", ex.ok === true && ex.docType === "QUOTE" && ex.docNumber === "D-2026-001" && ex.lines.length === 2);
  check("extraction: each field carries raw+normalized+confidence+provenance", ex.fields.totalTtcMinor.raw === "192000" && ex.fields.totalTtcMinor.normalized === 192000 && ex.fields.totalTtcMinor.confidence === "HIGH" && /line \d+/.test(ex.fields.totalTtcMinor.provenance));
  check("extraction: line self-consistency checked (qty*unitPrice=net)", ex.lines[0].selfConsistent === true && ex.lines[0].netMinor === 120000);
  check("extraction: unknown label ignored, not guessed", ex.fields.foo === undefined);
  check("extraction: absent field is absent (never invented)", ex.fields.dueDate === undefined);

  // honest OCR boundary: image/scan without text ⇒ refusal, not a faked extraction.
  check("OCR refusal: image without text ⇒ OCR_NOT_AVAILABLE (not faked)", D.extractDocument({ format: "image/jpg" }).code === "OCR_NOT_AVAILABLE");
  check("OCR boundary: image WITH supplied text ⇒ extracts", D.extractDocument({ format: "pdf-scan", text: "TYPE: INVOICE\nDOC_NUMBER: X" }).ok === true);
  check("empty payload ⇒ EMPTY_INPUT (fail-closed)", D.extractDocument("").code === "EMPTY_INPUT" && D.extractDocument(null).code === "EMPTY_INPUT");

  // --- RECONCILIATION: the 7 directive demo dossiers ---
  check("D1 coherent dossier ⇒ MATCHED, 0 anomalies, PROPOSE_ACCEPT", (() => { const r = D.reconcileDossier({ quote: QUOTE, invoice: INVOICE }); return r.status === "MATCHED" && r.anomalies.length === 0 && /PROPOSE_ACCEPT/.test(r.decision); })());

  check("D2 quantity gap (BL under-delivered) ⇒ PARTIAL", (() => {
    const bl = `TYPE: DELIVERY\nDOC_NUMBER: BL-1\nLINE: id=L1; qty=6; unit=m3\nLINE: id=L2; qty=8; unit=h`;
    const r = D.reconcileDossier({ quote: QUOTE, invoice: INVOICE, delivery: bl });
    return r.status === "PARTIAL" && r.delivery.status === "PARTIAL" && codes(r).indexOf("PARTIAL") >= 0;
  })());

  check("D3 price gap (line + total drift) ⇒ MISMATCH", (() => {
    const inv = INVOICE.replace("netMinor=40000", "netMinor=55000").replace("TOTAL_HT_MINOR: 160000", "TOTAL_HT_MINOR: 175000").replace("TOTAL_TTC_MINOR: 192000", "TOTAL_TTC_MINOR: 210000").replace("TAX_MINOR: 32000", "TAX_MINOR: 35000");
    const r = D.reconcileDossier({ quote: QUOTE, invoice: inv });
    return r.status === "MISMATCH" && codes(r).indexOf("TOTAL_DRIFT") >= 0 && codes(r).indexOf("LINE_AMOUNT_DRIFT") >= 0;
  })());

  check("D4 duplicated invoice ⇒ DUPLICATE", (() => { const r = D.reconcileDossier({ quote: QUOTE, invoice: INVOICE, priorInvoiceNumbers: ["F-2026-001"] }); return r.status === "DUPLICATE" && codes(r).indexOf("DUPLICATE") >= 0; })());

  check("D5 incomplete delivery note (missing line) ⇒ PARTIAL (NOT_DELIVERED)", (() => {
    const bl = `TYPE: DELIVERY\nDOC_NUMBER: BL-2\nLINE: id=L1; qty=10; unit=m3`;
    const r = D.reconcileDossier({ quote: QUOTE, invoice: INVOICE, delivery: bl });
    return r.status === "PARTIAL" && r.delivery.lines.some((l: any) => l.id === "L2" && l.state === "NOT_DELIVERED");
  })());

  check("D6 illisible/absent field ⇒ MISSING_DATA (not invented)", (() => {
    const inv = INVOICE.replace("TOTAL_TTC_MINOR: 192000", "TOTAL_TTC_MINOR: ~illegible~");
    const r = D.reconcileDossier({ quote: QUOTE, invoice: inv });
    return r.status === "MISSING_DATA" && codes(r).indexOf("MISSING_DATA") >= 0 && /HOLD_FOR_HUMAN_REVIEW/.test(r.decision);
  })());

  check("D7 tax/total incoherence ⇒ MISMATCH (INVOICE_INVALID via EN 16931 BR-CO-15)", (() => {
    const inv = INVOICE.replace("TAX_MINOR: 32000", "TAX_MINOR: 99999");
    const r = D.reconcileDossier({ quote: QUOTE, invoice: inv });
    return r.status === "MISMATCH" && codes(r).indexOf("INVOICE_INVALID") >= 0;
  })());

  // traceability + reconciliation reuse + fail-closed
  check("missing chantier ⇒ NOT_TRACEABLE", (() => { const r = D.reconcileDossier({ quote: QUOTE, invoice: INVOICE.replace("CHANTIER: CH-07\n", "") }); return r.status === "NOT_TRACEABLE"; })());
  check("unquoted (billed-but-not-quoted) line ⇒ MISMATCH", (() => {
    const inv = INVOICE + "\nLINE: id=L3; desc=Extra; qty=1; unit=u; unitPriceMinor=5000; netMinor=5000";
    const r = D.reconcileDossier({ quote: QUOTE, invoice: inv.replace("TOTAL_HT_MINOR: 160000", "TOTAL_HT_MINOR: 165000").replace("TOTAL_TTC_MINOR: 192000", "TOTAL_TTC_MINOR: 197000").replace("TAX_MINOR: 32000", "TAX_MINOR: 32000") });
    return r.status === "MISMATCH" && codes(r).indexOf("UNQUOTED_LINE") >= 0;
  })());
  check("reconciliation delegates to order-coherence-check (findings carried through)", (() => { const inv = INVOICE.replace("QUOTE_REF: D-2026-001", "QUOTE_REF: WRONG"); return D.reconcileDossier({ quote: QUOTE, invoice: inv }).coherence.findings.some((f: any) => f.code === "NOT_TRACEABLE"); })());
  check("missing core document (no invoice) ⇒ MISSING_DATA (fail-closed)", D.reconcileDossier({ quote: QUOTE }).status === "MISSING_DATA");
  check("garbage dossier ⇒ MISSING_DATA, no throw", D.reconcileDossier(null).status === "MISSING_DATA");
  check("READ-ONLY: note states it books/pays/emits nothing", (() => { const r = D.reconcileDossier({ quote: QUOTE, invoice: INVOICE }); return /books\/pays\/emits nothing/.test(r.note); })());

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — document-intelligence (extraction w/ provenance+confidence, no faked OCR; devis→cmd→facture→BL reconciliation reusing order-coherence-check; MATCHED/MISMATCH/PARTIAL/DUPLICATE/MISSING_DATA/NOT_TRACEABLE; read-only)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
