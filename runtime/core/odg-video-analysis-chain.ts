#!/usr/bin/env node
"use strict";
/*
 * V220 §3 — VIDEO-ANALYSIS CHAIN GATE. PURE, deterministic, fail-closed. ODG's multimodal priority mission. This encodes
 * the canonical audiovisual analysis chain (source→access→audio→ASR→keyframes→OCR→visual→align→corroborate→synthesis→
 * knowledge→mission) as ORDERED stages, each gated on the local tool it REQUIRES, and returns an honest capability
 * verdict for a given tool environment. It analyzes NOTHING by itself and FABRICATES NO video/slide/talk content.
 *
 * GROUND TRUTH (V220 environment probe, 2026-11-16): ffmpeg/ffprobe/yt-dlp/whisper/tesseract are ABSENT and Ollama holds
 * only TEXT models (qwen2.5-coder/qwen2.5 — no vision/audio). Therefore local video analysis is NOT possible today; the
 * missing tools' installation is a system-package + network action = OWNER_GATED. A text LLM CANNOT understand a video.
 *
 * HARD HONESTY: no stream accessible ⇒ NOT_ANALYZABLE with the exact reason; audio-only ⇒ PARTIAL_AUDIO (flagged);
 * images-only ⇒ PARTIAL_VISUAL (flagged); both ⇒ FULL (corroborate + flag contradictions). A speaker's claim is never a
 * verified fact without corroboration. No DRM/login/access-control bypass. Tool presence is INJECTED (deterministic);
 * a real probe helper is provided for production callers. Dual export.
 */

const VID = require("./odg-radar-video-sources.js");  // V213 — the two owner-designated videos (reused, not duplicated)

// the canonical chain: each stage + the capability it needs. tool keys: acquire/demux/asr/keyframes/ocr/vision.
const STAGES = Object.freeze([
  { stage: "ACCESS_AND_AUTHORIZATION", needs: [], produces: "licit-access decision (respect ToS/DRM/login — never bypassed)" },
  { stage: "CONTENT_IDENTIFICATION", needs: [], produces: "video id/url/date/provenance (from source record; never invented)" },
  { stage: "ACQUISITION", needs: ["acquire"], produces: "authorized media retrieval (yt-dlp/authorized API)" },
  { stage: "AUDIO_EXTRACTION", needs: ["demux"], produces: "audio track (ffmpeg)" },
  { stage: "SPEECH_RECOGNITION", needs: ["asr"], produces: "timestamped transcript (whisper/local ASR)" },
  { stage: "KEYFRAME_EXTRACTION", needs: ["demux"], produces: "sampled keyframes (ffmpeg scene/interval)" },
  { stage: "OCR_SLIDES", needs: ["ocr"], produces: "on-screen text from slides (tesseract)" },
  { stage: "VISUAL_ANALYSIS", needs: ["vision"], produces: "diagram/architecture/demo reading (local vision model)" },
  { stage: "TEMPORAL_ALIGNMENT", needs: ["asr", "demux"], produces: "speech↔image alignment by timestamp" },
  { stage: "CORROBORATION", needs: [], produces: "speaker-claim vs on-screen vs external — contradictions flagged" },
  { stage: "SYNTHESIS", needs: [], produces: "traceable knowledge (every finding → url+timestamp+type+confidence)" },
  { stage: "MISSION", needs: [], produces: "qualified knowledge → decision → ODG mission (analysis ≠ auto code change)" },
]);

// the tools each capability maps to, and the OWNER_GATED install each needs when absent.
const TOOL_INSTALL = Object.freeze({
  acquire: "yt-dlp (authorized retrieval only; respect ToS)", demux: "ffmpeg/ffprobe", asr: "whisper / faster-whisper (local ASR model)",
  ocr: "tesseract-ocr", vision: "a local multimodal/vision model (Ollama text-only models CANNOT read video)",
});
const ALL_TOOLS = Object.freeze(["acquire", "demux", "asr", "ocr", "vision"]);

// The AUDITED real environment (2026-11-16): nothing multimodal present. Used as the honest default for callers/dashboard.
const PROBED_ABSENT = Object.freeze({ acquire: false, demux: false, asr: false, ocr: false, vision: false });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/* assess({toolsPresent, streams}) -> per-stage availability + overall verdict. toolsPresent = {acquire,demux,asr,ocr,
 * vision} booleans (injected; default = audited-absent). streams = {audio, images} accessibility (optional). */
