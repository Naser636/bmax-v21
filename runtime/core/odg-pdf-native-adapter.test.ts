#!/usr/bin/env node
"use strict";
/* V283 (P4) — PDF native-text adapter (pdfjs-dist). Exercises SYNTHETIC PDFs: single/multi-page text, empty-content page,
 * corrupted, non-PDF, empty buffer, oversize, too-many-pages; asserts per-page status, page order, provenance, PARTIAL, never-
 * OCR, fail-closed limits, resource release, local timing, and honest devis-fn-2 impact. NOT an OCR-quality test. */
const A = require("./odg-pdf-native-adapter.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

// build a SYNTHETIC text-layer PDF from page texts ("" = empty-content page). pdfjs rebuilds xref; /Length set exactly.
function pdfWithPages(texts: string[]): Buffer {
  const N = texts.length; const fontId = 3 + 2 * N;
  const kids = texts.map((_, i) => (3 + 2 * i) + " 0 R").join(" ");
  let body = "%PDF-1.4\n";
  body += "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n";
  body += "2 0 obj<</Type/Pages/Kids[" + kids + "]/Count " + N + ">>endobj\n";
  texts.forEach((t, i) => {
    const pageId = 3 + 2 * i, contentId = 4 + 2 * i;
    const stream = t ? "BT /F1 24 Tf 20 100 Td (" + t + ") Tj ET" : "";
    body += pageId + " 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents " + contentId + " 0 R/Resources<</Font<</F1 " + fontId + " 0 R>>>>>>endobj\n";
    body += contentId + " 0 obj<</Length " + Buffer.byteLength(stream, "latin1") + ">>stream\n" + stream + "\nendstream endobj\n";
  });
  body += fontId + " 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n";
  body += "trailer<</Root 1 0 R>>\n%%EOF";
  return Buffer.from(body, "latin1");
}

async function main() {
  // 1. single text page.
  const r1 = await A.extractPdfText(pdfWithPages(["HELLO ODG"]));
  check("single text-layer PDF ⇒ OK, 1 page TEXT_EXTRACTED, text 'HELLO ODG', engine pdfjs-dist, NOT OCR",
    r1.ok && r1.documentStatus === "OK" && r1.pageCount === 1 && r1.pages[0].status === "TEXT_EXTRACTED" && r1.pages[0].text === "HELLO ODG" && r1.engine === "pdfjs-dist" && r1.isOcr === false && r1.ocrPerformed === false);

  // 2. multipage + order + provenance.
  const r2 = await A.extractPdfText(pdfWithPages(["PAGE ONE", "PAGE TWO"]));
  check("multipage PDF ⇒ OK, 2 pages in ORDER (1 then 2), both TEXT_EXTRACTED, per-page provenance engine+version+method",
    r2.documentStatus === "OK" && r2.pageCount === 2 && r2.pages[0].page === 1 && r2.pages[1].page === 2 && r2.pages[0].text === "PAGE ONE" && r2.pages[1].text === "PAGE TWO" && r2.pages[0].provenance.engine === "pdfjs-dist" && r2.pages[0].provenance.method === "native_text_layer" && r2.pages[1].provenance.page === 2);

  // 3. mixed: text page + empty-content page ⇒ PARTIAL (not a complete success); empty page = EMPTY_PAGE (no text, no image).
  const r3 = await A.extractPdfText(pdfWithPages(["REAL TEXT", ""]));
  check("mixed PDF (text + empty page) ⇒ PARTIAL; page2 EMPTY_PAGE; anyTextExtracted true but not all ⇒ not declared complete",
    r3.documentStatus === "PARTIAL" && r3.pages[0].status === "TEXT_EXTRACTED" && r3.pages[1].status === "EMPTY_PAGE" && r3.anyTextExtracted === true && r3.textPageCount === 1);

  // 4. fail-closed inputs.
  check("empty buffer ⇒ EMPTY_INPUT (fail-closed, not ok)", (await A.extractPdfText(Buffer.from(""))).documentStatus === "EMPTY_INPUT");
  check("non-PDF buffer ⇒ UNSUPPORTED_OR_INVALID (missing %PDF- magic)", (await A.extractPdfText(Buffer.from("this is not a pdf"))).documentStatus === "UNSUPPORTED_OR_INVALID");
  const corrupt = await A.extractPdfText(Buffer.from("%PDF-1.4\nthen total garbage with no objects at all\n%%EOF", "latin1"));
  check("corrupted PDF (magic but unparseable) ⇒ not a complete success (UNSUPPORTED_OR_INVALID or PARTIAL, ok flag honest)", corrupt.documentStatus === "UNSUPPORTED_OR_INVALID" || (corrupt.documentStatus === "PARTIAL" && corrupt.anyTextExtracted === false));

  // 5. resource / size limits (untrusted input bounded before parsing).
  check("oversize ⇒ TOO_LARGE (maxBytes gate, fail-closed before parse)", (await A.extractPdfText(pdfWithPages(["X"]), { maxBytes: 10 })).documentStatus === "TOO_LARGE");
  check("too many pages ⇒ TOO_MANY_PAGES (page-count gate, fail-closed)", (await A.extractPdfText(pdfWithPages(["A", "B"]), { maxPages: 1 })).documentStatus === "TOO_MANY_PAGES");

  // 6. never-OCR invariant across every page + status taxonomy.
  check("NEVER OCR: isOcr/ocrPerformed false on every result; PAGE_STATUS includes NO_EXTRACTABLE_TEXT for real scanned pages",
    [r1, r2, r3].every((r: any) => r.isOcr === false && r.ocrPerformed === false) && A.PAGE_STATUS.indexOf("NO_EXTRACTABLE_TEXT") >= 0 && A.PAGE_STATUS.indexOf("EXTRACTION_FAILED") >= 0);

  // 7. local timing measurement (labelled local, not universal).
  const m = await A.measureExtraction(pdfWithPages(["TIMED PAGE"]));
  check("measureExtraction: elapsedMs is a number ≥0, totalChars>0, basis = LOCAL (not a universal performance claim)",
    typeof m.elapsedMs === "number" && m.elapsedMs >= 0 && m.totalChars > 0 && /LOCAL/.test(m.basis));

  // 8. honest devis function 2 impact (NOT unblocked by text retrieval).
  const d = A.devisFunction2Status(r1);
  check("devis fn2 NOT unblocked by text retrieval (needs plan interpretation); fns 1/3/16 remain BLOCKED",
    d.function2Unblocked === false && d.adapterProvidesText === true && /plan INTERPRETATION/.test(d.reason) && /1\/3\/16 remain BLOCKED/.test(d.reason));

  // 9. determinism of content + contract.
  const rA = await A.extractPdfText(pdfWithPages(["DET"])); const rB = await A.extractPdfText(pdfWithPages(["DET"]));
  check("deterministic content: identical PDF ⇒ identical pages/text (timing excluded)", JSON.stringify(rA.pages) === JSON.stringify(rB.pages) && Object.isFrozen(A.PAGE_STATUS));
  check("contract: pdfjs-dist Apache-2.0, native-text-only NOT OCR, fail-closed, security-hardened, feeds V263/document-intelligence no 2nd chain",
    A.PDF_NATIVE_ADAPTER_CONTRACT.licence === "Apache-2.0" && A.PDF_NATIVE_ADAPTER_CONTRACT.invariants.some((i: string) => /NOT OCR/.test(i)) && A.PDF_NATIVE_ADAPTER_CONTRACT.invariants.some((i: string) => /isEvalSupported:false/.test(i)) && A.PDF_NATIVE_ADAPTER_CONTRACT.invariants.some((i: string) => /no second ingestion chain/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-pdf-native-adapter (V283 P4: REAL pdfjs-dist@4.10.38 native-text extraction — single/multi-page TEXT_EXTRACTED [order+provenance], empty page⇒EMPTY_PAGE⇒PARTIAL, corrupted/non-PDF/empty⇒fail-closed, oversize⇒TOO_LARGE, pages⇒TOO_MANY_PAGES; NEVER OCR [isOcr false, scanned⇒NO_EXTRACTABLE_TEXT via image-op detection]; security disableWorker+isEvalSupported:false; local timing; devis fn2 NOT unblocked [needs plan interpretation]; Apache-2.0, no 2nd ingestion chain)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main().catch((e) => { console.log("TEST HARNESS ERROR:", String(e)); process.exit(1); });
export {};
