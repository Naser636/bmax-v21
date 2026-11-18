#!/usr/bin/env node
"use strict";
/* V280/V281 §4 (P2 Lot 5) — Sécurité/Qualité / Documents / Gouvernance functional assistants. Asserts real domain computation
 * (FMEA residual register via safety-fmea; document reconciliation fail-closed via document-intelligence; OWASP threat-coverage
 * posture), no-site-declared-safe, OCR-blocked honesty, posture≠certification, prepare-only, PARTIAL maturity. SYNTHETIC. */
const A = require("./odg-governance-quality-assistants.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  const input = {
    surfaceCtx: { dashboard: { asOf: 10, nowDay: 12, odg: { missions: [{ id: "M1", status: "READY" }] } } },  // commercial absent ⇒ UNKNOWN
    safetyComponents: [{ id: "echaf", failureModes: [{ mode: "chute de hauteur", severity: 9, occurrence: 3, detection: 4, mitigated: false }] }],
    documents: {},   // no quote/invoice ⇒ MISSING_DATA (fail-closed)
  };

  const lot = A.runLot5(input);
  check("runLot5: 3 assistants (Sécurité-Qualité/Documents/Gouvernance), all ok, all PREPARE-only, NONE operational; 15/20 domains",
    lot.ok && lot.assistantCount === 3 && lot.allPrepareOnly === true && lot.anyOperational === false && /15 of 20/.test(lot.note));

  const sq = A.runGovernanceQualityAssistant("SECURITE_QUALITE", input);
  check("Sécurité/Qualité: real FMEA via safety-fmea — 1 component, 1 failure mode, 1 critical residual; residual requires acceptance",
    sq.ok && sq.domainFindings.kind === "SAFETY_QUALITY" && sq.domainFindings.components === 1 && sq.domainFindings.failureModes === 1 && sq.domainFindings.criticalResidual === 1 && sq.domainFindings.residualRequiresAcceptance === true);
  check("Sécurité/Qualité: NO AI declares a site safe (level D); forbidden to declare safe / silently clear a residual risk",
    sq.domainFindings.siteNeverDeclaredSafeByAI === true && sq.decisionLevelMax === "D" && sq.forbiddenActions.some((x: string) => /declare a site\/operation physically safe/.test(x)) && sq.forbiddenActions.some((x: string) => /silently clear a residual/.test(x)));

  const doc = A.runGovernanceQualityAssistant("DOCUMENTS", input);
  check("Documents: reconcileDossier fail-closed MISSING_DATA (no quote/invoice); scanned/image needs OCR (BLOCKED), text-only",
    doc.ok && doc.domainFindings.kind === "DOCUMENTS" && doc.domainFindings.status === "MISSING_DATA" && doc.domainFindings.anomalies >= 1 && doc.domainFindings.scannedImageNeedsOCR === true && doc.domainFindings.ocrAvailable === false && doc.domainFindings.textDocumentsOnly === true);
  check("Documents: forbidden to recognise a scanned doc without OCR / assume a missing document's content / send externally",
    doc.forbiddenActions.some((x: string) => /recognise a scanned\/image document/.test(x)) && doc.forbiddenActions.some((x: string) => /assume a missing document/.test(x)) && doc.forbiddenActions.some((x: string) => /send a document externally/.test(x)));

  const gov = A.runGovernanceQualityAssistant("GOUVERNANCE", input);
  check("Gouvernance: real OWASP posture via scorecard — 17 threats, 8 covered, 8 partial, 0 gap; NOT a security certification; deny-by-default",
    gov.ok && gov.domainFindings.kind === "GOVERNANCE" && gov.domainFindings.threats === 17 && gov.domainFindings.covered === 8 && gov.domainFindings.partial === 8 && gov.domainFindings.gap === 0 && gov.domainFindings.isSecurityCertification === false && gov.domainFindings.denyByDefault === true && gov.domainFindings.denyByDefaultProvenEmpirically === true);
  check("Gouvernance: forbidden to claim certification / declare the system secure / weaken a validator; posture ≠ certification (UNKNOWN stays UNKNOWN)",
    gov.forbiddenActions.some((x: string) => /claim security certification/.test(x)) && gov.forbiddenActions.some((x: string) => /declare the system secure/.test(x)) && gov.forbiddenActions.some((x: string) => /weaken a validator/.test(x)));

  // UNKNOWN surfacing + prepare-only + maturity + fail-closed + determinism + contract.
  check("UNKNOWN ≠ 0 surfaced (commercial absent ⇒ missingDataCount>0, decidable false)", sq.missingDataCount > 0 && sq.decidable === false && gov.missingDataCount > 0);
  check("every assistant: executesNothing true, maturity PARTIAL not operational", [sq, doc, gov].every((a: any) => a.executesNothing === true && a.maturity.status === "PARTIAL" && a.maturity.operational === false));
  check("unknown assistant id ⇒ UNKNOWN_ASSISTANT (fail-closed)", A.runGovernanceQualityAssistant("ENV_XYZ", input).code === "UNKNOWN_ASSISTANT");
  check("deterministic + frozen", JSON.stringify(A.runGovernanceQualityAssistant("GOUVERNANCE", input)) === JSON.stringify(gov) && Object.isFrozen(A.GQ_ASSISTANTS));
  check("contract: reuse safety-fmea/document-intelligence/owasp (no new engine); no-AI-safe; OCR BLOCKED; posture≠certification; PARTIAL",
    A.GOVERNANCE_QUALITY_ASSISTANTS_CONTRACT.reuses.some((x: string) => /safety-fmea/.test(x)) && A.GOVERNANCE_QUALITY_ASSISTANTS_CONTRACT.reuses.some((x: string) => /document-intelligence/.test(x)) && A.GOVERNANCE_QUALITY_ASSISTANTS_CONTRACT.invariants.some((i: string) => /NO AI declares a site physically safe/.test(i)) && A.GOVERNANCE_QUALITY_ASSISTANTS_CONTRACT.invariants.some((i: string) => /POSTURE snapshot, NOT a security certification/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-governance-quality-assistants (V280/V281 P2 Lot 5: Sécurité/Qualité [FMEA residual register, NO AI declares site safe, level D] / Documents [reconcileDossier fail-closed MISSING_DATA, scanned needs OCR BLOCKED] / Gouvernance [OWASP 17 threats/8 covered/8 partial/0 gap posture ≠ certification, deny-by-default]; all PREPARE/RECOMMEND only; UNKNOWN≠0; PARTIAL not OPERATIONAL; 15/20 domains; reuse — no new engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