function assess(opts?: any): any {
  const o = isObj(opts) ? opts : {};
  const tp: any = Object.assign({}, PROBED_ABSENT, isObj(o.toolsPresent) ? o.toolsPresent : {});
  const stages = STAGES.map((s: any) => {
    const missing = s.needs.filter((n: string) => !tp[n]);
    return Object.freeze({ stage: s.stage, produces: s.produces, needs: s.needs,
      status: missing.length === 0 ? "AVAILABLE" : "TOOL_ABSENT",
      missingTools: Object.freeze(missing), ownerGatedInstall: Object.freeze(missing.map((n: string) => (TOOL_INSTALL as any)[n])) });
  });
  const has = (k: string) => tp[k] === true;
  const canAudio = has("acquire") && has("demux") && has("asr");
  const canVisual = has("acquire") && has("demux") && (has("ocr") || has("vision"));
  const verdict = canAudio && canVisual ? "FULL" : canAudio ? "PARTIAL_AUDIO" : canVisual ? "PARTIAL_VISUAL" : "NOT_ANALYZABLE";
  const missingTools = ALL_TOOLS.filter((t) => !tp[t]);
  return Object.freeze({
    verdict, stages: Object.freeze(stages),
    analyzable: verdict !== "NOT_ANALYZABLE",
    missingTools: Object.freeze(missingTools),
    ownerGatedInstall: Object.freeze(missingTools.map((t) => (TOOL_INSTALL as any)[t])),
    note: verdict === "NOT_ANALYZABLE"
      ? "NOT_ANALYZABLE locally — the multimodal toolchain is absent; installing it is a system-package + network action (OWNER_GATED). A text LLM cannot understand a video; nothing is fabricated."
      : "partial/available ONLY for the streams whose tools are present; a speaker claim is never a verified fact without corroboration; timestamps + provenance required on every finding.",
  });
}

/* analyzeDesignatedVideos({toolsPresent}) -> honest determination for the two owner-designated videos (V213). */
function analyzeDesignatedVideos(opts?: any): any {
  const reg = VID.register();
  const cap = assess(opts);
  const videos = reg.videos.map((v: any) => Object.freeze({
    id: v.id, url: v.url,
    // a video is analyzable only if streams are accessible AND tools exist; here tools are absent ⇒ NOT_ANALYZED.
    determination: cap.analyzable ? "ANALYSIS_POSSIBLE_PENDING_STREAM_ACCESS" : "NOT_ANALYZED",
    reason: cap.analyzable
      ? "toolchain available, but stream access must still be confirmed licitly (WebFetch earlier returned NOT_ACCESSIBLE)"
      : "NOT_ANALYZED — local multimodal toolchain absent (" + cap.missingTools.join("/") + "); content is NEVER fabricated",
  }));
  return Object.freeze({ count: reg.count, videos: Object.freeze(videos), capability: cap,
    note: "reuses odg-radar-video-sources (V213); determination is NOT_ANALYZED while tools/streams are unavailable — never a fabricated summary." });
}

/* probeTools(which) -> a REAL (non-deterministic) tool probe for production callers. `which` is an injected predicate
 * (cmd:string)=>boolean so this stays testable; production passes a command -v check. NEVER installs anything. */
function probeTools(which: any): any {
  const w = typeof which === "function" ? which : () => false;
  const CMD: any = { acquire: "yt-dlp", demux: "ffmpeg", asr: "whisper", ocr: "tesseract", vision: null };
  const tp: any = {};
  for (const k of ALL_TOOLS) tp[k] = CMD[k] ? !!w(CMD[k]) : false;  // vision has no single CLI ⇒ stays false unless caller overrides
  return Object.freeze(tp);
}

const VIDEO_ANALYSIS_CHAIN_CONTRACT = Object.freeze({
  id: "V220-VIDEO-ANALYSIS-CHAIN",
  purpose: "§3 — canonical audiovisual analysis chain gate; honest capability verdict; analyzes nothing, fabricates nothing",
  invariants: Object.freeze([
    "encodes the full chain (access→audio→ASR→keyframes→OCR→visual→align→corroborate→synthesis→mission); each stage tool-gated",
    "fail-closed: tools absent ⇒ NOT_ANALYZABLE with exact missing tools; audio-only⇒PARTIAL_AUDIO; images-only⇒PARTIAL_VISUAL",
    "NEVER fabricates video/slide/talk content; a speaker claim is not a verified fact without corroboration; no DRM/login bypass",
    "local toolchain install (ffmpeg/yt-dlp/whisper/tesseract/vision model) is OWNER_GATED; a text LLM cannot understand video",
    "tool presence INJECTED (deterministic); reuses odg-radar-video-sources (V213); no second video registry/queue",
  ]),
});

module.exports = { STAGES, TOOL_INSTALL, ALL_TOOLS, PROBED_ABSENT, assess, analyzeDesignatedVideos, probeTools, VIDEO_ANALYSIS_CHAIN_CONTRACT };
export {};
