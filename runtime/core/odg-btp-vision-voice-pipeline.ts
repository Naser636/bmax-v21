#!/usr/bin/env node
"use strict";

/*
 * V263 — ODG BTP VISION/OCR + VOICE/STT PIPELINE. PURE, deterministic, fail-closed. HONEST capability boundary (directive
 * §3C/§4B/§11): a REAL audit found NO local OCR engine (tesseract/pdftotext/ghostscript absent) and NO local STT engine
 * (whisper/vosk/ffmpeg absent); heavy-model download is NOT authorized. Therefore the RECOGNITION stage is BLOCKED and this
 * module NEVER fabricates OCR text or an STT transcript (recognize() returns RECOGNITION_BLOCKED; fabricated:false always).
 *
 * What IS built and executable: (1) real file INGESTION + magic-byte signature validation (no external tool); (2) the ONE
 * shared structured-extraction CONTRACT reused by vision + voice (§5); (3) deterministic CONSTRUCTION-LANGUAGE extraction over
 * a SUPPLIED text (OCR/STT output when an engine exists, else USER_INPUT) — French decimals, units, quantities, ambiguities;
 * (4) scale safeguards (an unscaled photo yields NO exact dimension); (5) INTEGRATION to the V262 métré + V260 devis engines.
 *
 * HONESTY: machine extraction ⇒ provenance ESTIMATED, confidence null, validationStatus HUMAN_VALIDATION_REQUIRED — NEVER a
 * MEASURED measurement. A candidate becomes a measurement only via explicit human validation. Ambiguity ⇒ explicit record,
 * never a silent guess. Reuses odg-btp-metre-engine + odg-btp-devis-engine.MEASURE_STATE — no second engine.
 */

const DEV = require("./odg-btp-devis-engine.js");
const MEASURE_STATE: string[] = Array.isArray(DEV.MEASURE_STATE) ? DEV.MEASURE_STATE : ["MEASURED", "HUMAN_VALIDATED", "ESTIMATED", "ASSUMED"];
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string"; }

// ---- audited engine availability (REAL audit 2026-11-17; none installed; no download authorized). Static, honest. ----
const ENGINES = Object.freeze({
  asOf: "2026-11-17",
  ocr: Object.freeze({ tesseract: false, ocrmypdf: false, pdftotext: false, ghostscript: false, note: "no local OCR engine installed" }),
  stt: Object.freeze({ whisper: false, "whisper-cpp": false, vosk: false, ffmpeg: false, note: "no local STT engine installed" }),
  imageLib: Object.freeze({ sharp: true, note: "sharp present (image metadata/decoding) but it is NOT OCR" }),
  note: "audited; no OCR/STT recognition engine available; heavy-model download NOT authorized ⇒ recognition is BLOCKED (never fabricated).",
});
function availableEngines(): any { return ENGINES; }

