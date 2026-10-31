// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention.
// pdf-extract (PDF_READING_AND_EVIDENCE_EXTRACTION_V1) — dependency-free text-layer extraction, honest status,
// no false success. Synthetic PDFs built with zlib. OCR extraction is NOT RUN (no tesseract) — declared.
const assert = require("assert");
const zlib = require("zlib");
const JS = require("./pdf-extract.js");
const TS = require("./pdf-extract.ts");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

// Build a minimal PDF: /Pages /Count N + one FlateDecode content stream per `contents` entry.
function mkPdf(contents, { encrypt = false, extraRawStream = false, pageCount } = {}) {
  let p = "%PDF-1.7\n";
  const pc = pageCount !== undefined ? pageCount : contents.length;
  p += `1 0 obj\n<< /Type /Pages /Count ${pc} >>\nendobj\n`;
  if (encrypt) p += "trailer\n<< /Encrypt 5 0 R /Root 1 0 R >>\n";
  let objn = 2;
  for (const c of contents) {
    const flate = zlib.deflateSync(Buffer.from(c, "latin1"));
    p = Buffer.concat([Buffer.from(p, "latin1"), Buffer.from(`${objn} 0 obj\n<< /Length ${flate.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), flate, Buffer.from("\nendstream\nendobj\n", "latin1")]).toString("latin1");
    objn++;
  }
  if (extraRawStream) p += `${objn} 0 obj\n<< /Length 6 >>\nstream\nFOOBAR\nendstream\nendobj\n`; // not flate ⇒ inflate fails
  p += "%%EOF";
  return Buffer.from(p, "latin1");
}
const TEXT = (s) => `BT /F1 12 Tf 72 700 Td (${s}) Tj ET`;

// 1 — valid text PDF.
t("valid text PDF ⇒ TEXT_EXTRACTED, fullyExtracted, correct text", () => {
  const r = JS.extractPdf(mkPdf([TEXT("Hello Evidence Pack")]));
  assert.strictEqual(r.status, "TEXT_EXTRACTED");
  assert.strictEqual(r.fullyExtracted, true);
  assert.ok(r.text.includes("Hello Evidence Pack"));
  assert.ok(r.provenance.bytesSha256 && r.provenance.byteLength > 0);
});

// 2 — multipage PDF (two content streams) ⇒ both pages' text present, pageCount honored.
t("multipage ⇒ text from all content blocks, pageCount reported", () => {
  const r = JS.extractPdf(mkPdf([TEXT("PageOneAlpha"), TEXT("PageTwoBeta")], { pageCount: 2 }));
  assert.strictEqual(r.status, "TEXT_EXTRACTED");
  assert.ok(r.text.includes("PageOneAlpha") && r.text.includes("PageTwoBeta"));
  assert.strictEqual(r.pageCount, 2);
  assert.strictEqual(r.pages.length, 2);
});

// 3 — complex layout (multiple Td + Tj, simulating a table) ⇒ cells extracted (layout approximate, declared).
t("table/complex layout ⇒ cell text extracted (layout approximate)", () => {
  const content = "BT /F1 10 Tf 72 700 Td (Supplier) Tj 200 0 Td (Turnover) Tj 0 -20 Td (ACME) Tj 200 0 Td (50 Cr) Tj ET";
  const r = JS.extractPdf(mkPdf([content]));
  assert.strictEqual(r.status, "TEXT_EXTRACTED");
  for (const cell of ["Supplier", "Turnover", "ACME", "50 Cr"]) assert.ok(r.text.includes(cell), "missing cell " + cell);
  assert.ok(r.warnings.some((w) => /approximate/i.test(w)));
});

// 4 — empty / no-text PDF (graphics only) ⇒ NO_TEXT_LAYER, OCR flagged needed+unavailable (no false success).
t("no text layer (graphics only) ⇒ NO_TEXT_LAYER + OCR needed/unavailable", () => {
  const r = JS.extractPdf(mkPdf(["0 0 100 100 re f"])); // only a rectangle fill, no Tj
  assert.strictEqual(r.status, "NO_TEXT_LAYER");
  assert.strictEqual(r.fullyExtracted, false);
  assert.strictEqual(r.ocr.available, false);
  assert.ok(/OCR/i.test(r.ocr.reason));
});

// 5 — corrupt / invalid (header but no streams) ⇒ CORRUPT; non-PDF ⇒ NOT_A_PDF; empty ⇒ EMPTY.
t("corrupt / non-pdf / empty ⇒ honest distinct statuses", () => {
  assert.strictEqual(JS.extractPdf(Buffer.from("%PDF-1.4\n%%EOF", "latin1")).status, "CORRUPT");
  assert.strictEqual(JS.extractPdf(Buffer.from("not a pdf at all")).status, "NOT_A_PDF");
  assert.strictEqual(JS.extractPdf(Buffer.alloc(0)).status, "EMPTY");
});

// 6 — encrypted PDF ⇒ ENCRYPTED (not extractable without key), never a false success.
t("encrypted ⇒ ENCRYPTED (not treated as empty)", () => {
  const r = JS.extractPdf(mkPdf([TEXT("secret")], { encrypt: true }));
  assert.strictEqual(r.status, "ENCRYPTED");
  assert.strictEqual(r.fullyExtracted, false);
});

// 7 — scanned PDF requiring OCR: no text layer ⇒ NO_TEXT_LAYER + OCR needed. True OCR extraction = NOT RUN (no tesseract).
t("scanned ⇒ NO_TEXT_LAYER (OCR path NOT RUN — tesseract absent)", () => {
  // A scanned page has an image XObject and no text ops; our graphics-only stream models the no-text-layer signal.
  const r = JS.extractPdf(mkPdf(["q 612 0 0 792 0 0 cm /Im0 Do Q"]));
  assert.strictEqual(r.status, "NO_TEXT_LAYER");
  assert.strictEqual(r.ocr.attempted, false); // OCR genuinely NOT attempted (unavailable) — NOT RUN, declared
});

// 8 — partial extraction (one good text stream + one un-inflatable stream) ⇒ PARTIAL, never "fully analyzed".
t("partial (a stream fails) ⇒ PARTIAL, fullyExtracted=false", () => {
  const r = JS.extractPdf(mkPdf([TEXT("GoodPage")], { extraRawStream: true }));
  assert.strictEqual(r.status, "PARTIAL");
  assert.strictEqual(r.fullyExtracted, false);
  assert.ok(r.text.includes("GoodPage"));
  assert.ok(r.extractStats.streamsFailed >= 1);
});

// 9 — findInPdf links a claim to its document+provenance (for the research chain).
t("findInPdf returns snippet + provenance (claim↔document link)", () => {
  const r = JS.extractPdf(mkPdf([TEXT("minimum average annual turnover of INR 50 Crores")]));
  const f = JS.findInPdf(r, ["turnover", "ABSENT_TERM"]);
  assert.strictEqual(f.found.length, 1);
  assert.ok(/turnover/i.test(f.found[0].snippet));
  assert.ok(f.provenance.bytesSha256);
});

// 10 — JS/TS parity on a representative doc.
t("JS/TS parity", () => {
  const pdf = mkPdf([TEXT("ParityCheck"), TEXT("SecondBlock")], { pageCount: 2 });
  const a = JS.extractPdf(pdf), b = TS.extractPdf(pdf);
  assert.deepStrictEqual({ s: a.status, t: a.text, p: a.pageCount, f: a.fullyExtracted, st: a.extractStats }, { s: b.status, t: b.text, p: b.pageCount, f: b.fullyExtracted, st: b.extractStats });
});

// 11 — CHAIN INTEGRATION: extracted PDF text + hash feed opportunity-detector's content-provenance, moving it
//      from REJECTED (no content) to a real integrity verdict. Proves PDF evidence propagates into the ODG chain.
t("extracted PDF feeds opportunity-detector content-provenance (REJECTED→improved)", () => {
  const DET = require("./opportunity-detector.js");
  const ex = JS.extractPdf(mkPdf([TEXT("minimum average annual turnover of INR 50 Crores; Software Bill of Materials")]));
  assert.strictEqual(ex.status, "TEXT_EXTRACTED");
  // Without content ⇒ REJECTED (baseline).
  const before = DET.detect([{ ref: "X", buyer: "B", subject: "S", sourceType: "official-tender", url: "https://x/y.pdf", httpStatus: 200 }], { nowMs: Date.parse("2026-10-20T00:00:00Z") }).shortlist[0];
  assert.strictEqual(before.contentProvenance.verdict, "REJECTED");
  // With extracted PDF text + hash ⇒ content present, integrity re-verifiable (no longer REJECTED).
  const after = DET.detect([{ ref: "X", buyer: "B", subject: "S", sourceType: "official-tender", url: "https://x/y.pdf", httpStatus: 200, content: ex.text, contentHash: JS.sha256(Buffer.from(ex.text)), lastCheckedAt: "2026-10-20T00:00:00Z" }], { nowMs: Date.parse("2026-10-20T00:00:00Z") }).shortlist[0];
  assert.strictEqual(after.contentProvenance.contentPresent, true);
  assert.notStrictEqual(after.contentProvenance.verdict, "REJECTED");
});

// 12 — DECOMPRESSION BOMB (untrusted input): a FlateDecode stream that inflates FAR past the per-stream cap must be
//      REFUSED (counted failed), never allocated — extractPdf completes bounded, no OOM. Build a PDF with one good
//      text stream + one bomb stream (deflate of 64MB ⇒ a few KB on disk, >12MB MAX_INFLATE on inflate).
t("decompression bomb stream ⇒ refused (streamsFailed), bounded (no OOM), honest PARTIAL — not TEXT_EXTRACTED-full", () => {
  const good = zlib.deflateSync(Buffer.from(TEXT("RealContent"), "latin1"));
  const bomb = zlib.deflateSync(Buffer.alloc(64 * 1024 * 1024, 0x20)); // 64MB of spaces ⇒ tiny deflated, inflates ≫ 12MB cap
  let p = "%PDF-1.7\n1 0 obj\n<< /Type /Pages /Count 1 >>\nendobj\n";
  let b = Buffer.from(p, "latin1");
  b = Buffer.concat([b, Buffer.from(`2 0 obj\n<< /Length ${good.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), good, Buffer.from("\nendstream\nendobj\n", "latin1")]);
  b = Buffer.concat([b, Buffer.from(`3 0 obj\n<< /Length ${bomb.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), bomb, Buffer.from("\nendstream\nendobj\n%%EOF", "latin1")]);
  const t0 = Date.now();
  const r = JS.extractPdf(b);                       // MUST return (cap throws ⇒ stream failed), not OOM/hang
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 20000, "bomb extraction must be bounded (was " + elapsed + "ms)");
  assert.ok(r.extractStats.streamsFailed >= 1, "bomb stream must be counted failed, not inflated");
  assert.ok(r.text.includes("RealContent"), "the legitimate stream is still extracted");
  assert.strictEqual(r.fullyExtracted, false);       // a refused stream ⇒ honest PARTIAL, never full success
  // TS parity: same bounded refusal.
  const rt = TS.extractPdf(b);
  assert.strictEqual(rt.extractStats.streamsFailed >= 1, true);
});

console.log(`\nALL PASS — pdf-extract (${n} tests)`);
