#!/usr/bin/env node
"use strict";

/*
 * V282 (P4) — ODG OCR/STT/PDF ENGINE QUALIFICATION + 5-BENCHMARK RECONCILIATION (deterministic, provenance-first). This is the
 * honest §3/§4/§5/§6/§7/§8 qualification: it records REAL forensic probes of THIS machine (2026-11-18) and fail-closes the
 * per-family verdict. It does NOT fake engine installation or benchmark execution (§1: deliver measured results OR a precisely
 * documented blocker — this is the precisely documented blocker for the families that are not installable here).
 *
 * REAL FORENSIC FACTS (probed read-only, no sudo/global change):
 *   - CPU 8-core Intel Haswell (AVX2, no AVX512, no TSX); RAM ~21 GiB free; disk ~160 GiB free; GPU ABSENT (no /dev/nvidia*).
 *   - node v22; Python 3.14.4 with NO pip and NO ensurepip module ⇒ Python packages are NOT installable here.
 *   - OCR/STT system binaries ABSENT: tesseract, pdftotext, pdfinfo, gs (ghostscript), whisper, ffmpeg — all absent; apt/system
 *     install needs sudo (FORBIDDEN).
 *   - npm registry IS reachable (pdfjs-dist resolves) ⇒ a pure-JS PDF NATIVE-text adapter is installable (no system dep/weights).
 *
 * PER-FAMILY VERDICT (fail-closed, measured):
 *   - OCR  : BLOCKED_NOT_INSTALLABLE. Candidates (Tesseract 5 / RapidOCR / PaddleOCR) are license-permissive (Apache-2.0) but
 *            require either a system package (tesseract ⇒ sudo, forbidden) or pip (RapidOCR/PaddleOCR/onnxruntime ⇒ pip absent).
 *   - STT  : BLOCKED_NOT_INSTALLABLE. Whisper / faster-whisper need pip (+ ffmpeg system dep) — both absent, no pip/ensurepip.
 *   - PDF  : SPLIT — native text extraction = QUALIFIED_INSTALLABLE (pdfjs-dist, Apache-2.0, pure-JS, npm-reachable); page
 *            RENDER + scanned-page OCR = BLOCKED (needs poppler/ghostscript system deps + an OCR engine, both absent).
 *
 * 5 CANONICAL BENCHMARKS (§7 — FOUND, not invented): the project's 5 benchmarks are the odg-benchmark-audit (V243) INSUFFICIENT
 * set — BrowseComp / GDPval / WebArena / METR / SciAgentArena — EXTERNAL AI-agent evals whose datasets/harnesses are gated/
 * uncorroborated ⇒ BLOCKED_EXTERNAL_DATASET. They are NOT OCR/STT/PDF benchmarks; V282's OCR framing is reconciled here honestly.
 * REUSES odg-benchmark-audit (no new/invented benchmark). Deterministic/read-only. Nothing claimed executed; ESTIMATED never MEASURED.
 */

const AUDIT = require("./odg-benchmark-audit.js");   // V243 — the real 8-benchmark audit (5 INSUFFICIENT); reused, not re-invented

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const PROBE_ASOF = "2026-11-18";
const INSTALL_STATUS = Object.freeze(["QUALIFIED_INSTALLABLE", "BLOCKED_NOT_INSTALLABLE", "BLOCKED_SYSTEM_DEP", "BLOCKED_EXTERNAL_DATASET"]);

// ---- real hardware/runtime snapshot (probed read-only on PROBE_ASOF). ----
const HARDWARE = Object.freeze({
  asOf: PROBE_ASOF, cpu: "Intel Haswell, 8 cores", simd: Object.freeze(["sse4_2", "avx2"]), avx512: false, gpu: false,
  ramFreeGiB: 21, diskFreeGiB: 160, node: "v22", python: "3.14.4", pip: false, ensurepip: false, npmReachable: true,
  note: "probed read-only; no sudo / no system change. Python has NO pip/ensurepip ⇒ no Python-package install; system pkgs need sudo (forbidden); npm IS reachable.",
});

