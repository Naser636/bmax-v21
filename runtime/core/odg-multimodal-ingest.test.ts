#!/usr/bin/env node
"use strict";
/* Tests for odg-multimodal-ingest (V360 §14 multimodality). Deterministic, zero fs/network. Proves: honest modality
 * classification; media CONTENT never analyzed/fabricated; NOT_ANALYZED with the exact missing tool when no local analyzer;
 * only text / supplied extractedText is readable; REFERENCE-only provenance; unknown ⇒ fail-closed; reuses the video chain. */
const M = require("./odg-multimodal-ingest.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const byRef = (r: any, ref: string) => r.items.find((i: any) => i.ref === ref);

function main(): void {
  // classification
  check("classify by mime", M.classifyModality({ mimeType: "image/png" }) === "image" && M.classifyModality({ mimeType: "audio/mpeg" }) === "audio" && M.classifyModality({ mimeType: "video/mp4" }) === "video" && M.classifyModality({ mimeType: "application/pdf" }) === "document");
  check("classify by extension", M.classifyModality({ name: "x.JPG" }) === "image" && M.classifyModality({ uri: "a/b.mp3" }) === "audio" && M.classifyModality({ name: "clip.mkv" }) === "video" && M.classifyModality({ name: "readme.md" }) === "text");
  check("unknown modality fail-closed", M.classifyModality({ name: "mystery.xyz" }) === "unknown" && M.classifyModality({}) === "unknown");

  // default host: NOTHING installed ⇒ every media modality NOT_ANALYZED (content never fabricated); text readable
  const r = M.ingest([
    { uri: "photo.png" }, { uri: "talk.mp3" }, { uri: "demo.mp4" }, { uri: "spec.pdf" }, { uri: "notes.md" }, { uri: "weird.zzz" },
  ]);
  check("image ⇒ NOT_ANALYZED, missing vision analyzer, content never analyzed", byRef(r, "photo.png").status === "NOT_ANALYZED" && byRef(r, "photo.png").missingAnalyzer === "vision" && byRef(r, "photo.png").contentAnalyzed === false);
  check("audio ⇒ NOT_ANALYZED, missing asr", byRef(r, "talk.mp3").status === "NOT_ANALYZED" && byRef(r, "talk.mp3").missingAnalyzer === "asr");
  check("video ⇒ NOT_ANALYZED (delegates to video chain; vision has no CLI here)", byRef(r, "demo.mp4").status === "NOT_ANALYZED" && r.summary.videoCapable === false);
  check("document ⇒ NOT_ANALYZED, missing ocr", byRef(r, "spec.pdf").status === "NOT_ANALYZED" && byRef(r, "spec.pdf").missingAnalyzer === "ocr");
  check("text ⇒ TEXT_READABLE (the only directly readable modality)", byRef(r, "notes.md").status === "TEXT_READABLE" && byRef(r, "notes.md").analyzable === true && byRef(r, "notes.md").contentAnalyzed === false);
  check("unknown ⇒ UNKNOWN_MODALITY (fail-closed)", byRef(r, "weird.zzz").status === "UNKNOWN_MODALITY" && byRef(r, "weird.zzz").analyzable === false);
  check("every item carries REFERENCE provenance (a sha256 digest of the ref, not media bytes)", r.items.every((i: any) => typeof i.provenance === "string" && /^[0-9a-f]{64}$/.test(i.provenance)));
  check("summary honest: 1 textReadable, 0 analyzerAvailable, 4 NOT_ANALYZED; videoCapable false", r.summary.textReadable === 1 && r.summary.analyzerAvailable === 0 && r.summary.notAnalyzed === 4 && r.summary.videoCapable === false);

  // caller-SUPPLIED extracted text ⇒ analyzable via text (the MEDIA itself still not interpreted by us)
  const rs = M.ingest([{ uri: "talk.mp3", extractedText: "owner-provided transcript here" }]);
  check("supplied extractedText ⇒ ANALYZABLE_VIA_SUPPLIED_TEXT, content still not auto-interpreted", byRef(rs, "talk.mp3").status === "ANALYZABLE_VIA_SUPPLIED_TEXT" && byRef(rs, "talk.mp3").analyzable === true && byRef(rs, "talk.mp3").contentAnalyzed === false && byRef(rs, "talk.mp3").suppliedText === true);

  // a present local analyzer (injected) ⇒ ANALYZER_AVAILABLE, but THIS module still does not run it / fabricate output
  const ra = M.ingest([{ uri: "talk.mp3" }], { toolPresent: (cmd: string) => cmd === "whisper" });
  check("analyzer present ⇒ ANALYZER_AVAILABLE but content NOT fabricated (module runs nothing)", byRef(ra, "talk.mp3").status === "ANALYZER_AVAILABLE" && byRef(ra, "talk.mp3").contentAnalyzed === false);

  // contract
  check("contract: never fabricate content; only text/supplied readable; reference provenance; reuses video chain; no 2nd",
    /media CONTENT is NEVER analyzed or fabricated/.test(JSON.stringify(M.MULTIMODAL_INGEST_CONTRACT.invariants)) &&
    /only TEXT .*is readable/.test(JSON.stringify(M.MULTIMODAL_INGEST_CONTRACT.invariants)) &&
    /provenance is of the REFERENCE/.test(JSON.stringify(M.MULTIMODAL_INGEST_CONTRACT.invariants)) &&
    /odg-video-analysis-chain/.test(JSON.stringify(M.MULTIMODAL_INGEST_CONTRACT.reuses)) &&
    /no second provenance/.test(JSON.stringify(M.MULTIMODAL_INGEST_CONTRACT.invariants)));
  check("frozen result", Object.isFrozen(r) && Object.isFrozen(r.items));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-multimodal-ingest (V360 §14 multimodality: classify image/audio/video/document/text; media content NEVER analyzed/fabricated; NOT_ANALYZED + exact missing tool; only text/supplied-text readable; REFERENCE-only provenance; unknown fail-closed; reuses odg-video-analysis-chain + evidence-provenance, no 2nd)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
