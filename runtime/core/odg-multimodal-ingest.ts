#!/usr/bin/env node
"use strict";
/*
 * V360 §14 (multimodality) — MULTIMODAL INGEST front-door. PURE, deterministic, fail-closed, READ-ONLY. A unified honest
 * entry point for image / audio / video / document / text references: it CLASSIFIES the modality, gates each item on the
 * LOCAL analyzer it would require, records REFERENCE provenance, and marks media CONTENT as NOT_ANALYZED when no local
 * analyzer exists (which is the ground truth on this host — no vision/ASR/OCR). It is NOT a second provenance/analyzer and
 * NOT a second video chain: it REUSES odg-video-analysis-chain (video tool-gating) + evidence-provenance.contentDigest.
 *
 * HARD HONESTY: media content is NEVER fabricated. A caption / transcript / OCR / description is NEVER invented. Only TEXT
 * (or caller-SUPPLIED already-extracted text) is actually readable here; every other modality with no local analyzer is
 * NOT_ANALYZED, with the EXACT missing tool + install hint. Provenance is of the REFERENCE (uri/name/mime/size), NOT the
 * media bytes (we do not read them) — stated honestly. Unknown modality ⇒ UNKNOWN_MODALITY (fail-closed).
 */

const VID = require("./odg-video-analysis-chain.js");   // honest video tool-gating (reused — no second video chain)
const PROV = require("./evidence-provenance.js");         // contentDigest for the REFERENCE (no second provenance)

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function low(s: any): string { return String(s == null ? "" : s).toLowerCase(); }

const MODALITIES = Object.freeze(["image", "audio", "video", "document", "text", "unknown"]);
// the LOCAL analyzer each modality would require (keyed to odg-video-analysis-chain's tool vocabulary where applicable).
const REQUIRED_ANALYZER: Record<string, { tool: string; install: string }> = {
  image: { tool: "vision", install: "a local multimodal/vision model (Ollama text-only models CANNOT read images)" },
  audio: { tool: "asr", install: "whisper / faster-whisper (local ASR model)" },
  video: { tool: "video-chain", install: "ffmpeg + whisper + tesseract + a vision model (see odg-video-analysis-chain)" },
  document: { tool: "ocr", install: "tesseract-ocr (scanned) or a born-digital document parser" },
  text: { tool: "none", install: "" }, // text is directly readable
};

const EXT: Record<string, RegExp> = {
  image: /\.(png|jpe?g|gif|webp|bmp|svg|tiff?|heic)$/,
  audio: /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/,
  video: /\.(mp4|mov|avi|mkv|webm|m4v|flv)$/,
  document: /\.(pdf|docx?|pptx?|xlsx?|odt|rtf)$/,
  text: /\.(txt|md|markdown|csv|tsv|json|ya?ml|log)$/,
};

/** classifyModality(ref) -> modality string. Uses mimeType first, then the name/uri extension; else "unknown". */
function classifyModality(ref: any): string {
  const r = isObj(ref) ? ref : {};
  const mime = low(r.mimeType);
  if (mime) {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("video/")) return "video";
    if (mime === "application/pdf" || mime.includes("word") || mime.includes("presentation") || mime.includes("spreadsheet") || mime.includes("officedocument")) return "document";
    if (mime.startsWith("text/") || mime === "application/json") return "text";
  }
  const name = low(r.name || r.uri || r.path);
  for (const mod of ["image", "audio", "video", "document", "text"]) if (EXT[mod].test(name)) return mod;
  return "unknown";
}

/**
 * ingest(items, opts?) -> frozen { items, summary, note }. items: [{ uri|name|path, mimeType?, sizeBytes?, extractedText? }].
 *   opts: { toolPresent(cmd)->bool (probe local CLIs; default all absent) }.
 * Each item: modality + analyzable/status + the exact missing analyzer + REFERENCE provenance. Media content is NEVER
 * analyzed or fabricated here; only text (or supplied extractedText) is readable.
 */
