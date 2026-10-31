/**
 * pdf-extract — PDF_READING_AND_EVIDENCE_EXTRACTION_V1. A DEPENDENCY-FREE PDF TEXT-LAYER extractor using ONLY
 * Node's built-in `zlib` + `crypto` (no node/system PDF lib exists here and installing is unauthorized). It
 * extracts the TEXT LAYER of digital PDFs (FlateDecode content streams); it is NOT a full renderer and does
 * NOT do OCR. Honest, fail-closed status so a research chain never treats an unreadable PDF as "no information"
 * and never claims full analysis when only some streams were extracted. Mirror of pdf-extract.js.
 *
 * Status ∈ NOT_A_PDF | EMPTY | ENCRYPTED | NO_TEXT_LAYER (likely scanned ⇒ OCR needed, UNAVAILABLE) |
 *          CORRUPT | PARTIAL (some streams failed) | TEXT_EXTRACTED. Treat extracted text as UNTRUSTED DATA.
 */
const zlib = require("zlib");
const crypto = require("crypto");

// DECOMPRESSION-BOMB GUARD (input is UNTRUSTED per the header): a FlateDecode content stream is attacker-controlled;
// a tiny stream can inflate to gigabytes. Cap each inflate's output with zlib's maxOutputLength (throws
// ERR_BUFFER_TOO_LARGE past the cap ⇒ treated as a failed/unreadable stream, the existing streamsFailed path). Also
// cap the number of streams processed so a file packed with many bombs cannot exhaust time/memory. These mirror the
// proven guard in the sibling factur-x-extract.ts (MAX_INFLATE). No behaviour change for legitimate PDFs (real text
// streams are far under the cap); only a malicious/oversized stream is refused.
const MAX_INFLATE = 12 * 1024 * 1024;   // per-stream inflate output cap (bytes)
const MAX_STREAMS = 4096;               // max streams processed per document (bomb-count guard)

const sha256 = (b: any): string => crypto.createHash("sha256").update(b).digest("hex");

