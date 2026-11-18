#!/usr/bin/env node
"use strict";

/*
 * V283 (P4 cont.) — ODG PDF NATIVE-TEXT ADAPTER (real, built on pdfjs-dist@4, the ONE PDF family qualified installable in V282).
 * It extracts the NATIVE text layer of a PDF page-by-page with provenance. It does NOT do OCR: a page without an extractable
 * text layer (a scanned/image page) is marked NO_EXTRACTABLE_TEXT + needsOcr, NEVER fabricated and NEVER declared analysed.
 *
 * ENGINE: pdfjs-dist legacy build, loaded via lazy dynamic import, Node-safe config (disableWorker + isEvalSupported:false ⇒ no
 * active-content execution, no worker, no network triggered by the document). Licence Apache-2.0 (cleared V282). Pure-JS, no
 * system dep, no model weights.
 *
 * HONESTY: native text extraction ONLY (NOT OCR); a scanned page ⇒ NO_EXTRACTABLE_TEXT (needsOcr), document result PARTIAL; no
 * confidence score invented; a partial/failed page NEVER reported as a complete success; untrusted input is size/page/format-
 * bounded; resources released (doc.destroy). Feeds V263 ingestion / document-intelligence WITHOUT a second ingestion chain.
 */

const ENGINE = "pdfjs-dist";
const ENGINE_VERSION = "4.10.38";
const EXTRACTION_METHOD = "native_text_layer";
const PAGE_STATUS = Object.freeze(["TEXT_EXTRACTED", "EMPTY_PAGE", "NO_EXTRACTABLE_TEXT", "EXTRACTION_FAILED", "UNSUPPORTED_OR_INVALID"]);
const DOC_STATUS = Object.freeze(["OK", "PARTIAL", "UNSUPPORTED_OR_INVALID", "TOO_LARGE", "TOO_MANY_PAGES", "EMPTY_INPUT"]);
const DEFAULTS = Object.freeze({ maxBytes: 50 * 1024 * 1024, maxPages: 500 });

function toU8(input: any): Uint8Array | null {
  // pdfjs REQUIRES a plain Uint8Array — a Node Buffer (a Uint8Array subclass) is rejected, so normalise to a plain Uint8Array.
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) return Uint8Array.from(input);
  if (input instanceof Uint8Array) return input.constructor === Uint8Array ? input : Uint8Array.from(input);
  if (input && input.type === "Buffer" && Array.isArray(input.data)) return Uint8Array.from(input.data);
  return null;
}
// a PDF MUST start with the %PDF- magic bytes (deterministic, no guessing) — mirrors the V263 signature discipline.
function isPdfMagic(u8: Uint8Array): boolean { return u8.length >= 5 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46 && u8[4] === 0x2d; }

/** validateInput(input, opts) -> sync fail-closed gate: empty / non-PDF / oversize rejected before any parsing. */
function validateInput(input: any, opts?: any): any {
  const o = typeof opts === "object" && opts ? opts : {};
  const maxBytes = Number.isSafeInteger(o.maxBytes) && o.maxBytes > 0 ? o.maxBytes : DEFAULTS.maxBytes;
  const u8 = toU8(input);
  if (!u8 || u8.length === 0) return { ok: false, documentStatus: "EMPTY_INPUT", detail: "empty or non-buffer input" };
  if (u8.length > maxBytes) return { ok: false, documentStatus: "TOO_LARGE", detail: "input " + u8.length + " > maxBytes " + maxBytes };
  if (!isPdfMagic(u8)) return { ok: false, documentStatus: "UNSUPPORTED_OR_INVALID", detail: "missing %PDF- magic bytes (not a PDF)" };
  return { ok: true, u8, maxPages: Number.isSafeInteger(o.maxPages) && o.maxPages > 0 ? o.maxPages : DEFAULTS.maxPages };
}

function result(documentStatus: string, extra: any): any {
  return Object.freeze(Object.assign({ ok: documentStatus === "OK" || documentStatus === "PARTIAL", engine: ENGINE, engineVersion: ENGINE_VERSION, extractionMethod: EXTRACTION_METHOD, documentStatus, isOcr: false, ocrPerformed: false }, extra));
}

