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

function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
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
  ]),
});

module.exports = { processDocument, runReferenceProject, P11_DOCUMENT_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P11_DOCUMENT_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