function ingest(items: any[], opts: any = {}): any {
  const o = isObj(opts) ? opts : {};
  const toolPresent = typeof o.toolPresent === "function" ? o.toolPresent : () => false; // default: nothing installed (ground truth)
  const videoTools = VID.probeTools(toolPresent); // honest video tool probe (reused)
  const videoVerdict = VID.assess({ toolsPresent: videoTools }); // assess reads `toolsPresent` (not `tools`) — so the probe actually gates

  const out = arr(items).map((it: any) => {
    const ref = isObj(it) ? it : {};
    const modality = classifyModality(ref);
    // REFERENCE provenance only (uri/name/mime/size) — NOT the media bytes (not read).
    const provenance = PROV.contentDigest({ uri: ref.uri || ref.name || ref.path || null, mimeType: ref.mimeType || null, sizeBytes: typeof ref.sizeBytes === "number" ? ref.sizeBytes : null });
    const suppliedText = typeof ref.extractedText === "string" && ref.extractedText.trim() ? ref.extractedText : null;

    if (modality === "unknown") return freeze({ ref: ref.uri || ref.name || ref.path || null, modality: "unknown", analyzable: false, status: "UNKNOWN_MODALITY", contentAnalyzed: false, provenance });
    if (modality === "text" || suppliedText) {
      // text (or caller-supplied already-extracted text) is the ONLY readable content here — and even then it is just text,
      // analyzed via the normal (text) discipline; the MEDIA itself is still not interpreted by us.
      return freeze({ ref: ref.uri || ref.name || ref.path || null, modality, analyzable: true, status: suppliedText && modality !== "text" ? "ANALYZABLE_VIA_SUPPLIED_TEXT" : "TEXT_READABLE", contentAnalyzed: false, suppliedText: !!suppliedText, provenance, note: "text is readable; media content itself is NOT interpreted or fabricated" });
    }
    const req = REQUIRED_ANALYZER[modality];
    // media modality with no supplied text ⇒ gate on the local analyzer. On this host none exist ⇒ NOT_ANALYZED (honest).
    const toolOk = modality === "video" ? videoVerdict.analyzable === true : toolPresent(mapToolCmd(req.tool));
    if (toolOk) return freeze({ ref: ref.uri || ref.name || ref.path || null, modality, analyzable: true, status: "ANALYZER_AVAILABLE", contentAnalyzed: false, provenance, note: "a local analyzer is present, but THIS module does not itself run it or fabricate output — content remains NOT_ANALYZED until a real analyzer result is supplied" });
    return freeze({ ref: ref.uri || ref.name || ref.path || null, modality, analyzable: false, status: "NOT_ANALYZED", contentAnalyzed: false, missingAnalyzer: req.tool, installHint: req.install, provenance, note: "no local analyzer for this modality ⇒ content NOT_ANALYZED (never captioned/transcribed/described); supply extractedText or install the analyzer" });
  });

  const byStatus: Record<string, number> = {};
  for (const it of out) byStatus[it.status] = (byStatus[it.status] || 0) + 1;
  return freeze({
    items: freeze(out),
    // `textReadable` = content actually available here (text / supplied text). `analyzerAvailable` = a local analyzer exists
    // but was NOT run by this module (content still not analyzed) — kept SEPARATE so "an analyzer exists" is never conflated
    // with "content is available".
    summary: freeze({ total: out.length, textReadable: out.filter((i) => i.status === "TEXT_READABLE" || i.status === "ANALYZABLE_VIA_SUPPLIED_TEXT").length, analyzerAvailable: out.filter((i) => i.status === "ANALYZER_AVAILABLE").length, notAnalyzed: out.filter((i) => i.status === "NOT_ANALYZED").length, byStatus: freeze(byStatus), videoCapable: videoVerdict.analyzable === true }),
    note: "multimodal INGEST: classify modality + gate on the local analyzer + REFERENCE provenance. Media CONTENT is NEVER analyzed or fabricated here — only text (or supplied extractedText) is readable; every other modality with no local analyzer is NOT_ANALYZED with the exact missing tool. Provenance is of the REFERENCE, not the media bytes.",
  });
}

function mapToolCmd(tool: string): string {
  return tool === "asr" ? "whisper" : tool === "ocr" ? "tesseract" : tool === "vision" ? "__no_vision_cli__" : tool;
}

const MULTIMODAL_INGEST_CONTRACT = Object.freeze({
  id: "V360-MULTIMODAL-INGEST",
  purpose: "§14 multimodality — a unified honest front-door (image/audio/video/document/text): classify modality, gate on the local analyzer, record REFERENCE provenance, mark media content NOT_ANALYZED; reuses the video chain + evidence-provenance, fabricates no content",
  reuses: Object.freeze([
    "odg-video-analysis-chain (video tool-gating + capability verdict — no second video chain)",
    "evidence-provenance.contentDigest (REFERENCE provenance — no second provenance)",
  ]),
  invariants: Object.freeze([
    "media CONTENT is NEVER analyzed or fabricated here — a caption/transcript/OCR/description is never invented",
    "only TEXT (or caller-supplied already-extracted text) is readable; every other modality with no local analyzer is NOT_ANALYZED with the exact missing tool + install hint",
    "provenance is of the REFERENCE (uri/name/mime/size), NOT the media bytes (not read); unknown modality ⇒ UNKNOWN_MODALITY (fail-closed)",
    "PURE/deterministic/frozen READ-ONLY; reuses the video chain + evidence-provenance; no second provenance/analyzer/video-chain, no fabricated multimodal understanding",
  ]),
});

module.exports = { classifyModality, ingest, MODALITIES, REQUIRED_ANALYZER, MULTIMODAL_INGEST_CONTRACT };
export {};
