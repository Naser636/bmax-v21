#!/usr/bin/env node
"use strict";

/*
 * V265 §3/§4/§7 — ODG BTP COMMUNICATION / DOCUMENTS / AUDIO / VIDEO capability matrix + READ-ONLY Ollama qualification
 * snapshot. Deterministic, read-only. The Ollama evidence (OLLAMA_SNAPSHOT) is a REAL read-only probe on the host (= the VPS)
 * on asOf: version, installed models, one bounded text inference (measured), and a vision probe. Like V247 MEASURED_RESULTS it
 * is static provenance-tagged data. It REUSES the existing adapters (ollama-provider / ollama-control-plane / local-model-
 * manager / generative-repair-adapter) + odg-local-model-capability (V247 PROPOSER_ONLY) — NO second provider/manager/engine.
 *
 * HONESTY (directive §4/§5/§7): Ollama's installed models are TEXT/CODING only (qwen2 family); they are PROPOSER_ONLY (V247,
 * reconfirmed — a bounded inference returned a WRONG, wrong-language answer), and an LLM NEVER overrides deterministic métré /
 * financial arithmetic / legal validation / Truth Lock. Vision/OCR/STT/video are NEEDS_SPECIALIZED_ENGINE: the models REJECT
 * images ("model does not support it"), there is no audio/video model, and heavy-model download is NOT authorized. Nothing is
 * claimed OPERATIONAL/WORLD-CLASS; a text model is NOT OCR/STT; a model accepting images would NOT be a calibrated measurer.
 */

const LMC = require("./odg-local-model-capability.js");    // V247 — PROPOSER_ONLY qualification (reuse; no 2nd capability engine)
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const CAP_STATUS = Object.freeze(["BUILT", "TESTED", "INTEGRATED", "BLOCKED", "NEEDS_SPECIALIZED_ENGINE"]);

// ---- OLLAMA_SNAPSHOT: real read-only probe (host = VPS) on asOf. Static, provenance-tagged. ----
const OLLAMA_SNAPSHOT = Object.freeze({
  asOf: "2026-11-17", provenance: "read-only probe: `ollama --version`, GET /api/tags, one bounded POST /api/generate, one images[] vision probe. No install/config/restart.",
  apiUp: true, version: "0.35.1",
  models: Object.freeze([
    Object.freeze({ name: "qwen2.5-coder:7b", params: "7.6B", family: "qwen2", kind: "TEXT_CODE" }),
    Object.freeze({ name: "qwen2.5-coder:3b", params: "3.1B", family: "qwen2", kind: "TEXT_CODE" }),
    Object.freeze({ name: "qwen2.5:0.5b", params: "494M", family: "qwen2", kind: "TEXT" }),
  ]),
  textInference: Object.freeze({ model: "qwen2.5:0.5b", executed: true, latencyMs: 2464, evalCount: 4, prompt: "FR: matériau pour couler une dalle (expected: béton)", response: "Cobre.", qualityNote: "WRONG + wrong-language (Spanish 'copper') ⇒ small model unreliable; reconfirms V247 PROPOSER_ONLY — never a trusted judge/validator" }),
  visionSupported: false, visionProbe: "POST /api/generate with images[] ⇒ HTTP 400 'Multimodal data provided, but model does not support it'",
  audioSttModel: false, videoModel: false,
  note: "Ollama UP with TEXT/CODING models only (qwen2); real text inference EXECUTES but is UNRELIABLE (PROPOSER_ONLY). NO vision/OCR/STT/video model; models reject images; heavy-model download NOT authorized.",
});

