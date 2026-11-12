#!/usr/bin/env node
"use strict";
/*
 * V147 MÉTIER 2 (BTP/TP business intelligence) — DOCUMENT INTELLIGENCE: EXTRACTION + CROSS-DOCUMENT RECONCILIATION.
 * PURE, deterministic, fail-closed. A first executable vertical slice on SYNTHETIC documents:
 *   devis (quote) → commande (order) → facture (invoice) → bon de livraison (delivery) → rapprochement.
 *
 * HONEST FORMAT BOUNDARY (directive §1.1): this repo has NO OCR engine and NO PDF rasteriser. So extraction operates on a
 * TEXT payload that represents an ALREADY-text-extracted document (what an OCR/pdf-to-text stage would hand over). Formats:
 *   - handled NOW: TEXT (labelled key:value + LINE rows). PDF/image/scan are handled ONLY if their text is already supplied.
 *   - identified as FUTURE (NOT performed here): OCR of images/scanned PDFs, native-PDF text layout extraction.
 * A payload declaring an image/scan without text ⇒ { ok:false, code:"OCR_NOT_AVAILABLE" } (never a faked extraction).
 *
 * The stages are kept SEPARATE and labelled: textExtraction (given) → parse → normalise → interpret/reconcile.
 * Every extracted field carries { raw, normalized, confidence, provenance }. Money is integer MINOR units (no float drift).
 * An absent/uncertain value is NEVER invented. Reconciliation REUSES order-coherence-check.ts (no duplication). This module
 * prepares data and proposes decisions; it writes nothing, books nothing, pays nothing, emits no invoice.
 */
const COH = require("./order-coherence-check.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string"; }
function isIntStr(v: string): boolean { return /^-?\d+$/.test(v.trim()); }

const DOC_TYPES = Object.freeze(["QUOTE", "ORDER", "INVOICE", "DELIVERY", "RECEIPT"]);
// canonical labels → field key. Each is explicit (confidence HIGH when matched); nothing is inferred from position.
const LABELS: Record<string, string> = {
  TYPE: "docType", DOC_NUMBER: "docNumber", SUPPLIER: "supplier", CLIENT: "client", QUOTE_REF: "quoteRef",
  ORDER_REF: "orderRef", CHANTIER: "chantier", PROJECT: "chantier", ISSUE_DATE: "issueDate", DUE_DATE: "dueDate",
  CURRENCY: "currency", TOTAL_HT_MINOR: "totalHtMinor", TAX_MINOR: "taxMinor", TOTAL_TTC_MINOR: "totalTtcMinor",
};
const MONEY_KEYS = Object.freeze(["totalHtMinor", "taxMinor", "totalTtcMinor"]);

function field(raw: any, normalized: any, confidence: string, provenance: string): any {
  return Object.freeze({ raw, normalized, confidence, provenance });
}

// parse a "LINE: id=L1; desc=...; qty=10; unit=m3; unitPriceMinor=12000; netMinor=120000" row.
function parseLine(body: string, lineNo: number): any {
  const parts = body.split(";").map((p: string) => p.trim()).filter((p: string) => p.length > 0);
  const kv: Record<string, string> = {};
  for (const p of parts) { const eq = p.indexOf("="); if (eq > 0) kv[p.slice(0, eq).trim()] = p.slice(eq + 1).trim(); }
  const issues: string[] = [];
  const num = (k: string): number | null => { const v = kv[k]; if (v === undefined) return null; if (!isIntStr(v)) { issues.push(`line@${lineNo}: ${k}='${v}' not an integer (kept raw, not coerced)`); return null; } return parseInt(v, 10); };
  const qty = kv.qty !== undefined && /^-?\d+(\.\d+)?$/.test(kv.qty) ? Number(kv.qty) : null;
  if (kv.qty !== undefined && qty === null) issues.push(`line@${lineNo}: qty='${kv.qty}' not numeric`);
  const netMinor = num("netMinor");
  const unitPriceMinor = num("unitPriceMinor");
  // coherence cross-check within the line itself (deterministic): qty*unitPrice vs netMinor when all present.
  let selfConsistent: boolean | null = null;
  if (qty !== null && unitPriceMinor !== null && netMinor !== null && Number.isInteger(qty)) selfConsistent = qty * unitPriceMinor === netMinor;
  return Object.freeze({
    id: isStr(kv.id) && kv.id.length > 0 ? kv.id : null,
    desc: kv.desc !== undefined ? kv.desc : null,
    qty, unit: kv.unit !== undefined ? kv.unit : null, unitPriceMinor, netMinor,
    selfConsistent, provenance: `line ${lineNo}`, issues: Object.freeze(issues),
  });
}

