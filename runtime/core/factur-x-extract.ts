#!/usr/bin/env node
/**
 * factur-x-extract — PRODUCT SLICE 3 of e-invoice-finance-operations: Factur-X PDF → embedded invoice XML → the
 * existing einvoice-parser (CII/UBL) → einvoice-validator (EN16931-core). No PDF library is installed (pdfdetach/
 * pikepdf/pypdf all absent) and none is installed here; this is a BOUNDED, SAFE, TARGETED extractor of the embedded
 * invoice XML using ONLY Node built-ins (zlib FlateDecode with a decompression-bomb cap). It does NOT reimplement the
 * CII/UBL parsing or EN16931 rules — it hands the extracted XML to the existing parser/validator.
 *
 * Safety (input is untrusted): PDF size bounded; stream count + per-stream inflate output bounded (zlib
 * maxOutputLength ⇒ zip-bomb safe); nothing is executed (no JS/shell/PDF actions); malformed PDF/stream ⇒ explicit
 * finding, never a crash or a fake extraction. XML-entity (XXE) / billion-laughs attacks in the embedded XML are
 * handled DOWNSTREAM by einvoice-parser's python3 ElementTree (audit-verified blocked).
 *
 * HONEST SUPPORTED SUBSET (enumerated): a PDF/A-3 whose embedded invoice XML is a plain or single-FlateDecode stream
 * recognisable as CII (CrossIndustryInvoice) or UBL. KNOWN GAPS: encrypted PDFs, object streams (/ObjStm) / xref
 * streams hiding the EmbeddedFile, multi-filter or non-Flate compression, and strict PDF/A-3 structural conformance.
 * Composes einvoice-parser; NO new primitive.
 */
"use strict";

const zlib = require("zlib");
const PARSER = require("./einvoice-parser.js");

const MAX_PDF = 20 * 1024 * 1024;        // 20 MB input cap
const MAX_INFLATE = 12 * 1024 * 1024;    // per-stream inflate output cap (decompression-bomb guard)
const MAX_STREAMS = 400;                 // bounded scan
const INVOICE_HINT = /CrossIndustryInvoice|oasis:names:specification:ubl:schema:xsd:Invoice/;
const FACTURX_NAME = /(factur-x|zugferd-invoice|xrechnung|order-x)\.xml/i;

function isBuf(v: any): boolean { return typeof Buffer !== "undefined" && Buffer.isBuffer(v); }

/** inflateOrRaw(bytes): try zlib (Factur-X FlateDecode), then raw-deflate, else the raw bytes — all bomb-bounded. */
function inflateOrRaw(bytes: any): string | null {
  for (const fn of [() => zlib.inflateSync(bytes, { maxOutputLength: MAX_INFLATE }), () => zlib.inflateRawSync(bytes, { maxOutputLength: MAX_INFLATE })]) {
    try { return fn().toString("utf8"); } catch { /* try next */ }
  }
  // not compressed (or unsupported filter): treat the raw bytes as text only if small enough.
  try { return bytes.length <= MAX_INFLATE ? bytes.toString("utf8") : null; } catch { return null; }
}

/**
 * extractEmbeddedInvoiceXml(pdf, opts?): find the embedded CII/UBL invoice XML in a Factur-X PDF.
 * Returns { ok, xml, provenance } or { ok:false, code, findings }. Fail-closed; bounded; nothing executed.
 */