function decodeLiteral(s: any): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") { out += c; continue; }
    const n = s[i + 1];
    if (n === undefined) break;
    if (n >= "0" && n <= "7") {
      let oct = n; i++;
      for (let k = 0; k < 2 && s[i + 1] >= "0" && s[i + 1] <= "7"; k++) { oct += s[++i]; }
      out += String.fromCharCode(parseInt(oct, 8) & 0xff); continue;
    }
    i++;
    out += (({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" } as any)[n]) ?? (n === "\n" ? "" : n);
  }
  return out;
}

function textFromContent(content: any): any {
  const out: string[] = []; let sawTextOp = false, i = 0;
  const n = content.length;
  const readLiteral = (start: any) => {
    let depth = 0, j = start, buf = "";
    for (; j < n; j++) {
      const ch = content[j];
      if (ch === "\\") { buf += ch + (content[j + 1] || ""); j++; continue; }
      if (ch === "(") { depth++; if (depth === 1) continue; }
      if (ch === ")") { depth--; if (depth === 0) return { str: buf, end: j }; }
      buf += ch;
    }
    return { str: buf, end: n };
  };
  const readHex = (start: any) => { let j = start + 1, buf = ""; for (; j < n && content[j] !== ">"; j++) buf += content[j];
    const hex = buf.replace(/[^0-9a-fA-F]/g, ""); let s = ""; for (let k = 0; k + 1 < hex.length; k += 2) s += String.fromCharCode(parseInt(hex.substr(k, 2), 16)); return { str: s, end: j }; };
  while (i < n) {
    const c = content[i];
    if (c === "(") { const r = readLiteral(i); out.push(decodeLiteral(r.str)); i = r.end + 1; sawTextOp = true; continue; }
    if (c === "<" && content[i + 1] !== "<") { const r = readHex(i); out.push(r.str); i = r.end + 1; sawTextOp = true; continue; }
    if ((c === "T" && (content[i + 1] === "*" || content[i + 1] === "d" || content[i + 1] === "D")) || c === "'" || c === "\"") { out.push("\n"); i++; continue; }
    i++;
  }
  return { text: out.join(""), sawTextOp };
}

function extractPdf(input: any, opts: any): any {
  const o = opts || {};
  const buf = Buffer.isBuffer(input) ? input : (input && input.buffer ? input.buffer : Buffer.from(String(input || "")));
  const provenance = { byteLength: buf.length, bytesSha256: buf.length ? sha256(buf) : null, source: o.source || null };
  const warnings: string[] = [], errors: string[] = [];
  const base: any = { text: "", pages: [], pageCount: null, method: "text-layer", ocr: { attempted: false, available: false, reason: "no authorized OCR tool (tesseract absent); OCR NOT performed" }, provenance, warnings, errors, fullyExtracted: false };

  if (buf.length === 0) return { ...base, status: "EMPTY", errors: ["empty file"] };
  const headZone = buf.slice(0, 1024).toString("latin1");
  if (!headZone.includes("%PDF-")) return { ...base, status: "NOT_A_PDF", errors: ["missing %PDF- header"] };
  const latin = buf.toString("latin1");
  if (/\/Encrypt\b/.test(latin)) return { ...base, status: "ENCRYPTED", warnings: ["/Encrypt present — content not extractable without the key"] };

  const countM = latin.match(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/);
  const pageCount = countM ? Number(countM[1]) : (latin.match(/\/Type\s*\/Page[^s]/g) || []).length || null;

  let streamsTotal = 0, streamsInflated = 0, streamsFailed = 0, streamsWithText = 0, capped = false;
  const blocks: string[] = [];
  let idx = 0;
  while (true) {
    const sIdx = latin.indexOf("stream", idx);
    if (sIdx === -1) break;
    // Bomb-count guard: stop processing further streams past the cap (a file packed with many streams cannot
    // force unbounded work). Remaining streams are recorded as failed/unprocessed (honest PARTIAL, never silent).
    if (streamsTotal >= MAX_STREAMS) { capped = true; errors.push(`stream cap ${MAX_STREAMS} reached — remaining streams not processed`); break; }
    streamsTotal++;
    let dataStart = sIdx + 6;
    if (latin[dataStart] === "\r") dataStart++;
    if (latin[dataStart] === "\n") dataStart++;
    const eIdx = latin.indexOf("endstream", dataStart);
    if (eIdx === -1) { streamsFailed++; errors.push(`stream #${streamsTotal}: no endstream`); break; }
    idx = eIdx + 9;
    const raw = buf.slice(dataStart, eIdx);
    let dec: any = null;
    // Bomb-bounded inflate: cap output at MAX_INFLATE; a stream that would exceed it throws ⇒ dec stays null ⇒ the
    // existing streamsFailed/skip path (honest PARTIAL), never an OOM.
    try { dec = zlib.inflateSync(raw, { maxOutputLength: MAX_INFLATE }); } catch { try { dec = zlib.inflateRawSync(raw, { maxOutputLength: MAX_INFLATE }); } catch { dec = null; } }
    if (!dec) { streamsFailed++; continue; }
    streamsInflated++;
    const { text, sawTextOp } = textFromContent(dec.toString("latin1"));
    const clean = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (sawTextOp && clean) { streamsWithText++; blocks.push(clean); }
  }

  const fullText = blocks.join("\n\n").trim();
  const extractStats = { streamsTotal, streamsInflated, streamsFailed, streamsWithText, pageCount, capped };
  if (streamsTotal === 0) return { ...base, status: "CORRUPT", pageCount, errors: ["no stream objects found"], extractStats };
  if (!fullText) {
    return { ...base, status: "NO_TEXT_LAYER", pageCount, extractStats,
      ocr: { attempted: false, available: false, reason: "no text operators found (likely scanned); OCR tool (tesseract) ABSENT ⇒ OCR NEEDED but UNAVAILABLE" },
      warnings: ["no extractable text layer — do NOT treat as 'no information'; needs OCR"] };
  }
  // A hit on the MAX_STREAMS cap means streams were left UNPROCESSED ⇒ extraction is NOT full (honest PARTIAL),
  // even if every processed stream inflated cleanly. (streamsFailed counts inflate failures; capped is the count cap.)
  const fully = streamsFailed === 0 && !capped;
  if (!fully) warnings.push(`${streamsFailed} stream(s) could not be inflated (image/object/raw streams, or partial) — extraction is PARTIAL, not full`);
  return {
    ...base,
    status: fully ? "TEXT_EXTRACTED" : "PARTIAL",
    text: fullText,
    pages: blocks.map((t: any, k: any) => ({ block: k + 1, chars: t.length })),
    pageCount,
    fullyExtracted: fully,
    extractStats,
    warnings: [...warnings, "per-page attribution is APPROXIMATE (content-stream granularity; no full xref/page-tree parse)"],
  };
}

function findInPdf(result: any, terms: any): any {
  const text = (result && result.text) || "";
  const hits: any[] = [];
  for (const term of Array.isArray(terms) ? terms : []) {
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const m = re.exec(text);
    if (m) { const s = Math.max(0, m.index - 60), e = Math.min(text.length, m.index + term.length + 60); hits.push({ term, snippet: text.slice(s, e).replace(/\s+/g, " ").trim() }); }
  }
  return { status: result && result.status, found: hits, searched: (terms || []).length, textChars: text.length, provenance: result && result.provenance };
}

module.exports = { extractPdf, findInPdf, decodeLiteral, textFromContent, sha256 };
export {};