/** STAGE parse+normalise: extract a document from its already-text form. Never invents data; flags missing/ambiguous. */
function extractDocument(payload: any): any {
  // honest format boundary: an image/scan without supplied text cannot be extracted here (no OCR engine).
  if (isObj(payload) && isStr(payload.format) && /image|scan|photo|jpg|png|pdf-scan/i.test(payload.format) && !isStr(payload.text)) {
    return Object.freeze({ ok: false, code: "OCR_NOT_AVAILABLE", detail: `format '${payload.format}' needs OCR/pdf-to-text, which this repo does not perform; supply extracted text to proceed`, format: payload.format });
  }
  const text = isStr(payload) ? payload : (isObj(payload) && isStr(payload.text) ? payload.text : null);
  if (text === null || text.trim().length === 0) return Object.freeze({ ok: false, code: "EMPTY_INPUT", detail: "no text to extract (and no OCR engine to produce it)" });

  const rows = text.replace(/\r\n/g, "\n").split("\n");
  const fields: Record<string, any> = {};
  const extLines: any[] = [];
  const issues: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]; const trimmed = row.trim(); if (trimmed.length === 0) continue;
    const colon = trimmed.indexOf(":"); if (colon < 0) continue;
    const label = trimmed.slice(0, colon).trim().toUpperCase().replace(/\s+/g, "_");
    const value = trimmed.slice(colon + 1).trim();
    if (label === "LINE") { extLines.push(parseLine(value, i + 1)); continue; }
    const key = LABELS[label]; if (!key) continue;                                   // unknown label ⇒ ignored (not guessed)
    if (value.length === 0) { issues.push(`${key}: label present but value empty (line ${i + 1}) ⇒ MISSING, not invented`); continue; }
    if (MONEY_KEYS.indexOf(key) >= 0) {
      if (!isIntStr(value)) { fields[key] = field(value, null, "LOW", `line ${i + 1}`); issues.push(`${key}='${value}' not an integer minor amount ⇒ normalized=null (ambiguous, not coerced)`); }
      else fields[key] = field(value, parseInt(value, 10), "HIGH", `line ${i + 1}`);
    } else if (key === "docType") {
      const up = value.toUpperCase(); fields[key] = field(value, DOC_TYPES.indexOf(up) >= 0 ? up : null, DOC_TYPES.indexOf(up) >= 0 ? "HIGH" : "LOW", `line ${i + 1}`);
      if (DOC_TYPES.indexOf(up) < 0) issues.push(`TYPE='${value}' not a known doc type ${JSON.stringify(DOC_TYPES)}`);
    } else fields[key] = field(value, value, "HIGH", `line ${i + 1}`);
  }
  for (const l of extLines) for (const is of l.issues) issues.push(is);
  const docType = fields.docType && fields.docType.normalized ? fields.docType.normalized : null;
  return Object.freeze({
    ok: true, docType,
    docNumber: fields.docNumber ? fields.docNumber.normalized : null,
    fields: Object.freeze(fields), lines: Object.freeze(extLines),
    issues: Object.freeze(issues),
    note: "extraction over SUPPLIED text (no OCR performed); every field carries raw+normalized+confidence+provenance; missing/ambiguous never invented.",
  });
}

// map an extracted document to the order-coherence-check shape (reuse, no duplication).
function toCohDoc(ext: any): any {
  if (!isObj(ext) || ext.ok !== true) return null;
  const f = ext.fields;
  const norm = (k: string): any => (f[k] && f[k].normalized !== null && f[k].normalized !== undefined ? f[k].normalized : null);
  const lines = ext.lines.filter((l: any) => isStr(l.id) && Number.isSafeInteger(l.netMinor)).map((l: any) => Object.freeze({ id: l.id, netMinor: l.netMinor }));
  const lineNetSumMinor = lines.reduce((n: number, l: any) => n + l.netMinor, 0);
  return {
    docNumber: ext.docNumber, docType: ext.docType, quoteRef: f.quoteRef ? norm("quoteRef") : undefined,
    chantier: norm("chantier"), supplier: norm("supplier"), client: norm("client"),
    issueDate: norm("issueDate"), currency: norm("currency"),
    ht: norm("totalHtMinor"), tax: norm("taxMinor"), ttc: norm("totalTtcMinor"),
    lines, lineNetSumMinor,
  };
}