// ---- candidate engine qualification (license checked separately from installability). ----
const OCR_CANDIDATES = Object.freeze([
  Object.freeze({ engine: "Tesseract 5", codeLicence: "Apache-2.0", licencePermits: true, installVia: "system package (apt)", installable: false, blocker: "requires sudo/system install (FORBIDDEN)", status: "BLOCKED_SYSTEM_DEP" }),
  Object.freeze({ engine: "RapidOCR (ONNXRuntime)", codeLicence: "Apache-2.0", licencePermits: true, installVia: "pip (onnxruntime + rapidocr-onnxruntime)", installable: false, blocker: "pip + ensurepip ABSENT (Python 3.14, no pip); onnxruntime wheels for 3.14 unverified", status: "BLOCKED_NOT_INSTALLABLE" }),
  Object.freeze({ engine: "PaddleOCR (CPU)", codeLicence: "Apache-2.0", licencePermits: true, installVia: "pip (paddlepaddle + paddleocr)", installable: false, blocker: "pip ABSENT; heavy CPU wheels; model-weight download required", status: "BLOCKED_NOT_INSTALLABLE" }),
]);
const STT_CANDIDATES = Object.freeze([
  Object.freeze({ engine: "whisper.cpp", codeLicence: "MIT", weightsLicence: "MIT (OpenAI Whisper weights)", licencePermits: true, installVia: "build from source (C++ compiler) + model download", installable: false, blocker: "model-weight download + build toolchain unverified; ffmpeg (system dep) ABSENT for audio decode", status: "BLOCKED_NOT_INSTALLABLE" }),
  Object.freeze({ engine: "faster-whisper", codeLicence: "MIT", licencePermits: true, installVia: "pip (ctranslate2) + model download", installable: false, blocker: "pip ABSENT; ffmpeg ABSENT; model-weight download required", status: "BLOCKED_NOT_INSTALLABLE" }),
]);
const PDF_CANDIDATES = Object.freeze([
  Object.freeze({ engine: "pdfjs-dist (native text layer)", codeLicence: "Apache-2.0", licencePermits: true, installVia: "npm (pure JS, no system dep, no weights)", installable: true, blocker: null, status: "QUALIFIED_INSTALLABLE", note: "npm-reachable; qualifies for NATIVE text-layer extraction only — NOT scanned-page OCR" }),
  Object.freeze({ engine: "pypdf (native text layer)", codeLicence: "BSD-3-Clause", licencePermits: true, installVia: "pip", installable: false, blocker: "pip ABSENT", status: "BLOCKED_NOT_INSTALLABLE" }),
  Object.freeze({ engine: "Poppler / Ghostscript (render to image)", codeLicence: "GPL/AGPL", licencePermits: false, installVia: "system package", installable: false, blocker: "sudo system install (FORBIDDEN); GPL/AGPL licence needs explicit review for a proprietary product", status: "BLOCKED_SYSTEM_DEP" }),
  Object.freeze({ engine: "PyMuPDF", codeLicence: "AGPL-3.0", licencePermits: false, installVia: "pip", installable: false, blocker: "pip ABSENT; AGPL licence incompatible with proprietary integration without explicit owner review", status: "BLOCKED_NOT_INSTALLABLE" }),
]);

function familyVerdict(candidates: any[]): any {
  const anyInstallable = candidates.some((c: any) => c.installable === true && c.licencePermits === true);
  const selected = candidates.find((c: any) => c.installable === true && c.licencePermits === true) || null;
  return Object.freeze({ anyInstallable, selectedEngine: selected ? selected.engine : null, candidates: Object.freeze(candidates) });
}

/** qualify() -> the full P4 qualification matrix + fail-closed per-family verdict. No engine fabricated as installed. */
function qualify(): any {
  const ocr = familyVerdict(OCR_CANDIDATES.slice());
  const stt = familyVerdict(STT_CANDIDATES.slice());
  const pdf = familyVerdict(PDF_CANDIDATES.slice());
  return Object.freeze({
    asOf: PROBE_ASOF, hardware: HARDWARE,
    ocr: Object.freeze({ family: "OCR", verdict: ocr.anyInstallable ? "QUALIFIED" : "BLOCKED_NOT_INSTALLABLE", selectedEngine: ocr.selectedEngine, candidates: ocr.candidates, extractionAchievable: ocr.anyInstallable }),
    stt: Object.freeze({ family: "STT", verdict: stt.anyInstallable ? "QUALIFIED" : "BLOCKED_NOT_INSTALLABLE", selectedEngine: stt.selectedEngine, candidates: stt.candidates, transcriptionAchievable: stt.anyInstallable }),
    pdf: Object.freeze({ family: "PDF", nativeTextVerdict: pdf.anyInstallable ? "QUALIFIED_INSTALLABLE" : "BLOCKED_NOT_INSTALLABLE", nativeTextEngine: pdf.selectedEngine, renderAndScanOcrVerdict: "BLOCKED_SYSTEM_DEP_AND_OCR", candidates: pdf.candidates, note: "native text-layer extraction is installable (pdfjs-dist, Apache-2.0); page render + scanned-page OCR remain BLOCKED (system deps + OCR engine absent)" }),
    note: "fail-closed qualification on the REAL machine: OCR + STT NOT installable (no pip/ensurepip; system pkgs need sudo); PDF native-text is installable (pdfjs-dist) but its adapter is a bounded next unit, scanned-OCR BLOCKED. No engine is claimed installed; nothing is claimed executed; ESTIMATED never MEASURED.",
  });
}

