#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 22 (P11 IDP — world-research gap) — DOCUMENT CONFIDENCE ROUTING GATE (STP / HUMAN_REVIEW / REJECT). PURE,
 * deterministic. World reference: 2026 IDP best practice is confidence-based exception routing / straight-through
 * processing (STP): documents above a confidence threshold auto-process, below it route to a human-review queue,
 * unrecoverable ones are rejected (Unsiloed Aug-2026; Extend Aug-2026 — ~0.90-0.92 thresholds, 60-70% STP target).
 * ODG's P11 chain (pdf-extract / factur-x-extract / einvoice-parser / einvoice-validator) is strictly BINARY
 * (accept iff valid && HIGH===0) — it cannot distinguish a clean straight-through document from a low-confidence/
 * partial one a human should verify. This adds the missing three-way routing tier, COMPOSING the existing modules'
 * OUTPUTS (no new engine, no OCR, no network). Fail-closed: ambiguity ⇒ HUMAN_REVIEW, never auto-STP. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const TIERS = Object.freeze(["STRAIGHT_THROUGH", "HUMAN_REVIEW", "REJECT"]);
// extraction statuses that are unrecoverable (reject) vs degraded (review) — from pdf-extract's honest status set.
const EXTRACT_FATAL = Object.freeze(["ENCRYPTED", "CORRUPT", "NOT_A_PDF", "NO_TEXT_LAYER", "EMPTY"]);
const EXTRACT_DEGRADED = Object.freeze(["PARTIAL"]);

/** routeDocument({extraction, parser, validation}) -> { tier, confidenceBand, reasons, evidence }. Fail-closed.
 * extraction: { status, capped?, streamsFailed? } (pdf-extract); parser: { ok, code } (einvoice-parser);
 * validation: { valid, findings:[{severity}] } (einvoice-validator.report). */
function routeDocument(input: any): any {
  const o = isObj(input) ? input : {};
  const ex = isObj(o.extraction) ? o.extraction : {};
  const parser = isObj(o.parser) ? o.parser : {};
  const val = isObj(o.validation) ? o.validation : {};
  const findings = arr(val.findings).filter(isObj);
  const highs = findings.filter((f) => f.severity === "HIGH").length;
  const mediums = findings.filter((f) => f.severity === "MEDIUM").length;
  const reasons: string[] = [];

  // REJECT: unrecoverable — a HIGH conformance finding, a failed parse, or a fatal extraction status.
  if (highs > 0) reasons.push(`${highs} HIGH conformance finding(s)`);
  if (parser.ok === false) reasons.push(`parser failed (${parser.code || "unknown"})`);
  if (typeof ex.status === "string" && EXTRACT_FATAL.includes(ex.status)) reasons.push(`unrecoverable extraction: ${ex.status}`);
  if (reasons.length > 0) return Object.freeze({ tier: "REJECT", confidenceBand: "LOW", reasons: Object.freeze(reasons), evidence: Object.freeze({ highs, mediums, extraction: ex.status, parserOk: parser.ok }) });

  // HUMAN_REVIEW: degraded/ambiguous — a MEDIUM finding, partial/capped extraction, or any uncertainty.
  const degraded = (typeof ex.status === "string" && EXTRACT_DEGRADED.includes(ex.status)) || ex.capped === true || (typeof ex.streamsFailed === "number" && ex.streamsFailed > 0);
  const clean = parser.ok === true && val.valid === true && highs === 0 && mediums === 0 && ex.status === "TEXT_EXTRACTED" && !degraded;
  if (!clean) {
    if (mediums > 0) reasons.push(`${mediums} MEDIUM finding(s)`);
    if (degraded) reasons.push(`degraded extraction (${ex.status || ""}${ex.capped ? " capped" : ""}${ex.streamsFailed ? " streamsFailed=" + ex.streamsFailed : ""})`);
    if (parser.ok !== true) reasons.push("parser result not confirmed ok");
    if (val.valid !== true) reasons.push("validation not confirmed valid");
    if (reasons.length === 0) reasons.push("not fully clean — route to human review (fail-closed, never auto-STP on uncertainty)");
    return Object.freeze({ tier: "HUMAN_REVIEW", confidenceBand: "MEDIUM", reasons: Object.freeze(reasons), evidence: Object.freeze({ highs, mediums, extraction: ex.status, parserOk: parser.ok, degraded }) });
  }

  // STRAIGHT_THROUGH: parser ok + valid + 0 HIGH/MEDIUM + full extraction.
  return Object.freeze({ tier: "STRAIGHT_THROUGH", confidenceBand: "HIGH", reasons: Object.freeze(["parser ok + EN16931 valid + 0 HIGH/MEDIUM + full extraction"]), evidence: Object.freeze({ highs: 0, mediums: 0, extraction: ex.status, parserOk: true }) });
}

const P11_DOCUMENT_ROUTING_CONTRACT = Object.freeze({
  id: "V124-P11-DOCUMENT-ROUTING",
  source: "SÉRIE 22 P11 — IDP confidence routing / straight-through-processing tier (Unsiloed/Extend 2026)",
  tiers: TIERS,
  reuses: Object.freeze(["pdf-extract (status/capped/streamsFailed)", "einvoice-parser (ok/code)", "einvoice-validator.report (valid/findings)"]),
  notAuthority: "a deterministic routing tier over existing P11 outputs; not a probabilistic confidence model",
  invariants: Object.freeze([
    "STRAIGHT_THROUGH only when parser ok + EN16931 valid + 0 HIGH/MEDIUM + FULL (TEXT_EXTRACTED) extraction",
    "a HIGH finding / parser failure / unrecoverable extraction (encrypted/corrupt/no-text/empty) ⇒ REJECT",
    "a MEDIUM finding / partial-or-capped extraction / any uncertainty ⇒ HUMAN_REVIEW — fail-closed, NEVER auto-STP on ambiguity",
    "composes existing P11 module outputs; no new engine, no OCR, no network",
  ]),
});

module.exports = { routeDocument, P11_DOCUMENT_ROUTING_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P11_DOCUMENT_ROUTING_CONTRACT, demo: routeDocument({ extraction: { status: "TEXT_EXTRACTED" }, parser: { ok: true }, validation: { valid: true, findings: [] } }) }, null, 2) + "\n"); }

export {};
