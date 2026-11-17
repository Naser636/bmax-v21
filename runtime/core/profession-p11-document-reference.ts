#!/usr/bin/env node
"use strict";

/*
 * V12.4 §43 P11 — IDP / Document-Processing reference project (E2 + E3). PURE, deterministic. The P11 signal is
 * "turn a structured business document into VALIDATED, rule-conformant data". It REUSES einvoice-validator
 * (validateInvoice — EN 16931 mandatory terms + EXACT integer-money calculation rules) with NO second validator,
 * and DEMONSTRATES: a well-formed EN 16931 invoice => no HIGH findings (accepted); a malformed one (missing
 * mandatory term / broken calculation) => HIGH findings surfaced (rejected, never silently passed). Synthetic;
 * real scanned-doc OCR corpus (E5) owner-gated NOT_RUN. Dual export.
 */

const EV = require("./einvoice-validator");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

function goodInvoice(): any {
  return {
    id: "INV-1", issueDate: "2026-11-08", currency: "EUR",
    seller: { name: "ODG" }, buyer: { name: "Acme" },
    lines: [{ id: "l1", netMinor: 10000 }, { id: "l2", netMinor: 5000 }],
    totals: { lineNetSumMinor: 15000, taxExclusiveMinor: 15000, vatMinor: 3000, taxInclusiveMinor: 18000 },
  };
}

/** processDocument(inv) -> { accepted, highFindings, findings }. A HIGH finding => not accepted (fail-closed). */
function processDocument(inv: any): any {
  const r = EV.validateInvoice(inv);
  if (r.ok === false && r.code) return Object.freeze({ accepted: false, highFindings: 1, reason: r.reason, findings: Object.freeze([]) });
  const report = isObj(r.report) ? r.report : {};
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const high = findings.filter((f: any) => f.severity === "HIGH").length;
  // accepted = EN16931-core valid (no HIGH rule violation), per the validator's own verdict.
  return Object.freeze({ accepted: report.valid === true && high === 0, highFindings: high, findings: Object.freeze(findings) });
}

// V254 §2 — P11 processed ONE document. The core IDP operational metric is the STRAIGHT-THROUGH-PROCESSING (STP) rate over a
// BATCH, with rejected docs routed to a human EXCEPTION queue (never auto-accepted). processBatch adds exactly that, reusing
// processDocument (no second validator). Fail-closed: a HIGH-finding doc goes to exceptions; an empty batch is NOT 100% STP.
/** processBatch(invoices) -> { total, accepted, exceptions, stpRate }. STP rate = straight-through accepted / total. */
function processBatch(invoices: any): any {
  const list = Array.isArray(invoices) ? invoices : [];
  const accepted: number[] = []; const exceptions: any[] = [];
  list.forEach((inv: any, i: number) => {
    const r = processDocument(inv);
    if (r.accepted === true) accepted.push(i);
    else exceptions.push(Object.freeze({ index: i, highFindings: r.highFindings, reason: r.reason || "HIGH conformance finding(s) ⇒ routed to human exception queue (not auto-accepted)" }));
  });
  const total = list.length;
  const stpRate = total > 0 ? Math.round((accepted.length / total) * 1000) / 1000 : 0;   // empty batch ⇒ 0 (not a fake 100%)
  return Object.freeze({
    total, accepted: accepted.length, acceptedIndices: Object.freeze(accepted),
    exceptions: Object.freeze(exceptions), exceptionCount: exceptions.length,
    stpRate, allStraightThrough: total > 0 && exceptions.length === 0,
    note: "STP rate = straight-through (accepted, no HIGH finding) / total; rejected documents are routed to a human EXCEPTION queue, never auto-accepted (fail-closed). SYNTHETIC; real OCR corpus (E5) owner-gated NOT_RUN.",
  });
}

function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  if (Array.isArray(o.batch)) {
    const batch = processBatch(o.batch);
    return Object.freeze({ synthetic: true, profession: "P11", batch, level: "E2", degraded: batch.exceptionCount > 0, note: "SYNTHETIC invoice BATCH (not real OCR, not E5); per-doc EN 16931 validation + STP rate + exception queue; a HIGH finding ⇒ exception (fail-closed); real scanned-doc OCR corpus (E5) owner-gated NOT_RUN" });
  }
  const inv = isObj(o.invoice) ? o.invoice : goodInvoice();
  const result = processDocument(inv);
  const degraded = !result.accepted;
  return Object.freeze({
    synthetic: true, profession: "P11", document: result,
    level: "E2", degraded, note: "SYNTHETIC structured invoice (not a real scanned/OCR document, not E5); EN 16931 mandatory + exact integer-money validation; a HIGH finding => rejected (fail-closed); real scanned-doc OCR corpus (E5) owner-gated NOT_RUN",
  });
}

const P11_DOCUMENT_REFERENCE_CONTRACT = Object.freeze({
  id: "V124-P11-DOCUMENT-REFERENCE",
  source: "V12.4 §43 P11 (IDP/Document-Processing) — E2 reference + E3 (missing mandatory / broken calculation)",
  levels: Object.freeze(["E0", "E1", "E2", "E3", "E4(owner/independent)", "E5(owner-gated NOT_RUN)"]),
  reuses: Object.freeze(["einvoice-validator.validateInvoice (EN 16931 mandatory + exact integer-money rules)"]),
  notAuthority: "a runnable document-validation reference over a SYNTHETIC invoice; no OCR/scanned reality, no E5 claim",
  invariants: Object.freeze([
    "a document is accepted only when it has NO HIGH conformance finding (fail-closed)",
    "mandatory-term and calculation-rule violations are surfaced, never silently passed",
    "SYNTHETIC structured input only; real scanned-doc OCR corpus (E5) owner-gated NOT_RUN (no inflated level)",
    "reuses einvoice-validator; no second validator engine",
    "V254 batch: processBatch computes the STP rate and routes HIGH-finding docs to a human EXCEPTION queue (never auto-accepted); an empty batch is NOT a fake 100% STP (fail-closed)",
  ]),
});

module.exports = { processDocument, processBatch, runReferenceProject, P11_DOCUMENT_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P11_DOCUMENT_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