function extractEmbeddedInvoiceXml(pdf: any, opts: any = {}): any {
  const buf = isBuf(pdf) ? pdf : (typeof pdf === "string" ? Buffer.from(pdf, "latin1") : null);
  if (!buf || buf.length === 0) return { ok: false, code: "INVALID_INPUT", findings: [{ id: "pdf:input", area: "pdf", severity: "HIGH", detail: "a non-empty PDF buffer/string is required", remediation: "supply a Factur-X PDF", evidence: "empty input" }] };
  if (buf.length > MAX_PDF) return { ok: false, code: "TOO_LARGE", findings: [{ id: "pdf:size", area: "pdf", severity: "HIGH", detail: `PDF exceeds the ${MAX_PDF}-byte bound`, remediation: "supply a smaller document", evidence: `${buf.length} bytes` }] };
  if (buf.slice(0, 5).toString("latin1") !== "%PDF-") return { ok: false, code: "NOT_PDF", findings: [{ id: "pdf:magic", area: "pdf", severity: "HIGH", detail: "input is not a PDF (missing %PDF- header)", remediation: "supply a valid PDF", evidence: `header=${JSON.stringify(buf.slice(0, 5).toString("latin1"))}` }] };

  // latin1 preserves bytes 1:1, so string scanning round-trips to Buffer for inflate.
  const s = buf.toString("latin1");
  const candidates: any[] = [];
  let pos = 0, scanned = 0;
  while (scanned < MAX_STREAMS) {
    const kw = s.indexOf("stream", pos);
    if (kw < 0) break;
    // ensure it's the `stream` keyword, not the tail of `endstream`.
    if (kw >= 3 && s.slice(kw - 3, kw) === "end") { pos = kw + 6; continue; }
    let dataStart = kw + 6;
    if (s[dataStart] === "\r") dataStart++;
    if (s[dataStart] === "\n") dataStart++;
    const end = s.indexOf("endstream", dataStart);
    if (end < 0) break;
    scanned++;
    const dictWindow = s.slice(Math.max(0, kw - 600), kw);     // the stream's dictionary precedes the keyword
    const bytes = Buffer.from(s.slice(dataStart, end), "latin1");
    const text = inflateOrRaw(bytes);
    if (text && INVOICE_HINT.test(text)) {
      const nameM = dictWindow.match(FACTURX_NAME) || s.slice(Math.max(0, kw - 2000), kw).match(FACTURX_NAME);
      candidates.push({ xml: text, embeddedName: nameM ? nameM[0] : null, compressed: text !== bytes.toString("utf8"), embeddedFileDict: /EmbeddedFile/.test(dictWindow) });
    }
    pos = end + 9;
  }

  const distinct = [...new Map(candidates.map((c) => [c.xml, c])).values()];
  if (distinct.length === 0) return { ok: false, code: "NO_EMBEDDED_INVOICE", findings: [{ id: "pdf:no-invoice", area: "pdf", severity: "HIGH", detail: "no embedded CII/UBL invoice XML found in the PDF", remediation: "ensure the Factur-X XML is embedded as a (Flate) PDF attachment", evidence: `${scanned} stream(s) scanned` }] };
  if (distinct.length > 1) return { ok: false, code: "AMBIGUOUS_EMBEDDED", findings: [{ id: "pdf:ambiguous", area: "pdf", severity: "HIGH", detail: `${distinct.length} distinct embedded invoice XML payloads found — ambiguous`, remediation: "a Factur-X PDF must carry exactly one invoice XML", evidence: `names: ${distinct.map((c) => c.embeddedName || "?").join(", ")}` }] };
  const c = distinct[0];
  return { ok: true, xml: c.xml, provenance: { source: "pdf-embedded", embeddedName: c.embeddedName, compressed: c.compressed, embeddedFileDict: c.embeddedFileDict, streamsScanned: scanned } };
}

const KNOWN_GAPS = Object.freeze(["encrypted PDFs", "embedded file hidden in an object stream (/ObjStm) or cross-reference stream", "non-Flate or multi-filter compressed attachments", "strict PDF/A-3 structural conformance", "PDF signature / integrity verification"]);

/** ingestFacturX(pdf, opts?): PDF → embedded XML → parse → EN16931-core validate. Consolidated findings + provenance. */
function ingestFacturX(pdf: any, opts: any = {}): any {
  const ex = extractEmbeddedInvoiceXml(pdf, opts);
  if (!ex.ok) return { ok: false, stage: "extract", code: ex.code, findings: ex.findings || [], knownGaps: KNOWN_GAPS };
  const pv = PARSER.parseAndValidate(ex.xml, opts);
  return {
    ok: pv.ok, stage: "validate", format: pv.format || null,
    pdfProvenance: ex.provenance,
    model: pv.model || null, validation: pv.validation || null,
    supportedSubset: pv.supportedSubset || null,
    knownGaps: [...KNOWN_GAPS, ...((pv.knownGaps) || [])],
    findings: pv.ok ? undefined : (pv.findings || []),
    note: "Factur-X PDF → bounded embedded-XML extraction (Node zlib, no PDF lib) → existing CII/UBL parser + EN16931-core validator. NOT full Factur-X/PDF-A3/EN16931 conformance (see knownGaps). Nothing executed; input treated as untrusted.",
  };
}

export { extractEmbeddedInvoiceXml, ingestFacturX, KNOWN_GAPS, MAX_PDF, MAX_INFLATE };
module.exports = { extractEmbeddedInvoiceXml, ingestFacturX, KNOWN_GAPS, MAX_PDF, MAX_INFLATE };

if (require.main === module) {
  const fs = require("fs"); const p = process.argv[2];
  if (!p) { process.stdout.write("usage: factur-x-extract <invoice.pdf>\n"); process.exit(0); }
  const r = ingestFacturX(fs.readFileSync(p));
  process.stdout.write(JSON.stringify({ ok: r.ok, stage: r.stage, code: r.code, format: r.format, valid: r.validation && r.validation.valid }, null, 2) + "\n");
  process.exit(r.ok && r.validation && r.validation.valid ? 0 : 1);
}
