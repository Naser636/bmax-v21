#!/usr/bin/env node
"use strict";
/*
 * V360 §14 (multimodality) — MULTIMODAL INGEST RUN (demonstrator). Ingests a SYNTHETIC set of media references and shows the
 * honest multimodal front-door: modality classification, local-analyzer gating, REFERENCE provenance, and media CONTENT
 * marked NOT_ANALYZED (never captioned/transcribed/described). READ-ONLY, deterministic. The references are SYNTHETIC.
 *
 * Usage: npx tsx runtime/bin/odg-multimodal-ingest-run.ts
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const MM = require(path.join(ROOT, "runtime", "core", "odg-multimodal-ingest.js"));

// SYNTHETIC references (no media bytes read; content is NOT analyzed).
const items = [
  { uri: "synthetic/diagram.png", mimeType: "image/png" },
  { uri: "synthetic/interview.mp3", mimeType: "audio/mpeg" },
  { uri: "synthetic/keynote.mp4", mimeType: "video/mp4" },
  { uri: "synthetic/spec.pdf", mimeType: "application/pdf" },
  { uri: "synthetic/notes.md" },
  { uri: "synthetic/interview.mp3", extractedText: "[owner-supplied transcript] ... real text here ..." },
  { uri: "synthetic/archive.zzz" },
];

// default (ground-truth host: no vision/ASR/OCR). To see an analyzer-present branch, inject a toolPresent probe.
const r = MM.ingest(items);

process.stdout.write(JSON.stringify({
  multimodal: "V360 §14 — multimodal ingest front-door (SYNTHETIC references; media content NOT analyzed/fabricated).",
  items: r.items.map((i: any) => ({ ref: i.ref, modality: i.modality, status: i.status, analyzable: i.analyzable, missingAnalyzer: i.missingAnalyzer || null, contentAnalyzed: i.contentAnalyzed })),
  summary: r.summary,
}, null, 2) + "\n");
process.stdout.write(`\nMULTIMODAL-INGEST: ${r.summary.total} refs; ${r.summary.readable} readable (text/supplied), ${r.summary.notAnalyzed} NOT_ANALYZED; videoCapable=${r.summary.videoCapable}. ` +
  `Media CONTENT is NEVER analyzed or fabricated here — no caption/transcript/OCR is invented; only text (or owner-supplied extractedText) is readable, every other modality with no local analyzer is NOT_ANALYZED with the exact missing tool. Provenance is of the REFERENCE, not the media bytes. SYNTHETIC demonstration.\n`);
process.exit(0);
export {};