// ---- §7 capability matrix (grounded in the snapshot + the real merged modules). ----
const CAPABILITIES = Object.freeze([
  Object.freeze({ capability: "Incoming/outgoing messages + email", status: "INTEGRATED", backing: Object.freeze(["email-gateway", "client-intake"]), ollamaSuitable: false, gap: "message seam exists; real external send is OWNER_GATED (not operational); LLM drafting would be PROPOSER-only + human review" }),
  Object.freeze({ capability: "Customer conversations / CRM context", status: "INTEGRATED", backing: Object.freeze(["client-intake", "commercial-pipeline"]), ollamaSuitable: false, gap: "intake+pipeline present; full CRM history not consolidated" }),
  Object.freeze({ capability: "Document reading (structured text)", status: "TESTED", backing: Object.freeze(["document-intelligence"]), ollamaSuitable: false, gap: "TEXT docs only (confidence-gated); scanned/image documents need OCR ⇒ BLOCKED" }),
  Object.freeze({ capability: "Document generation (PDF with branding)", status: "NEEDS_SPECIALIZED_ENGINE", backing: Object.freeze([]), ollamaSuitable: false, gap: "no PDF renderer installed; devis data is ready (V260) but PDF output needs a rendering library (not present)" }),
  Object.freeze({ capability: "Images + OCR (photos/plans → text/dimensions)", status: "NEEDS_SPECIALIZED_ENGINE", backing: Object.freeze(["odg-btp-vision-voice-pipeline (ingestion+extraction only)"]), ollamaSuitable: false, gap: "no OCR engine; Ollama models REJECT images (vision not supported); a photo without scale yields no exact dimension — specialist vision/OCR model required (download unauthorized)" }),
  Object.freeze({ capability: "Audio + transcription (STT)", status: "NEEDS_SPECIALIZED_ENGINE", backing: Object.freeze(["odg-btp-vision-voice-pipeline (ingestion+extraction only)"]), ollamaSuitable: false, gap: "no STT model/engine; a TEXT model is NOT STT (§4D); specialist speech model required (download unauthorized)" }),
  Object.freeze({ capability: "Video + audiovisual analysis", status: "NEEDS_SPECIALIZED_ENGINE", backing: Object.freeze([]), ollamaSuitable: false, gap: "no video model; frame-extraction tooling (ffmpeg) absent; a model accepting images would still not be a video-understanding engine" }),
  Object.freeze({ capability: "Construction-site reporting (from structured data)", status: "INTEGRATED", backing: Object.freeze(["odg-btp-devis-engine", "odg-btp-metre-engine", "odg-btp-vision-voice-pipeline"]), ollamaSuitable: false, gap: "deterministic reporting from VALIDATED structured inputs works end-to-end; recognition-sourced inputs remain BLOCKED until OCR/STT exist" }),
  Object.freeze({ capability: "Multilingual communication (FR/AR/EN drafting)", status: "BLOCKED", backing: Object.freeze(["ollama qwen2.5-coder (via existing adapters)", "odg-local-model-capability (V247)"]), ollamaSuitable: true, gap: "Ollama text models can DRAFT (PROPOSER_ONLY) but are UNRELIABLE (the 0.5b probe answered in the wrong language); any output needs human review and NEVER overrides deterministic/legal/financial logic" }),
]);

/** buildMatrix() -> the grounded capability matrix + honest roll-up. */
function buildMatrix(): any {
  const rows = CAPABILITIES;
  const count = (s: string) => rows.filter((r: any) => r.status === s).length;
  const v247 = LMC.qualify ? LMC.qualify() : null;
  return Object.freeze({
    asOf: "2026-11-17", ollama: OLLAMA_SNAPSHOT, total: rows.length, rows,
    integrated: count("INTEGRATED"), tested: count("TESTED"), built: count("BUILT"), blocked: count("BLOCKED"), needsSpecializedEngine: count("NEEDS_SPECIALIZED_ENGINE"),
    ollamaUsefulFor: "TEXT/CODING proposer tasks ONLY (PROPOSER_ONLY per V247: " + (v247 && v247.overall ? v247.overall : "PROPOSER_ONLY") + "), via existing adapters; NOT vision/OCR/STT/video",
    note: "grounded §7 matrix: Ollama is a TEXT/CODING PROPOSER (unreliable ⇒ human review, never overrides deterministic métré/finance/legal/Truth Lock); vision/OCR/STT/video are NEEDS_SPECIALIZED_ENGINE (no model; download unauthorized). Nothing OPERATIONAL/world-class; no 2nd provider/engine built.",
  });
}

const COMMUNICATION_CAPABILITY_CONTRACT = Object.freeze({
  id: "V265-ODG-BTP-COMMUNICATION-CAPABILITY-MATRIX",
  source: "V265 §3/§4/§7 — read-only Ollama qualification + communication/documents/audio/video capability matrix",
  capStatuses: CAP_STATUS, reuses: Object.freeze(["odg-local-model-capability (V247)", "ollama-provider / ollama-control-plane / local-model-manager / generative-repair-adapter (existing adapters)"]),
  invariants: Object.freeze([
    "Ollama probe is READ-ONLY (version/tags/one bounded inference/vision probe) — no install/config/restart/download; evidence is provenance-tagged",
    "installed Ollama models are TEXT/CODING only and PROPOSER_ONLY (V247; a bounded inference returned a WRONG, wrong-language answer) — an LLM NEVER overrides deterministic métré/financial/legal/Truth Lock logic",
    "vision/OCR/STT/video are NEEDS_SPECIALIZED_ENGINE: models REJECT images, no audio/video model, heavy-model download NOT authorized; a text model is NOT OCR/STT; an image model would NOT be a calibrated measurer",
    "reuses existing adapters + V247 — NO second provider/model-manager/orchestrator/engine/primitive; pure/deterministic/read-only; nothing OPERATIONAL/world-class claimed",
  ]),
});

module.exports = { CAP_STATUS, OLLAMA_SNAPSHOT, CAPABILITIES, buildMatrix, COMMUNICATION_CAPABILITY_CONTRACT };

export {};