/** extractPdfText(input, opts) -> async: per-page native-text extraction with provenance. NEVER OCR; scanned pages flagged. */
async function extractPdfText(input: any, opts?: any): Promise<any> {
  const v = validateInput(input, opts);
  if (!v.ok) return result(v.documentStatus, { pageCount: 0, pages: Object.freeze([]), anyTextExtracted: false, needsOcrPages: Object.freeze([]), errors: Object.freeze([v.detail]), note: "fail-closed input validation (no parsing attempted)" });

  let pdfjs: any;
  try { pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs"); }
  catch (e: any) { return result("UNSUPPORTED_OR_INVALID", { pageCount: 0, pages: Object.freeze([]), anyTextExtracted: false, needsOcrPages: Object.freeze([]), errors: Object.freeze(["pdfjs load failed: " + String(e && e.message || e).slice(0, 160)]), note: "engine load failure" }); }

  let doc: any = null;
  try {
    // Node-safe, security-hardened: no worker, no eval (no active content), no font-triggered network.
    doc = await pdfjs.getDocument({ data: v.u8, disableWorker: true, isEvalSupported: false, useSystemFonts: false, disableFontFace: true }).promise;
  } catch (e: any) {
    return result("UNSUPPORTED_OR_INVALID", { pageCount: 0, pages: Object.freeze([]), anyTextExtracted: false, needsOcrPages: Object.freeze([]), errors: Object.freeze(["parse failed: " + String(e && e.message || e).slice(0, 160)]), note: "corrupted / unparseable PDF (fail-closed)" });
  }

  const totalPages = doc.numPages;
  if (totalPages > v.maxPages) { try { await doc.destroy(); } catch { /* ignore */ } return result("TOO_MANY_PAGES", { pageCount: totalPages, pages: Object.freeze([]), anyTextExtracted: false, needsOcrPages: Object.freeze([]), errors: Object.freeze(["pageCount " + totalPages + " > maxPages " + v.maxPages]), note: "page-count limit (fail-closed before per-page work)" }); }

  const pages: any[] = []; const errors: any[] = []; const needsOcr: number[] = [];
  for (let n = 1; n <= totalPages; n++) {
    try {
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      const items = Array.isArray(tc.items) ? tc.items : [];
      const text = items.map((it: any) => (it && typeof it.str === "string" ? it.str : "")).join(" ").replace(/\s+/g, " ").trim();
      let status: string;
      if (text.length > 0) { status = "TEXT_EXTRACTED"; }
      else {
        // no extractable text: distinguish a truly EMPTY page from a SCANNED/image page (⇒ needs OCR) via image operators.
        let hasImage = false;
        try { const ol = await page.getOperatorList(); const IMG = (pdfjs.OPS && [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject, pdfjs.OPS.paintJpegXObject, pdfjs.OPS.paintImageXObjectRepeat]) || []; hasImage = Array.isArray(ol.fnArray) && ol.fnArray.some((fn: number) => IMG.indexOf(fn) >= 0); } catch { hasImage = false; }
        if (hasImage) { status = "NO_EXTRACTABLE_TEXT"; needsOcr.push(n); }   // image/scanned page ⇒ needs OCR (NOT performed here)
        else { status = "EMPTY_PAGE"; }
      }
      pages.push(Object.freeze({ page: n, status, text, charCount: text.length, provenance: Object.freeze({ engine: ENGINE, engineVersion: ENGINE_VERSION, method: EXTRACTION_METHOD, page: n, processingStatus: status }) }));
      if (page && typeof page.cleanup === "function") page.cleanup();
    } catch (e: any) {
      pages.push(Object.freeze({ page: n, status: "EXTRACTION_FAILED", text: "", charCount: 0, provenance: Object.freeze({ engine: ENGINE, engineVersion: ENGINE_VERSION, method: EXTRACTION_METHOD, page: n, processingStatus: "EXTRACTION_FAILED" }) }));
      errors.push({ page: n, error: String(e && e.message || e).slice(0, 160) });
    }
  }
  let metadata: any = null;
  try { const md = await doc.getMetadata(); metadata = md && md.info ? Object.freeze({ title: md.info.Title || null, producer: md.info.Producer || null, pageCount: totalPages }) : null; } catch { metadata = null; }
  try { await doc.destroy(); } catch { /* resource release best-effort */ }

  const extracted = pages.filter((p: any) => p.status === "TEXT_EXTRACTED").length;
  const anyText = extracted > 0;
  const allText = extracted === totalPages && totalPages > 0;
  const documentStatus = allText ? "OK" : (anyText || needsOcr.length > 0 || pages.some((p: any) => p.status === "EMPTY_PAGE" || p.status === "EXTRACTION_FAILED") ? "PARTIAL" : "PARTIAL");
  return result(documentStatus, {
    pageCount: totalPages, pages: Object.freeze(pages), metadata,
    anyTextExtracted: anyText, textPageCount: extracted, needsOcrPages: Object.freeze(needsOcr), needsOcr: needsOcr.length > 0,
    errors: Object.freeze(errors),
    note: "native text-layer extraction ONLY (NOT OCR). Pages with no extractable text ⇒ NO_EXTRACTABLE_TEXT (needsOcr) — never fabricated, never declared analysed; a partial result is reported PARTIAL, never a complete success.",
  });
}

/** measureExtraction(input, opts) -> local timing/char measurement on THIS input (labelled local, not a universal benchmark). */
async function measureExtraction(input: any, opts?: any): Promise<any> {
  const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
  const r = await extractPdfText(input, opts);
  const t1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
  const totalChars = (r.pages || []).reduce((a: number, p: any) => a + (p.charCount || 0), 0);
  return Object.freeze({ ok: r.ok, documentStatus: r.documentStatus, pageCount: r.pageCount, totalChars, elapsedMs: Math.max(0, Math.round((t1 - t0) * 100) / 100), basis: "LOCAL measurement on the supplied input only — NOT a universal performance claim" });
}

/** devisFunction2Status(result) -> honest impact on BTP devis function 2 (plan PDF/image → devis). */
function devisFunction2Status(extraction: any): any {
  const r = extraction && typeof extraction === "object" ? extraction : {};
  return Object.freeze({
    adapterProvidesText: r.anyTextExtracted === true,
    function2Unblocked: false,
    reason: "the adapter retrieves the native TEXT of a text-layer PDF, but devis function 2 (plan PDF/image → devis) requires geometric plan INTERPRETATION (métré from a drawing), not text retrieval — that remains unbuilt; scanned plans additionally need OCR (BLOCKED). Function 2 stays BLOCKED/PARTIAL; functions 1/3/16 remain BLOCKED (OCR/STT/render absent).",
    textLayerPdfTextAvailableToMetre: r.anyTextExtracted === true,
  });
}

const PDF_NATIVE_ADAPTER_CONTRACT = Object.freeze({
  id: "V283-ODG-PDF-NATIVE-ADAPTER",
  source: "V283 (P4) — pdfjs-dist native-text PDF adapter (the one PDF family qualified installable in V282)",
  engine: ENGINE, engineVersion: ENGINE_VERSION, licence: "Apache-2.0", pageStatuses: PAGE_STATUS, docStatuses: DOC_STATUS,
  invariants: Object.freeze([
    "native text-layer extraction ONLY — NOT OCR; a page without extractable text ⇒ NO_EXTRACTABLE_TEXT + needsOcr, never fabricated, never declared analysed; isOcr/ocrPerformed always false",
    "fail-closed input: empty ⇒ EMPTY_INPUT, non-PDF ⇒ UNSUPPORTED_OR_INVALID, oversize ⇒ TOO_LARGE, too many pages ⇒ TOO_MANY_PAGES; untrusted input is bounded before parsing",
    "security: pdfjs loaded with disableWorker + isEvalSupported:false + disableFontFace (no active content execution, no worker, no document-triggered network/fs); resources released via doc.destroy",
    "no confidence score invented; a partial/failed page is NEVER a complete success (documentStatus PARTIAL); per-page provenance (engine/version/method/page/status) preserved",
    "devis function 2 is NOT unblocked by text retrieval (needs plan interpretation); fns 1/3/16 remain BLOCKED; feeds V263/document-intelligence — no second ingestion chain, no new primitive",
  ]),
});

module.exports = { ENGINE, ENGINE_VERSION, PAGE_STATUS, DOC_STATUS, DEFAULTS, validateInput, extractPdfText, measureExtraction, devisFunction2Status, PDF_NATIVE_ADAPTER_CONTRACT };

export {};