/** reconcileBenchmarks() -> the 5 canonical benchmarks are the odg-benchmark-audit INSUFFICIENT set (NOT OCR benchmarks). */
function reconcileBenchmarks(): any {
  const a = AUDIT.audit();
  const insufficient = AUDIT.BENCHMARKS.filter((b: any) => b.corroboration === "INSUFFICIENT_EVIDENCE");
  return Object.freeze({
    source: "odg-benchmark-audit (V243) — reused, NOT re-invented",
    totalAudited: a.total, canonicalFiveInsufficient: Object.freeze(insufficient.map((b: any) => b.id)),
    fiveCount: insufficient.length,
    verdict: "BLOCKED_EXTERNAL_DATASET",
    whyBlocked: "the 5 canonical benchmarks (BrowseComp/GDPval/WebArena/METR/SciAgentArena) are EXTERNAL AI-agent evals with no corroborated source/availability/licence and gated datasets — not obtainable in this environment; fail-closed INSUFFICIENT_EVIDENCE (never fabricated as executed)",
    notOcrBenchmarks: true,
    v282Reconciliation: "V282 framed P4 as 'OCR/STT/PDF + 5 benchmarks', but the project's 5 canonical benchmarks are these external AI evals — NOT OCR/STT/PDF tests. Inventing 5 OCR tests and calling them 'the 5 canonical benchmarks' is explicitly forbidden (§7); the real identities are preserved and their blocker documented.",
    anyScoreEmitted: a.anyScoreEmitted === false ? false : a.anyScoreEmitted,
  });
}

/** businessImpact() -> honest status of the devis functions that depend on recognition (1/2/3/16). */
function businessImpact(): any {
  return Object.freeze({
    devisFunctionsDependingOnRecognition: Object.freeze([1, 2, 3, 16]),
    status: "BLOCKED",
    reason: "fns 1 (photo→devis), 2 (plan PDF/image→devis), 3 (voix→devis), 16 (PDF branded output) require OCR/STT/PDF-render which are BLOCKED_NOT_INSTALLABLE here; a mere adapter would NOT unblock them (no engine installed). Remain BLOCKED — never claimed unblocked on adapter presence alone.",
    pdfNativeTextWouldHelp: "function 2 PARTIALLY, only for PDFs that already carry a text layer (not scans) — and only once the pdfjs-dist adapter is built + measured (not done this unit).",
  });
}

const P4_ENGINE_QUALIFICATION_CONTRACT = Object.freeze({
  id: "V282-ODG-P4-ENGINE-QUALIFICATION",
  source: "V282 (P4) — OCR/STT/PDF engine qualification on real hardware + 5-benchmark reconciliation",
  installStatuses: INSTALL_STATUS,
  reuses: Object.freeze(["odg-benchmark-audit (V243 — the 5 canonical INSUFFICIENT benchmarks)"]),
  invariants: Object.freeze([
    "forensic facts probed on the REAL machine (no pip/ensurepip ⇒ no Python install; no sudo ⇒ no system pkg; npm reachable); nothing assumed from old specs",
    "OCR + STT: BLOCKED_NOT_INSTALLABLE — candidates are license-permissive (Apache-2.0/MIT) but not installable here; NO engine fabricated as installed; nothing claimed executed; ESTIMATED never MEASURED",
    "PDF: native-text extraction QUALIFIED_INSTALLABLE (pdfjs-dist Apache-2.0, pure-JS, npm-reachable); render + scanned-OCR BLOCKED (system deps + OCR absent); AGPL/GPL engines flagged licence-incompatible without owner review",
    "the 5 canonical benchmarks are the odg-benchmark-audit INSUFFICIENT external AI evals (BrowseComp/GDPval/WebArena/METR/SciAgentArena) — BLOCKED_EXTERNAL_DATASET, NOT OCR benchmarks; reused not invented (§7); no score emitted",
    "devis fns 1/2/3/16 remain BLOCKED (recognition absent) — never claimed unblocked on adapter presence; deterministic/read-only; no new primitive",
  ]),
});

module.exports = { HARDWARE, OCR_CANDIDATES, STT_CANDIDATES, PDF_CANDIDATES, INSTALL_STATUS, qualify, reconcileBenchmarks, businessImpact, P4_ENGINE_QUALIFICATION_CONTRACT };

export {};