// ---- A. INGESTION: magic-byte signature validation (deterministic; no external tool). ----
const SIGNATURES = Object.freeze([
  Object.freeze({ type: "PNG", sourceType: "IMAGE", prefix: "89504E47" }),
  Object.freeze({ type: "JPEG", sourceType: "IMAGE", prefix: "FFD8FF" }),
  Object.freeze({ type: "GIF", sourceType: "IMAGE", prefix: "474946" }),
  Object.freeze({ type: "TIFF", sourceType: "IMAGE", prefix: "49492A00" }),
  Object.freeze({ type: "TIFF", sourceType: "IMAGE", prefix: "4D4D002A" }),
  Object.freeze({ type: "PDF", sourceType: "PDF", prefix: "25504446" }),            // %PDF
  Object.freeze({ type: "WAV", sourceType: "AUDIO", prefix: "52494646" }),          // RIFF (WAVE verified below)
  Object.freeze({ type: "MP3", sourceType: "AUDIO", prefix: "494433" }),            // ID3
  Object.freeze({ type: "OGG", sourceType: "AUDIO", prefix: "4F676753" }),          // OggS
]);
/** ingest(input) -> validated ingestion record. input: { signatureHex, sourceId, declaredType?, byteSize?, maxBytes?, pages? }. */
function ingest(input: any): any {
  const o = isObj(input) ? input : {};
  const sig = isStr(o.signatureHex) ? o.signatureHex.toUpperCase().replace(/[^0-9A-F]/g, "") : "";
  const sourceId = isStr(o.sourceId) && o.sourceId.length ? o.sourceId : null;
  if (sourceId === null) return Object.freeze({ ok: false, code: "NO_SOURCE_ID", detail: "a stable sourceId is required (provenance)" });
  if (sig.length < 6) return Object.freeze({ ok: false, code: "CORRUPTED", detail: "no readable file signature (empty/corrupted)" });
  const maxBytes = typeof o.maxBytes === "number" && o.maxBytes > 0 ? o.maxBytes : 25 * 1024 * 1024;
  if (typeof o.byteSize === "number" && o.byteSize > maxBytes) return Object.freeze({ ok: false, code: "TOO_LARGE", detail: "byteSize " + o.byteSize + " exceeds limit " + maxBytes });
  const match = SIGNATURES.find((s: any) => sig.startsWith(s.prefix));
  if (!match) return Object.freeze({ ok: false, code: "UNSUPPORTED", detail: "unrecognised file signature '" + sig.slice(0, 8) + "' (never guessed)" });
  if (match.type === "WAV" && isStr(o.signatureHex) && !/57415645/.test(sig)) return Object.freeze({ ok: false, code: "CORRUPTED", detail: "RIFF header without WAVE marker" });
  const pages = match.sourceType === "PDF" && typeof o.pages === "number" ? o.pages : null;
  const maxPages = typeof o.maxPages === "number" ? o.maxPages : 500;
  if (pages !== null && pages > maxPages) return Object.freeze({ ok: false, code: "TOO_MANY_PAGES", detail: "pages " + pages + " exceeds " + maxPages });
  return Object.freeze({ ok: true, sourceId, type: match.type, sourceType: match.sourceType, byteSize: typeof o.byteSize === "number" ? o.byteSize : null, pages, provenance: "INGESTED", note: "signature-validated ingestion; content NOT yet recognised." });
}

// ---- C. RECOGNITION SEAM (OCR/STT): BLOCKED (no engine) — NEVER fabricates text. ----
/** recognize(ingested, opts) -> recognition result. With no engine ⇒ RECOGNITION_BLOCKED. opts.providedText ⇒ USER_INPUT (not recognition). */
function recognize(ingested: any, opts?: any): any {
  const ing = isObj(ingested) ? ingested : {};
  const o = isObj(opts) ? opts : {};
  if (ing.ok !== true) return Object.freeze({ ok: false, code: "NOT_INGESTED", fabricated: false });
  const isImage = ing.sourceType === "IMAGE" || ing.sourceType === "PDF";
  const engineAvail = isImage ? Object.values(ENGINES.ocr).some((v: any) => v === true) : Object.values(ENGINES.stt).some((v: any) => v === true);
  if (isStr(o.providedText)) {
    // explicit human/caller-supplied text — tagged USER_INPUT, NOT machine recognition. Confidence is null (not measured).
    return Object.freeze({ ok: true, status: "USER_INPUT_TEXT", text: o.providedText, engine: "USER_INPUT", sourceType: ing.sourceType, sourceId: ing.sourceId, confidence: null, fabricated: false, note: "caller-supplied text (NOT OCR/STT recognition); downstream extraction stays ESTIMATED until human-validated." });
  }
  if (!engineAvail) return Object.freeze({ ok: false, status: "RECOGNITION_BLOCKED", engineKind: isImage ? "OCR" : "STT", reason: "no local " + (isImage ? "OCR" : "STT") + " engine installed; heavy-model download not authorized", fabricated: false, sourceId: ing.sourceId, note: "recognition is BLOCKED — this module never returns fabricated OCR/STT text." });
  return Object.freeze({ ok: false, status: "ENGINE_PRESENT_NOT_WIRED", fabricated: false, note: "an engine exists but wiring it is a separate authorized step." });
}

// ---- 5. SHARED STRUCTURED-EXTRACTION CONTRACT (reused by vision + voice). ----
function field(o: any): any {
  const x = isObj(o) ? o : {};
  const prov = MEASURE_STATE.indexOf(x.provenance) >= 0 ? x.provenance : "ESTIMATED";   // machine extraction ⇒ ESTIMATED by default
  return Object.freeze({
    sourceId: isStr(x.sourceId) ? x.sourceId : null, sourceType: ["IMAGE", "PDF", "AUDIO", "USER_INPUT"].indexOf(x.sourceType) >= 0 ? x.sourceType : "USER_INPUT",
    region: x.region || null, timestamp: x.timestamp || null, originalText: isStr(x.originalText) ? x.originalText : null,
    normalizedValue: typeof x.normalizedValue === "number" ? x.normalizedValue : null, unit: isStr(x.unit) ? x.unit : null,
    kind: x.kind || null, material: isStr(x.material) ? x.material : null, quantity: typeof x.quantity === "number" ? x.quantity : null,
    engine: isStr(x.engine) ? x.engine : "USER_INPUT", confidence: typeof x.confidence === "number" ? x.confidence : null,   // null unless genuinely measured
    provenance: prov, validationStatus: prov === "MEASURED" || prov === "HUMAN_VALIDATED" ? "OK" : "HUMAN_VALIDATION_REQUIRED",
    warnings: Object.freeze(Array.isArray(x.warnings) ? x.warnings : []), ambiguities: Object.freeze(Array.isArray(x.ambiguities) ? x.ambiguities : []),
  });
}

