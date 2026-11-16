#!/usr/bin/env node
"use strict";
/* V220 §3 — video-analysis chain gate. Proves: encodes the full chain tool-gated; fail-closed NOT_ANALYZABLE with exact
 * missing tools when the toolchain is absent (the real environment); PARTIAL_AUDIO / PARTIAL_VISUAL / FULL per tools
 * present; designated videos stay NOT_ANALYZED (no fabrication); install is OWNER_GATED; deterministic + frozen. */
const C = require("./odg-video-analysis-chain.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // the REAL environment (all multimodal tools absent) ⇒ NOT_ANALYZABLE with the exact missing tools.
  const real = C.assess();   // default = audited-absent
  check("default (audited-absent) environment ⇒ NOT_ANALYZABLE, analyzable:false", real.verdict === "NOT_ANALYZABLE" && real.analyzable === false);
  check("exact missing tools listed (acquire/demux/asr/ocr/vision) with OWNER_GATED install commands", real.missingTools.length === 5 && real.ownerGatedInstall.some((x: string) => /ffmpeg/.test(x)) && real.ownerGatedInstall.some((x: string) => /whisper/.test(x)));
  check("honesty: NOT_ANALYZABLE note says toolchain absent + install OWNER_GATED + text LLM cannot understand video", /install.*system-package.*OWNER_GATED/i.test(real.note) && /text LLM cannot understand a video/.test(real.note));
  check("encodes the full canonical chain (12 ordered stages incl. ASR, OCR, VISUAL, ALIGNMENT, CORROBORATION, MISSION)", real.stages.length === 12 && real.stages.some((s: any) => s.stage === "SPEECH_RECOGNITION") && real.stages.some((s: any) => s.stage === "OCR_SLIDES") && real.stages.some((s: any) => s.stage === "CORROBORATION"));
  check("stages requiring absent tools are TOOL_ABSENT with their owner-gated install; stages with no tool are AVAILABLE", real.stages.find((s: any) => s.stage === "AUDIO_EXTRACTION").status === "TOOL_ABSENT" && real.stages.find((s: any) => s.stage === "CORROBORATION").status === "AVAILABLE");

  // audio-only tools present ⇒ PARTIAL_AUDIO; vision/ocr present ⇒ PARTIAL_VISUAL; all ⇒ FULL.
  const audioOnly = C.assess({ toolsPresent: { acquire: true, demux: true, asr: true } });
  check("acquire+demux+asr present ⇒ PARTIAL_AUDIO (flagged)", audioOnly.verdict === "PARTIAL_AUDIO" && audioOnly.analyzable === true);
  const visualOnly = C.assess({ toolsPresent: { acquire: true, demux: true, ocr: true } });
  check("acquire+demux+ocr present ⇒ PARTIAL_VISUAL (flagged)", visualOnly.verdict === "PARTIAL_VISUAL");
  const full = C.assess({ toolsPresent: { acquire: true, demux: true, asr: true, ocr: true, vision: true } });
  check("all tools present ⇒ FULL (corroborate + flag contradictions)", full.verdict === "FULL" && full.analyzable === true && /corroboration/.test(full.note));

  // designated videos stay NOT_ANALYZED under the real (absent) environment — never fabricated.
  const dv = C.analyzeDesignatedVideos();
  check("the 2 designated videos are NOT_ANALYZED (toolchain absent), content never fabricated", dv.count === 2 && dv.videos.every((v: any) => v.determination === "NOT_ANALYZED" && /NEVER fabricated/.test(v.reason)) && dv.videos.some((v: any) => v.id === "UeHmxZMdw2g"));
  check("with a full toolchain the determination becomes ANALYSIS_POSSIBLE_PENDING_STREAM_ACCESS (still not fabricated)", C.analyzeDesignatedVideos({ toolsPresent: { acquire: true, demux: true, asr: true, ocr: true, vision: true } }).videos.every((v: any) => /PENDING_STREAM_ACCESS/.test(v.determination)));

  // probeTools uses an injected predicate (deterministic); never installs.
  check("probeTools(which) uses the injected predicate; ffmpeg-present⇒demux true, else false", C.probeTools((c: string) => c === "ffmpeg").demux === true && C.probeTools(() => false).demux === false);

  check("contract: full chain, fail-closed, no fabrication, install OWNER_GATED, tool presence injected", C.VIDEO_ANALYSIS_CHAIN_CONTRACT.invariants.some((i: string) => /NEVER fabricates/.test(i)) && C.VIDEO_ANALYSIS_CHAIN_CONTRACT.invariants.some((i: string) => /OWNER_GATED/.test(i)) && C.VIDEO_ANALYSIS_CHAIN_CONTRACT.invariants.some((i: string) => /text LLM cannot understand video/.test(i)));
  check("deterministic + frozen", JSON.stringify(C.assess()) === JSON.stringify(real) && Object.isFrozen(real) && Object.isFrozen(C.STAGES));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — video-analysis-chain (V220 §3: canonical chain tool-gated; real env absent ⇒ NOT_ANALYZABLE with exact missing tools [OWNER_GATED install]; PARTIAL_AUDIO/PARTIAL_VISUAL/FULL per tools; designated videos NOT_ANALYZED, no fabrication; reuses V213)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
