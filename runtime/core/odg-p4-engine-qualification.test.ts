#!/usr/bin/env node
"use strict";
/* V282 (P4) — OCR/STT/PDF engine qualification + 5-benchmark reconciliation. Asserts the fail-closed verdicts on the REAL
 * machine (OCR/STT BLOCKED_NOT_INSTALLABLE — no pip/sudo; PDF native-text QUALIFIED via pdfjs-dist, scanned-OCR BLOCKED), the
 * 5 canonical benchmarks = odg-benchmark-audit INSUFFICIENT set (reused not invented, external-dataset BLOCKED), and that NO
 * engine is fabricated as installed / nothing claimed executed / devis fns 1/2/3/16 stay BLOCKED. */
const fs = require("fs");
const Q = require("./odg-p4-engine-qualification.js");
const AUDIT = require("./odg-benchmark-audit.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  // hardware forensic facts (real): no pip/ensurepip, npm reachable, no GPU.
  check("hardware snapshot: no GPU, NO pip, NO ensurepip, npm reachable (Python-package install impossible here)",
    Q.HARDWARE.gpu === false && Q.HARDWARE.pip === false && Q.HARDWARE.ensurepip === false && Q.HARDWARE.npmReachable === true);

  const q = Q.qualify();
  // OCR + STT fail-closed BLOCKED (no installable engine), but candidates are license-permissive (honest separation).
  check("OCR: BLOCKED_NOT_INSTALLABLE, no engine selected; candidates license-permissive (Apache-2.0) but not installable (sudo/pip)",
    q.ocr.verdict === "BLOCKED_NOT_INSTALLABLE" && q.ocr.selectedEngine === null && q.ocr.extractionAchievable === false && Q.OCR_CANDIDATES.every((c: any) => c.licencePermits === true && c.installable === false));
  check("STT: BLOCKED_NOT_INSTALLABLE, no engine selected (whisper/faster-whisper need pip+ffmpeg, both absent)",
    q.stt.verdict === "BLOCKED_NOT_INSTALLABLE" && q.stt.selectedEngine === null && q.stt.transcriptionAchievable === false);
  // PDF split: native-text QUALIFIED via pdfjs-dist (Apache-2.0), render+scanned-OCR BLOCKED.
  check("PDF: native-text QUALIFIED_INSTALLABLE (pdfjs-dist, Apache-2.0, pure-JS, npm-reachable); render+scanned-OCR BLOCKED",
    q.pdf.nativeTextVerdict === "QUALIFIED_INSTALLABLE" && /pdfjs-dist/.test(q.pdf.nativeTextEngine) && q.pdf.renderAndScanOcrVerdict === "BLOCKED_SYSTEM_DEP_AND_OCR");
  check("PDF honesty: AGPL/GPL engines (PyMuPDF/Poppler/Ghostscript) flagged licence-NOT-permitting without owner review",
    Q.PDF_CANDIDATES.some((c: any) => /PyMuPDF/.test(c.engine) && c.codeLicence === "AGPL-3.0" && c.licencePermits === false) && Q.PDF_CANDIDATES.some((c: any) => /Poppler/.test(c.engine) && c.licencePermits === false));

  // 5 canonical benchmarks = odg-benchmark-audit INSUFFICIENT set (reused, not invented); external-dataset BLOCKED.
  const rec = Q.reconcileBenchmarks();
  const auditInsufficient = AUDIT.BENCHMARKS.filter((b: any) => b.corroboration === "INSUFFICIENT_EVIDENCE").map((b: any) => b.id).sort();
  check("5 canonical benchmarks FOUND = odg-benchmark-audit INSUFFICIENT set (browsecomp/gdpval/webarena/metr/sciagentarena), reused not invented",
    rec.fiveCount === 5 && JSON.stringify(rec.canonicalFiveInsufficient.slice().sort()) === JSON.stringify(auditInsufficient) && /odg-benchmark-audit/.test(rec.source));
  check("5 benchmarks BLOCKED_EXTERNAL_DATASET, NOT OCR benchmarks; no score emitted (fail-closed, never fabricated as executed)",
    rec.verdict === "BLOCKED_EXTERNAL_DATASET" && rec.notOcrBenchmarks === true && rec.anyScoreEmitted === false && /forbidden/.test(rec.v282Reconciliation));

  // business impact: devis fns 1/2/3/16 remain BLOCKED (never unblocked on adapter presence alone).
  const bi = Q.businessImpact();
  check("devis fns 1/2/3/16 remain BLOCKED (recognition absent); not claimed unblocked on adapter presence",
    JSON.stringify(bi.devisFunctionsDependingOnRecognition) === JSON.stringify([1, 2, 3, 16]) && bi.status === "BLOCKED" && /would NOT unblock/.test(bi.reason));

  // determinism + contract + no-engine-fabricated.
  check("deterministic + frozen", JSON.stringify(Q.qualify()) === JSON.stringify(q) && Object.isFrozen(Q.HARDWARE) && Object.isFrozen(q));
  check("no engine fabricated as installed anywhere (OCR/STT selectedEngine null; only pdfjs-dist installable=true)",
    q.ocr.selectedEngine === null && q.stt.selectedEngine === null && Q.OCR_CANDIDATES.concat(Q.STT_CANDIDATES).every((c: any) => c.installable === false) && Q.PDF_CANDIDATES.filter((c: any) => c.installable === true).every((c: any) => /pdfjs-dist/.test(c.engine)));
  check("contract: real-hardware probe; OCR/STT BLOCKED; PDF native QUALIFIED; 5 benchmarks reused-not-invented; ESTIMATED never MEASURED",
    Q.P4_ENGINE_QUALIFICATION_CONTRACT.reuses.some((r: string) => /odg-benchmark-audit/.test(r)) && Q.P4_ENGINE_QUALIFICATION_CONTRACT.invariants.some((i: string) => /BLOCKED_NOT_INSTALLABLE/.test(i)) && Q.P4_ENGINE_QUALIFICATION_CONTRACT.invariants.some((i: string) => /reused not invented/.test(i)) && Q.P4_ENGINE_QUALIFICATION_CONTRACT.invariants.some((i: string) => /ESTIMATED never MEASURED/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-p4-engine-qualification (V282 P4: REAL-machine forensic qualification — OCR+STT BLOCKED_NOT_INSTALLABLE [no pip/ensurepip, no sudo; candidates Apache-2.0/MIT but uninstallable], PDF native-text QUALIFIED [pdfjs-dist Apache-2.0 npm-reachable] + render/scanned-OCR BLOCKED [AGPL/GPL flagged]; 5 canonical benchmarks = odg-benchmark-audit INSUFFICIENT set [browsecomp/gdpval/webarena/metr/sciagentarena] BLOCKED_EXTERNAL_DATASET reused-not-invented; devis 1/2/3/16 stay BLOCKED; no engine fabricated, nothing executed)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