// ---- C. CONSTRUCTION-LANGUAGE EXTRACTION over supplied text (French-aware). Deterministic, over OCR/STT/USER_INPUT text. ----
const UNIT_WORDS: Record<string, string> = Object.freeze({ "m": "m", "mètre": "m", "mètres": "m", "metre": "m", "metres": "m", "cm": "cm", "centimètre": "cm", "centimètres": "cm", "mm": "mm", "millimètre": "mm", "m2": "m2", "m²": "m2", "m3": "m3", "m³": "m3", "l": "L", "litre": "L", "litres": "L", "kg": "kg", "t": "t", "tonne": "t", "tonnes": "t" });
const NEGATION = /\b(non|annule|annuler|pas|supprime|erreur|corrige|plutôt)\b/i;
/** extractConstructionData(text, opts) -> { fields[], ambiguities[] }. opts: { sourceId, sourceType, scaleKnown? }. */
function extractConstructionData(text: any, opts?: any): any {
  const t = isStr(text) ? text : "";
  const o = isObj(opts) ? opts : {};
  const sourceType = ["IMAGE", "PDF", "AUDIO", "USER_INPUT"].indexOf(o.sourceType) >= 0 ? o.sourceType : "USER_INPUT";
  const sourceId = isStr(o.sourceId) ? o.sourceId : null;
  const fields: any[] = []; const ambiguities: any[] = [];
  // an unscaled IMAGE cannot yield exact dimensions (§3D): any dimension extracted is ASSUMED + flagged.
  const unscaledImage = sourceType === "IMAGE" && o.scaleKnown !== true;
  const normNum = (s: string) => parseFloat(s.replace(/\s/g, "").replace(",", "."));  // French decimal comma
  // number+unit candidates, e.g. "2,5 m", "25 cm", "12 m²".
  const re = /(\d+(?:[.,]\d+)?)\s*(m²|m³|m2|m3|cm|mm|mètres?|metres?|centimètres?|millimètres?|m|litres?|l|tonnes?|kg|t)\b/gi;
  let mm: any;
  while ((mm = re.exec(t)) !== null) {
    const val = normNum(mm[1]); const uw = mm[2].toLowerCase(); const unit = UNIT_WORDS[uw] || UNIT_WORDS[uw.replace(/s$/, "")] || null;
    if (unit === null || !isFinite(val)) continue;
    const warnings: string[] = []; let prov = "ESTIMATED";
    if (unscaledImage && /^(m|cm|mm)$/.test(unit)) { prov = "ASSUMED"; warnings.push("UNSCALED_IMAGE: no metric reference ⇒ dimension is ASSUMED, not a measurement"); }
    fields.push(field({ sourceId, sourceType, originalText: mm[0], normalizedValue: val, unit, kind: /2|3|²|³/.test(unit) ? "AREA_OR_VOLUME" : "DIMENSION", provenance: prov, engine: sourceType === "USER_INPUT" ? "USER_INPUT" : "UNRECOGNISED", warnings }));
  }
  // quantity + material, e.g. "15 sacs de ciment", "3 palettes de parpaings".
  const qm = /(\d+(?:[.,]\d+)?)\s+(?:sacs?|palettes?|unités?|pièces?|u)\s+de\s+([a-zàâéèêïîôûç-]+)/gi;
  let qq: any;
  while ((qq = qm.exec(t)) !== null) { const q = normNum(qq[1]); if (isFinite(q)) fields.push(field({ sourceId, sourceType, originalText: qq[0], quantity: q, unit: "u", material: qq[2], kind: "MATERIAL_QUANTITY", provenance: "ESTIMATED", engine: sourceType === "USER_INPUT" ? "USER_INPUT" : "UNRECOGNISED" })); }
  // AMBIGUITY (§4D): a bare number with no unit; negation/correction; a value like "2,5" vs "25".
  if (NEGATION.test(t)) ambiguities.push(Object.freeze({ code: "CORRECTION_OR_NEGATION", detail: "the text contains a negation/correction word ⇒ requires human confirmation", requiresHuman: true }));
  const bareNums = (t.match(/(?<![\d.,])\d+(?:[.,]\d+)?(?!\s*(?:m²|m³|m2|m3|cm|mm|m|l|kg|t|mètre|centim|millim|sacs?|palettes?|unités?|pièces?|de)\b)/gi) || []);
  for (const bn of bareNums) ambiguities.push(Object.freeze({ code: "AMBIGUOUS_UNIT", value: bn, detail: "number '" + bn + "' has no unit ⇒ cm vs m / quantity vs dimension ambiguous; human confirmation required", requiresHuman: true }));
  return Object.freeze({ ok: true, sourceType, fields: Object.freeze(fields), fieldCount: fields.length, ambiguities: Object.freeze(ambiguities), requiresHuman: ambiguities.some((a: any) => a.requiresHuman) || fields.some((f: any) => f.validationStatus !== "OK"), note: "candidates extracted from SUPPLIED text; machine extraction ⇒ ESTIMATED/ASSUMED, NEVER a verified measurement until human-validated." });
}

