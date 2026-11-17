#!/usr/bin/env node
"use strict";
/* V263 — vision/OCR + voice/STT pipeline. Proves: honest recognition BLOCKED (no fabrication); real signature-validated
 * ingestion; deterministic French construction extraction (machine ⇒ ESTIMATED, never MEASURED); ambiguity records; unscaled-
 * photo safeguard; and end-to-end integration text→validate→V262 métré→V260 devis. SYNTHETIC fixtures (labelled). */
const P = require("./odg-btp-vision-voice-pipeline.js");
const MET = require("./odg-btp-metre-engine.js");
const DEV = require("./odg-btp-devis-engine.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  // --- INGESTION (magic-byte signatures; SYNTHETIC hex fixtures) ---
  check("ingest valid PNG signature ⇒ ok IMAGE", P.ingest({ signatureHex: "89504E470D0A1A0A", sourceId: "img-1" }).type === "PNG" && P.ingest({ signatureHex: "89504E47", sourceId: "img-1" }).sourceType === "IMAGE");
  check("ingest valid PDF ⇒ ok PDF; valid WAV (RIFF+WAVE) ⇒ ok AUDIO", P.ingest({ signatureHex: "255044462D312E37", sourceId: "pdf-1" }).type === "PDF" && P.ingest({ signatureHex: "52494646240000005741564566", sourceId: "au-1" }).sourceType === "AUDIO");
  check("ingest fail-closed: unknown signature ⇒ UNSUPPORTED; empty ⇒ CORRUPTED; no sourceId ⇒ NO_SOURCE_ID", P.ingest({ signatureHex: "DEADBEEF", sourceId: "x" }).code === "UNSUPPORTED" && P.ingest({ signatureHex: "", sourceId: "x" }).code === "CORRUPTED" && P.ingest({ signatureHex: "89504E47" }).code === "NO_SOURCE_ID");
  check("ingest fail-closed: oversize ⇒ TOO_LARGE; RIFF without WAVE ⇒ CORRUPTED", P.ingest({ signatureHex: "89504E47", sourceId: "x", byteSize: 99999999, maxBytes: 1000 }).code === "TOO_LARGE" && P.ingest({ signatureHex: "524946461234567800000000", sourceId: "x" }).code === "CORRUPTED");

  // --- RECOGNITION (honest: BLOCKED, never fabricated) ---
  const img = P.ingest({ signatureHex: "89504E47", sourceId: "img-1" });
  const aud = P.ingest({ signatureHex: "52494646240000005741564566", sourceId: "au-1" });
  const recImg = P.recognize(img); const recAud = P.recognize(aud);
  check("recognize(image) ⇒ RECOGNITION_BLOCKED (OCR), fabricated:false, NO text", recImg.ok === false && recImg.status === "RECOGNITION_BLOCKED" && recImg.engineKind === "OCR" && recImg.fabricated === false && recImg.text === undefined);
  check("recognize(audio) ⇒ RECOGNITION_BLOCKED (STT), fabricated:false", recAud.status === "RECOGNITION_BLOCKED" && recAud.engineKind === "STT" && recAud.fabricated === false);
  check("availableEngines: OCR + STT all absent (honest audit)", Object.values(P.availableEngines().ocr).filter((v: any) => v === true).length === 0 && Object.values(P.availableEngines().stt).filter((v: any) => v === true).length === 0);
  const usr = P.recognize(img, { providedText: "mur 4 m" });
  check("recognize with providedText ⇒ USER_INPUT_TEXT (engine USER_INPUT, confidence null, fabricated:false — NOT recognition)", usr.status === "USER_INPUT_TEXT" && usr.engine === "USER_INPUT" && usr.confidence === null && usr.fabricated === false);

  // --- CONSTRUCTION EXTRACTION (French; machine ⇒ ESTIMATED, never MEASURED) ---
  const ex = P.extractConstructionData("Le mur fait 2,5 m de haut et 4 m de long ; il faut 15 sacs de ciment", { sourceId: "u-1", sourceType: "USER_INPUT" });
  const dims = ex.fields.filter((x: any) => x.kind === "DIMENSION");
  check("extract: '2,5 m' ⇒ 2.5 m and '4 m' ⇒ 4 m (French decimal comma), provenance ESTIMATED (never MEASURED)", dims.some((x: any) => x.normalizedValue === 2.5 && x.unit === "m") && dims.some((x: any) => x.normalizedValue === 4 && x.unit === "m") && dims.every((x: any) => x.provenance === "ESTIMATED" && x.validationStatus === "HUMAN_VALIDATION_REQUIRED" && x.confidence === null));
  check("extract: '15 sacs de ciment' ⇒ quantity 15, material 'ciment'", ex.fields.some((x: any) => x.kind === "MATERIAL_QUANTITY" && x.quantity === 15 && x.material === "ciment"));
  check("extract: cm vs m both parsed ('25 cm' ⇒ 25 cm, '2,5 m' ⇒ 2.5 m)", (() => { const e = P.extractConstructionData("25 cm ou 2,5 m", { sourceType: "USER_INPUT" }); return e.fields.some((x: any) => x.normalizedValue === 25 && x.unit === "cm") && e.fields.some((x: any) => x.normalizedValue === 2.5 && x.unit === "m"); })());

  // --- AMBIGUITY (§4D): negation/correction, bare number ---
  check("ambiguity: negation/correction word ⇒ CORRECTION_OR_NEGATION (human confirmation)", P.extractConstructionData("non, plutôt 3 m", { sourceType: "USER_INPUT" }).ambiguities.some((a: any) => a.code === "CORRECTION_OR_NEGATION" && a.requiresHuman === true));
  check("ambiguity: a bare number with no unit ⇒ AMBIGUOUS_UNIT (cm vs m / qty vs dim)", P.extractConstructionData("la hauteur est 25", { sourceType: "USER_INPUT" }).ambiguities.some((a: any) => a.code === "AMBIGUOUS_UNIT" && a.value === "25"));

  // --- SCALE SAFEGUARD (§3D): unscaled photo ⇒ ASSUMED, no exact dimension ---
  const unscaled = P.extractConstructionData("3 m", { sourceType: "IMAGE" });
  check("unscaled IMAGE ⇒ dimension ASSUMED + UNSCALED_IMAGE warning (no exact measurement from a photo)", unscaled.fields[0].provenance === "ASSUMED" && unscaled.fields[0].warnings.some((w: string) => /UNSCALED_IMAGE/.test(w)));
  const scaled = P.extractConstructionData("3 m", { sourceType: "IMAGE", scaleKnown: true });
  check("scaled plan (scaleKnown) ⇒ dimension ESTIMATED (still needs human validation, but not ASSUMED-unscaled)", scaled.fields[0].provenance === "ESTIMATED");

  // --- VALIDATION GATE: machine extraction ≠ validation ---
  const candidate = dims.find((x: any) => x.normalizedValue === 4);
  check("validateCandidate(false) ⇒ stays ESTIMATED (never auto-promoted)", P.validateCandidate(candidate, false).provenance === "ESTIMATED");
  check("validateCandidate(true) ⇒ HUMAN_VALIDATED (only via explicit human confirmation)", P.validateCandidate(candidate, true).provenance === "HUMAN_VALIDATED" && P.validateCandidate(candidate, true).validationStatus === "OK");

  // --- END-TO-END: text → extract → human-validate → V262 métré → V260 devis ---
  const e2e = P.extractConstructionData("Mur 4 m de long, 2,5 m de haut", { sourceId: "ocr-sim", sourceType: "USER_INPUT" });
  const vLong = P.validateCandidate(e2e.fields.find((x: any) => x.normalizedValue === 4), true);
  const vHigh = P.validateCandidate(e2e.fields.find((x: any) => x.normalizedValue === 2.5), true);
  const area = MET.rectArea(P.toMetreDim(vLong).dim, P.toMetreDim(vHigh).dim);
  check("end-to-end: validated candidates → métré rectArea 4×2.5 = 10 m2, HUMAN_VALIDATED (not requiring further validation)", area.ok && area.quantity === 10 && area.provenance === "HUMAN_VALIDATED" && area.requiresHumanValidation === false);
  const lines = MET.metreToDevisLines([{ id: "L1", metier: "masonry", metre: area, materialQty: 10, materialUnitPriceMinor: 500 }]);
  const devis = DEV.computeDevis({ lines: lines.lines, marginRate: 0.2, vatRate: 0.2 });
  check("end-to-end: métré → devis TTC 7200 (integer cents), final true (validated chain)", devis.ok && devis.totalTTC === 7200 && devis.final === true);
  // estimated (NOT validated) extraction ⇒ downstream devis NON-final (never silently promoted).
  const estArea = MET.rectArea(P.toMetreDim(e2e.fields.find((x: any) => x.normalizedValue === 4)).dim, P.toMetreDim(e2e.fields.find((x: any) => x.normalizedValue === 2.5)).dim);
  const estLines = MET.metreToDevisLines([{ id: "L1", metier: "masonry", metre: estArea, materialQty: 10, materialUnitPriceMinor: 500 }]);
  check("end-to-end: UN-validated (ESTIMATED) extraction ⇒ métré ESTIMATED ⇒ devis NOT final (never silently promoted)", estArea.provenance === "ESTIMATED" && DEV.computeDevis({ lines: estLines.lines, marginRate: 0.2, vatRate: 0.2 }).final === false);

  // --- contract honesty + determinism ---
  check("contract: recognition BLOCKED (no fabrication), machine⇒ESTIMATED-not-measured, unscaled⇒ASSUMED, feeds V262/V260 (no 2nd engine)", P.VISION_VOICE_PIPELINE_CONTRACT.invariants.some((i: string) => /NEVER fabricates/.test(i)) && P.VISION_VOICE_PIPELINE_CONTRACT.invariants.some((i: string) => /NEVER a MEASURED measurement/.test(i)) && P.VISION_VOICE_PIPELINE_CONTRACT.recognitionStatus.ocr === "BLOCKED_NO_ENGINE");
  check("deterministic + frozen", JSON.stringify(P.extractConstructionData("Mur 4 m de long, 2,5 m de haut", { sourceId: "ocr-sim", sourceType: "USER_INPUT" })) === JSON.stringify(e2e) && Object.isFrozen(e2e) && Object.isFrozen(recImg));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-btp-vision-voice-pipeline (V263: OCR/STT recognition BLOCKED [no local engine] — NEVER fabricated; real signature-validated ingestion; French construction extraction [machine⇒ESTIMATED, never MEASURED; unscaled photo⇒ASSUMED]; ambiguity records [negation/bare-number]; human-validation gate; end-to-end text→validate→V262 métré [10 m2]→V260 devis [TTC 7200, estimated⇒not-final] — no 2nd engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