// build an EN 16931-shaped invoice from an extracted invoice doc (so a COMPLETE synthetic invoice validates; an incomplete
// one legitimately fails — mandatory fields are not invented). Totals come straight from the extracted amounts.
function toEinvoice(ci: any): any {
  return {
    id: ci.docNumber, issueDate: ci.issueDate, currency: ci.currency,
    seller: ci.supplier ? { name: ci.supplier } : undefined,
    buyer: ci.client ? { name: ci.client } : undefined,
    quoteRef: ci.quoteRef, lines: ci.lines,
    totals: { lineNetSumMinor: ci.lineNetSumMinor, taxExclusiveMinor: ci.ht, vatMinor: ci.tax, taxInclusiveMinor: ci.ttc },
  };
}

// delivery reconciliation: delivered qty per line id vs the ordered/quoted qty ⇒ PARTIAL / EXCESS / OK.
function reconcileDelivery(reference: any, delivery: any): any {
  if (!isObj(reference) || reference.ok !== true || !isObj(delivery) || delivery.ok !== true) return Object.freeze({ status: "MISSING_DATA", lines: Object.freeze([]) });
  const refQty = new Map<string, number>(); for (const l of reference.lines) if (isStr(l.id) && typeof l.qty === "number") refQty.set(l.id, l.qty);
  const result: any[] = []; let partial = false, excess = false, missing = false;
  for (const l of delivery.lines) {
    if (!isStr(l.id) || typeof l.qty !== "number") { missing = true; result.push({ id: l.id, state: "QTY_MISSING" }); continue; }
    if (!refQty.has(l.id)) { excess = true; result.push({ id: l.id, delivered: l.qty, ordered: null, state: "NOT_ORDERED" }); continue; }
    const ord = refQty.get(l.id) as number;
    const state = l.qty < ord ? "PARTIAL" : (l.qty > ord ? "EXCESS" : "OK");
    if (state === "PARTIAL") partial = true; if (state === "EXCESS") excess = true;
    result.push({ id: l.id, delivered: l.qty, ordered: ord, state });
  }
  for (const [id] of refQty) if (!delivery.lines.some((l: any) => l.id === id)) { partial = true; result.push({ id, delivered: 0, ordered: refQty.get(id), state: "NOT_DELIVERED" }); }
  return Object.freeze({ status: missing ? "MISSING_DATA" : (excess ? "EXCESS" : (partial ? "PARTIAL" : "OK")), lines: Object.freeze(result) });
}

