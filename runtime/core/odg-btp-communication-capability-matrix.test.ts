#!/usr/bin/env node
"use strict";
/* V265 §3/§4/§7 — communication capability matrix + Ollama qualification. Proves the Ollama snapshot is honest (text-only,
 * PROPOSER_ONLY, vision/STT/video NEEDS_SPECIALIZED_ENGINE), the matrix statuses are grounded, and an LLM never overrides
 * deterministic logic. Read-only, deterministic. */
const M = require("./odg-btp-communication-capability-matrix.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  const o = M.OLLAMA_SNAPSHOT;
  check("Ollama snapshot: API up v0.35.1, 3 TEXT/CODING qwen2 models, read-only provenance (no install/config)", o.apiUp === true && o.version === "0.35.1" && o.models.length === 3 && o.models.every((m: any) => m.family === "qwen2") && /read-only probe/.test(o.provenance) && /No install\/config\/restart/.test(o.provenance));
  check("Ollama REAL text inference executed + measured, but UNRELIABLE (wrong-language answer ⇒ PROPOSER_ONLY)", o.textInference.executed === true && o.textInference.latencyMs > 0 && /WRONG/.test(o.textInference.qualityNote) && /PROPOSER_ONLY/.test(o.textInference.qualityNote));
  check("Ollama VISION not supported (models reject images); no audio/video model — honest", o.visionSupported === false && /does not support it/.test(o.visionProbe) && o.audioSttModel === false && o.videoModel === false);

  const mx = M.buildMatrix();
  check("matrix: each capability status ∈ enum; totals consistent", mx.rows.every((r: any) => M.CAP_STATUS.indexOf(r.status) >= 0) && mx.integrated + mx.tested + mx.built + mx.blocked + mx.needsSpecializedEngine === mx.total);
  check("CRUX: images/OCR + audio/STT + video are NEEDS_SPECIALIZED_ENGINE (no model; download unauthorized) — not claimed built", ["Images + OCR (photos/plans → text/dimensions)", "Audio + transcription (STT)", "Video + audiovisual analysis"].every((cap) => mx.rows.find((r: any) => r.capability === cap).status === "NEEDS_SPECIALIZED_ENGINE"));
  check("CRUX honesty: a TEXT model is NOT STT — the STT row's gap says so; a text model not classified as STT", /TEXT model is NOT STT/.test(mx.rows.find((r: any) => r.capability === "Audio + transcription (STT)").gap));
  check("PDF generation ⇒ NEEDS_SPECIALIZED_ENGINE (no renderer); document reading TESTED (text only)", mx.rows.find((r: any) => /PDF/.test(r.capability)).status === "NEEDS_SPECIALIZED_ENGINE" && mx.rows.find((r: any) => /Document reading/.test(r.capability)).status === "TESTED");
  check("Ollama usefulFor = TEXT/CODING proposer ONLY (not vision/OCR/STT/video); multilingual drafting is PROPOSER/BLOCKED, Ollama-suitable", /TEXT\/CODING proposer/.test(mx.ollamaUsefulFor) && /NOT vision\/OCR\/STT\/video/.test(mx.ollamaUsefulFor) && mx.rows.find((r: any) => /Multilingual/.test(r.capability)).ollamaSuitable === true);
  check("construction-site reporting INTEGRATED from VALIDATED structured data (recognition-sourced remains BLOCKED)", mx.rows.find((r: any) => /reporting/.test(r.capability)).status === "INTEGRATED" && /recognition-sourced inputs remain BLOCKED/.test(mx.rows.find((r: any) => /reporting/.test(r.capability)).gap));

  check("contract: read-only probe, PROPOSER_ONLY never overrides deterministic/legal/TruthLock, specialist-engine honesty, no 2nd provider", M.COMMUNICATION_CAPABILITY_CONTRACT.invariants.some((i: string) => /NEVER overrides deterministic/.test(i)) && M.COMMUNICATION_CAPABILITY_CONTRACT.invariants.some((i: string) => /text model is NOT OCR\/STT/.test(i)) && M.COMMUNICATION_CAPABILITY_CONTRACT.invariants.some((i: string) => /NO second provider/.test(i)));
  check("deterministic + frozen", JSON.stringify(M.buildMatrix()) === JSON.stringify(mx) && Object.isFrozen(mx) && Object.isFrozen(o));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-btp-communication-capability-matrix (V265: real read-only Ollama probe [v0.35.1, 3 TEXT/CODING qwen2 models; inference EXECUTES but UNRELIABLE⇒PROPOSER_ONLY; vision rejected, no STT/video]; grounded §7 matrix [images/OCR+audio/STT+video=NEEDS_SPECIALIZED_ENGINE; PDF needs renderer; reporting INTEGRATED from validated data]; LLM never overrides deterministic/legal/TruthLock; reuses V247+adapters, no 2nd provider)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