// ---- 6. INTEGRATION: validate a candidate, then feed V262 métré. Machine extraction ≠ validation. ----
/** validateCandidate(field, humanValidated) -> the field promoted to HUMAN_VALIDATED only on explicit human confirmation. */
function validateCandidate(fld: any, humanValidated: any): any {
  const x = isObj(fld) ? fld : {};
  if (humanValidated === true && typeof x.normalizedValue === "number") return field(Object.assign({}, x, { provenance: "HUMAN_VALIDATED" }));
  return field(Object.assign({}, x, { provenance: x.provenance === "MEASURED" ? "MEASURED" : (x.provenance || "ESTIMATED") }));  // never auto-promote
}
/** toMetreDim(field) -> a métré dimension { value, unit, provenance } for odg-btp-metre-engine (no geometry computed here). */
function toMetreDim(fld: any): any {
  const x = isObj(fld) ? fld : {};
  if (typeof x.normalizedValue !== "number" || !isStr(x.unit)) return Object.freeze({ ok: false, code: "NOT_A_DIMENSION" });
  return Object.freeze({ ok: true, dim: Object.freeze({ value: x.normalizedValue, unit: x.unit, provenance: x.provenance || "ESTIMATED" }) });
}

const VISION_VOICE_PIPELINE_CONTRACT = Object.freeze({
  id: "V263-ODG-BTP-VISION-VOICE-PIPELINE",
  source: "V263 — vision/OCR + voice/STT ingestion + shared extraction contract + construction-language extraction + integration",
  recognitionStatus: Object.freeze({ ocr: "BLOCKED_NO_ENGINE", stt: "BLOCKED_NO_ENGINE", note: "audited — no local OCR/STT engine; download not authorized; recognition never fabricated" }),
  reuses: Object.freeze(["odg-btp-metre-engine (geometry/units)", "odg-btp-devis-engine.MEASURE_STATE + computeDevis (financial)"]),
  measureStates: MEASURE_STATE,
  invariants: Object.freeze([
    "RECOGNITION HONESTY: no local OCR/STT engine ⇒ recognize() returns RECOGNITION_BLOCKED; this module NEVER fabricates OCR text or an STT transcript (fabricated:false always)",
    "machine extraction over supplied text ⇒ provenance ESTIMATED (ASSUMED for an unscaled image), confidence null, validationStatus HUMAN_VALIDATION_REQUIRED — NEVER a MEASURED measurement; a candidate is promoted only by explicit human validation",
    "ingestion validates the file SIGNATURE (magic bytes) fail-closed: unknown ⇒ UNSUPPORTED, empty ⇒ CORRUPTED, oversize ⇒ TOO_LARGE; never guessed",
    "unscaled photograph ⇒ NO exact dimension (ASSUMED + flagged); ambiguity (bare number / negation / conflict) ⇒ explicit record requiring human confirmation, never a silent guess",
    "integration feeds the V262 métré + V260 devis engines (geometry/money stay there) — no second engine/primitive/roadmap",
  ]),
});

module.exports = { ENGINES, availableEngines, ingest, recognize, field, extractConstructionData, validateCandidate, toMetreDim, MEASURE_STATE, VISION_VOICE_PIPELINE_CONTRACT };

export {};
