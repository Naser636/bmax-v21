#!/usr/bin/env node
"use strict";
/*
 * V213 §5/E — RADAR VIDEO SOURCES register. PURE, deterministic, READ-ONLY. The two owner-designated YouTube videos are
 * referenced across CTO directives (V12.4 master directive §6.5) but were NOT persisted in any repo file — a continuity
 * gap. This records their canonical references so they survive between sessions, and marks their analysis status HONESTLY.
 *
 * HARD HONESTY: this environment has NO video/transcript/audio access — the video CONTENT is NOT_ANALYZED. Titles,
 * arguments, figures and conclusions are NEVER invented. A video becomes ANALYZED only if the owner supplies a real
 * transcript/caption text (then analyzed through the normal provenance discipline). This is NOT a second radar — it is a
 * source record the existing radar can consume. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function str(v: any): string { return typeof v === "string" ? v.trim() : ""; }

// The two canonical videos. V226: title/author retrieved from the OFFICIAL YouTube oEmbed API (licit metadata access —
// NOT caption/video download, which YouTube ToS gates) on 2026-11-16. Metadata ≠ content: titles are identity, never the
// video's claims/arguments/conclusions. Relevance-to-ODG is a TITLE-ONLY signal (not a content assessment).
const CANONICAL_VIDEOS = Object.freeze([
  { id: "UeHmxZMdw2g", url: "https://www.youtube.com/watch?v=UeHmxZMdw2g&t=39s", designation: "owner-designated (V12.4 master directive §6.5 — mandatory acquisition/analysis test case)",
    metadata: { title: "J'ai Demandé à Claude De Gagner Un Maximum d'Argent", author: "NOCT SENSEI", authorUrl: "https://www.youtube.com/@noct_ai", provider: "YouTube", source: "YouTube oEmbed API", consultedDate: "2026-11-16" },
    titleRelevanceToOdgEngineering: "LOW (consumer 'make money with Claude' content by title — NOT a technical engineering/model talk; title-only signal, content NOT analyzed)" },
  { id: "2uyhavEACdo", url: "https://www.youtube.com/watch?v=2uyhavEACdo", designation: "owner-designated (V12.4 master directive §6.5 — mandatory acquisition/analysis test case)",
    metadata: { title: "You Have 5 Years to Get Rich Before AI Takes Over", author: "Mark Tilbury", authorUrl: "https://www.youtube.com/@marktilbury", provider: "YouTube", source: "YouTube oEmbed API", consultedDate: "2026-11-16" },
    titleRelevanceToOdgEngineering: "LOW (consumer 'get rich before AI' finance content by title — NOT a technical engineering/model talk; title-only signal, content NOT analyzed)" },
]);

const ANALYSIS_STATUS = Object.freeze({
  status: "NOT_ANALYZED",
  metadataStatus: "METADATA_IDENTIFIED (title/author via official YouTube oEmbed API, 2026-11-16) — identity only, NOT content",
  reason: "content analysis remains blocked: (1) no local multimodal toolchain (ffmpeg/whisper/tesseract/vision absent); (2) YouTube ToS gates caption/video download for videos the operator does not own (captions.download needs video permissions) — not circumvented",
  rule: "titles/arguments/figures/conclusions are NEVER invented; a TITLE is metadata, not content; a summary without a real transcript is NOT produced",
  unblock: "owner supplies a verifiable transcript/caption text (or authorizes a licit transcript channel) ⇒ the video is then analyzed through the normal provenance discipline (OBSERVED_EVIDENCE, dated, source-cited)",
});

/* register(opts?) -> the recorded video sources + honest analysis status. opts.transcripts = { <videoId>: "<text>" }
 * (owner-supplied). A video with a non-empty supplied transcript becomes ANALYSIS_ELIGIBLE (still not fabricated). */
function register(opts: any): any {
  const t = isObj(opts) && isObj(opts.transcripts) ? opts.transcripts : {};
  const videos = CANONICAL_VIDEOS.map((v: any) => {
    const transcript = str(t[v.id]);
    return Object.freeze({
      id: v.id, url: v.url, designation: v.designation,
      metadata: v.metadata, titleRelevanceToOdgEngineering: v.titleRelevanceToOdgEngineering,
      analysis: transcript ? "ANALYSIS_ELIGIBLE (owner transcript supplied — analyze via provenance discipline; still no fabrication)" : "NOT_ANALYZED",
      metadataIdentified: !!(v.metadata && v.metadata.title),   // identity known (licit oEmbed), content still NOT analyzed
      transcriptSupplied: transcript.length > 0,
    });
  });
  return Object.freeze({
    count: videos.length, videos: Object.freeze(videos),
    defaultStatus: ANALYSIS_STATUS,
    note: "the two owner-designated videos are RECORDED + METADATA-IDENTIFIED (title/author via official YouTube oEmbed API, licit metadata only); their CONTENT stays NOT_ANALYZED (no toolchain + ToS-gated captions) — never fabricated; title is identity, not content; feeds the EXISTING radar, not a second one.",
  });
}

const RADAR_VIDEO_SOURCES_CONTRACT = Object.freeze({
  id: "V213-RADAR-VIDEO-SOURCES",
  purpose: "§5/E — persist the two owner-designated video references + honest NOT_ANALYZED status; never fabricate content",
  invariants: Object.freeze([
    "the two canonical videos are recorded with their exact URLs (recovered from directive continuity, not a repo file)",
    "content is NOT_ANALYZED — no video/transcript access here; titles/arguments/conclusions are NEVER invented",
    "a video becomes ANALYSIS_ELIGIBLE only when the owner supplies a real transcript (then via the normal provenance discipline)",
    "NOT a second radar/registry — a source record the existing radar consumes; deterministic; read-only",
  ]),
});

module.exports = { CANONICAL_VIDEOS, ANALYSIS_STATUS, register, RADAR_VIDEO_SOURCES_CONTRACT };
export {};