/** STAGE interpret/reconcile a dossier. Returns a single explainable status + the full evidence trail. */
function reconcileDossier(dossier: any): any {
  const d = isObj(dossier) ? dossier : {};
  const xq = d.quote !== undefined ? extractDocument(d.quote) : null;
  const xo = d.order !== undefined ? extractDocument(d.order) : null;
  const xi = d.invoice !== undefined ? extractDocument(d.invoice) : null;
  const xd = d.delivery !== undefined ? extractDocument(d.delivery) : null;
  const priorInvoiceNumbers = Array.isArray(d.priorInvoiceNumbers) ? d.priorInvoiceNumbers.filter(isStr) : [];
  const anomalies: any[] = [];

  // a quote AND an invoice are the minimum to reconcile order-to-cash.
  if (!xq || xq.ok !== true || !xi || xi.ok !== true) {
    const why = `quoteExtracted=${!!(xq && xq.ok)} invoiceExtracted=${!!(xi && xi.ok)}`;
    return Object.freeze({ status: "MISSING_DATA", anomalies: Object.freeze([{ code: "MISSING_DATA", detail: "a readable quote (devis) and invoice (facture) are required to reconcile (fail-closed)", evidence: why }]), extracted: Object.freeze({ quote: xq, order: xo, invoice: xi, delivery: xd }), note: "fail-closed: cannot reconcile without both core documents; nothing assumed." });
  }

  const cq = toCohDoc(xq), ci = toCohDoc(xi), co = toCohDoc(xo);
  // DUPLICATE: invoice number already seen.
  if (isStr(ci.docNumber) && priorInvoiceNumbers.indexOf(ci.docNumber) >= 0) anomalies.push({ code: "DUPLICATE", detail: `invoice '${ci.docNumber}' already present in prior invoices ⇒ possible double-billing`, evidence: `docNumber=${ci.docNumber}` });

  // REUSE order-coherence-check for the devis↔commande↔facture core (invoice built to the EN 16931 shape it delegates to).
  const cohInput: any = {
    quote: { id: cq.docNumber, totalMinor: cq.ttc, lines: cq.lines },
    invoice: toEinvoice(ci),
  };
  if (co) cohInput.order = { totalMinor: co.ttc };
  const coherence = COH.checkCoherence(cohInput);
  for (const f of coherence.findings) if (f.code !== "CANNOT_VERIFY") anomalies.push({ code: f.code, detail: f.detail, evidence: f.evidence, from: "order-coherence-check" });

  // delivery (BL) reconciliation vs the quote (ordered quantities).
  const delivery = xd ? reconcileDelivery(xq, xd) : Object.freeze({ status: "NO_DELIVERY", lines: Object.freeze([]) });
  if (delivery.status === "PARTIAL") anomalies.push({ code: "PARTIAL", detail: "delivery note shows fewer units than ordered (partial delivery)", evidence: `lines=${delivery.lines.filter((l: any) => l.state === "PARTIAL" || l.state === "NOT_DELIVERED").map((l: any) => l.id).join(",")}` });
  if (delivery.status === "EXCESS") anomalies.push({ code: "EXCESS", detail: "delivery note shows more/other units than ordered", evidence: `lines=${delivery.lines.filter((l: any) => l.state === "EXCESS" || l.state === "NOT_ORDERED").map((l: any) => l.id).join(",")}` });

  // chantier traceability: the invoice must be attachable to a chantier/project.
  if (!isStr(ci.chantier) || ci.chantier.length === 0) anomalies.push({ code: "NOT_TRACEABLE", detail: "invoice carries no chantier/project reference ⇒ not attachable to a site", evidence: `chantier=${ci.chantier}` });

  // uncertainty: any field extracted at LOW confidence / any line issue ⇒ surface MISSING_DATA (do not silently proceed).
  const uncertain = [xq, xi, xo, xd].filter(Boolean).some((x: any) => x.ok === true && (x.issues.length > 0 || Object.keys(x.fields).some((k: string) => x.fields[k].confidence === "LOW")));
  if (uncertain) anomalies.push({ code: "MISSING_DATA", detail: "one or more fields were missing/ambiguous/low-confidence during extraction ⇒ human review before any booking", evidence: "see extracted.*.issues" });

  // headline status by severity precedence (most actionable first). MATCHED only if zero anomalies.
  const codes = anomalies.map((a: any) => a.code);
  const pick = (c: string) => codes.indexOf(c) >= 0;
  const status = anomalies.length === 0 ? "MATCHED"
    : pick("DUPLICATE") ? "DUPLICATE"
    : pick("MISSING_DATA") ? "MISSING_DATA"
    : (pick("TOTAL_DRIFT") || pick("UNQUOTED_LINE") || pick("LINE_AMOUNT_DRIFT") || pick("ORDER_MISMATCH") || pick("INVOICE_INVALID") || pick("MISSING_LINE") || pick("EXCESS")) ? "MISMATCH"
    : pick("PARTIAL") ? "PARTIAL"
    : pick("NOT_TRACEABLE") ? "NOT_TRACEABLE"
    : "MISMATCH";

  return Object.freeze({
    status,
    anomalies: Object.freeze(anomalies.map((a: any) => Object.freeze(a))),
    coherence, delivery,
    extracted: Object.freeze({ quote: xq, order: xo, invoice: xi, delivery: xd }),
    decision: status === "MATCHED" ? "PROPOSE_ACCEPT (human validation still required before any accounting write)" : "HOLD_FOR_HUMAN_REVIEW (anomalies found; nothing booked/paid/emitted)",
    note: "READ-ONLY reconciliation on synthetic documents; reuses order-coherence-check; prepares+proposes only — books/pays/emits nothing; every anomaly explainable + traceable to provenance.",
  });
}

const DOCUMENT_INTELLIGENCE_CONTRACT = Object.freeze({
  id: "V147-DOCUMENT-INTELLIGENCE",
  metier: "M2 BTP/TP — document extraction + devis→commande→facture→BL reconciliation",
  reuses: ["order-coherence-check (devis↔commande↔facture)", "integer minor-unit arithmetic"],
  formatsHandledNow: Object.freeze(["TEXT (labelled key:value + LINE rows); PDF/image ONLY if extracted text is supplied"]),
  formatsFuture: Object.freeze(["OCR of images/scanned PDFs", "native-PDF layout text extraction"]),
  states: Object.freeze(["MATCHED", "MISMATCH", "PARTIAL", "DUPLICATE", "MISSING_DATA", "NOT_TRACEABLE"]),
  invariants: Object.freeze([
    "NO OCR is faked: an image/scan without supplied text ⇒ OCR_NOT_AVAILABLE (fail-closed)",
    "every extracted field carries raw+normalized+confidence+provenance; missing/ambiguous never invented",
    "integer minor units for money; line self-consistency (qty*unitPrice=net) checked deterministically",
    "reconciliation reuses order-coherence-check — no duplicate reconciliation logic, no new primitive/store",
    "prepares + proposes only: books nothing, pays nothing, emits no invoice; human validation gates any write",
  ]),
});
module.exports = { extractDocument, reconcileDossier, reconcileDelivery, DOC_TYPES, DOCUMENT_INTELLIGENCE_CONTRACT };
export {};
