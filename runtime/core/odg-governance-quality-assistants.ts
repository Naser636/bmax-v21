#!/usr/bin/env node
"use strict";

/*
 * V280 §4 (P2 Lot 5) — ODG FUNCTIONAL ASSISTANTS: Sécurité/Qualité (D10), Documents (D15), Gouvernance (D19). Canonical domain
 * names verified against odg-btp-company-management-coverage (V269). REAL functional assistants: each composes the V275 surface
 * AND its domain engine(s) for deterministic findings.
 *
 * REUSE (no new engine / no duplication):
 *   - D10 Sécurité/Qualité: safety-fmea.buildRiskRegister (RPN residual risk register).
 *   - D15 Documents: document-intelligence.reconcileDossier (order-to-cash doc reconciliation, fail-closed on missing docs).
 *   - D19 Gouvernance: odg-owasp-agentic-matrix.scorecard (threat coverage) + odg-api-security-posture (deny-by-default).
 *   - All: odg-executive-surface (V275) for governed context.
 *
 * HONESTY: PREPARE/RECOMMEND only (executionResult null). Sécurité = level D: NO AI declares a site physically safe; an RPN /
 * alert is a signal, residual CRITICAL/HIGH requires explicit owner acceptance. Documents: scanned/image documents need OCR
 * (BLOCKED — recognition absent); text-only reconciliation; a missing doc ⇒ MISSING_DATA (fail-closed). Gouvernance: a threat-
 * coverage scorecard is a POSTURE snapshot, NOT a security certification. UNKNOWN ≠ 0; no assistant OPERATIONAL. Deterministic.
 */

const SURFACE = require("./odg-executive-surface.js");            // V275
const FMEA = require("./safety-fmea.js");                        // buildRiskRegister
const DOCINT = require("./document-intelligence.js");            // reconcileDossier
const OWASP = require("./odg-owasp-agentic-matrix.js");          // scorecard
const APISEC = require("./odg-api-security-posture.js");         // validate (deny-by-default, genuinely exercised)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const GQ_ASSISTANTS = Object.freeze({
  SECURITE_QUALITE: Object.freeze({
    id: "SECURITE_QUALITE", domain: "Sécurité, qualité et environnement (D10)", engine: "safety-fmea.buildRiskRegister",
    mandate: "build the FMEA risk register, surface residual CRITICAL/HIGH risks and quality non-conformities — an RPN/alert is a signal; NO AI declares a site physically safe; residual risk requires explicit human acceptance (level D)",
    authorizedActions: Object.freeze(["compute the FMEA residual risk register", "surface residual CRITICAL/HIGH risks for acceptance", "flag quality non-conformities"]),
    forbiddenActions: Object.freeze(["declare a site/operation physically safe", "silently clear a residual CRITICAL/HIGH risk", "replace a competent person's on-site control", "validate a DUERP/PPSPS autonomously"]),
    decisionLevelMax: "D",
  }),
  DOCUMENTS: Object.freeze({
    id: "DOCUMENTS", domain: "Documents, communications et administration (D15)", engine: "document-intelligence.reconcileDossier",
    mandate: "reconcile the order-to-cash document dossier, detect missing/duplicate/incoherent documents — TEXT documents only; scanned/image documents need OCR (BLOCKED); a missing core document ⇒ MISSING_DATA (fail-closed)",
    authorizedActions: Object.freeze(["reconcile quote↔order↔invoice↔delivery (text)", "flag missing/duplicate/incoherent documents", "flag documents requiring OCR (not available)"]),
    forbiddenActions: Object.freeze(["recognise a scanned/image document without a real OCR engine", "assume a missing document's content", "send a document externally"]),
    decisionLevelMax: "B",
  }),
  GOUVERNANCE: Object.freeze({
    id: "GOUVERNANCE", domain: "Sécurité, confiance et gouvernance (D19)", engine: "odg-owasp-agentic-matrix.scorecard + odg-api-security-posture",
    mandate: "report the agentic-threat coverage posture and the deny-by-default API posture — a POSTURE snapshot, NOT a security certification; gaps are tracked, never hidden",
    authorizedActions: Object.freeze(["report threat-coverage posture (covered/partial/gap)", "flag coverage gaps as tracked work", "confirm deny-by-default enforcement"]),
    forbiddenActions: Object.freeze(["claim security certification/compliance", "declare the system secure", "weaken a validator or permission"]),
    decisionLevelMax: "C",
  }),
});

function domainFindings(id: string, input: any): any {
  const i = isObj(input) ? input : {};
  if (id === "SECURITE_QUALITE") {
    const reg = FMEA.buildRiskRegister(arr(i.safetyComponents));
    const s = reg.summary;
    return Object.freeze({ kind: "SAFETY_QUALITY", components: s.components, failureModes: s.failureModes, criticalResidual: s.criticalResidual, highResidual: s.highResidual, unmitigatedHighOrCritical: s.unmitigatedHighOrCritical, residualRequiresAcceptance: (s.criticalResidual + s.highResidual) > 0, siteNeverDeclaredSafeByAI: true });
  }
  if (id === "DOCUMENTS") {
    const doss = DOCINT.reconcileDossier(isObj(i.documents) ? i.documents : {});
    return Object.freeze({ kind: "DOCUMENTS", status: doss.status, anomalies: arr(doss.anomalies).length, scannedImageNeedsOCR: true, ocrAvailable: false, textDocumentsOnly: true });
  }
  if (id === "GOUVERNANCE") {
    const sc = OWASP.scorecard();
    // deny-by-default is DERIVED from a real odg-api-security-posture.validate probe: an undeclared path must be rejected.
    const probe = APISEC.validate({ paths: {} }, { path: "/__undeclared_probe__", method: "GET" });
    const denyByDefault = probe.admitted === false && Array.isArray(probe.violations) && probe.violations.some((v: string) => /deny-by-default/.test(String(v)));
    // covered/partial/gap are reported as-is from the scorecard; they need not sum to totalThreats (other coverage buckets may
    // exist). We never force a tally — the posture is reported honestly, gaps tracked, NOT presented as a certification.
    return Object.freeze({ kind: "GOVERNANCE", threats: sc.totalThreats, covered: sc.covered, partial: sc.partial, gap: sc.gap, isSecurityCertification: false, denyByDefault, denyByDefaultProvenEmpirically: true });
  }
  return Object.freeze({ kind: "NONE" });
}

/** runGovernanceQualityAssistant(id, input) -> governed role-scoped projection + real domain findings. */
function runGovernanceQualityAssistant(id: string, input: any): any {
  const spec = (GQ_ASSISTANTS as any)[id];
  if (!spec) return Object.freeze({ ok: false, code: "UNKNOWN_ASSISTANT", detail: "id ∈ " + Object.keys(GQ_ASSISTANTS).join("/") });
  const i = isObj(input) ? input : {};
  const surface = SURFACE.buildSurface(isObj(i.surfaceCtx) ? i.surfaceCtx : {});
  if (surface.ok !== true) return Object.freeze({ ok: false, code: "SURFACE_FAILED" });
  const findings = domainFindings(id, i);
  const missingData = (surface.dataIntegrity.unknown || 0) + (surface.dataIntegrity.noData || 0);
  const maturity = Object.freeze({
    status: "PARTIAL", operational: false,
    built: Object.freeze(["real domain computation via " + spec.engine, "missing-data surfacing", "prepare/recommend-only (max authority " + spec.decisionLevelMax + ")"]),
    partial: Object.freeze(["recommendations are governed proposals, not executed", "fed synthetic/estimate data, not real company data"]),
    absent: Object.freeze(["real operational data feed", "reserved safety/compliance acts; OCR recognition (BLOCKED); external/autonomous action"]),
  });
  return Object.freeze({
    ok: true, assistant: spec.id, domain: spec.domain, mandate: spec.mandate, engine: spec.engine, decisionLevelMax: spec.decisionLevelMax,
    domainFindings: findings, executesNothing: true, missingDataCount: missingData, decidable: surface.dataIntegrity.decidable,
    authorizedActions: spec.authorizedActions, forbiddenActions: spec.forbiddenActions, maturity,
    note: "governance/quality assistant = real domain computation (" + spec.engine + ") + governed surface context. PREPARE/RECOMMEND only; no AI declares a site safe (residual risk ⇒ human acceptance); scanned docs need OCR (BLOCKED); a scorecard is a posture snapshot not a certification; UNKNOWN ≠ 0; PARTIAL not OPERATIONAL. Reuse — no new engine.",
  });
}

/** runLot5(input) -> the three Lot-5 assistants over one input. */
function runLot5(input: any): any {
  const ids = ["SECURITE_QUALITE", "DOCUMENTS", "GOUVERNANCE"];
  const assistants = ids.map((id) => runGovernanceQualityAssistant(id, input));
  return Object.freeze({ ok: assistants.every((a: any) => a.ok), lot: "P2_LOT_5", assistantCount: assistants.length, assistants: Object.freeze(assistants),
    allPrepareOnly: assistants.every((a: any) => a.ok && a.executesNothing), anyOperational: assistants.some((a: any) => a.ok && a.maturity.operational),
    note: "P2 Lot 5 — Sécurité/Qualité / Documents / Gouvernance as functional assistants; all PREPARE/RECOMMEND only, none OPERATIONAL. 15 of 20 domains covered across Lots 1-5." });
}

const GOVERNANCE_QUALITY_ASSISTANTS_CONTRACT = Object.freeze({
  id: "V280-ODG-GOVERNANCE-QUALITY-ASSISTANTS-LOT5",
  source: "V280 §4 (P2 Lot 5) — Sécurité/Qualité (D10) / Documents (D15) / Gouvernance (D19) functional assistants",
  assistants: Object.freeze(Object.keys(GQ_ASSISTANTS)),
  reuses: Object.freeze(["odg-executive-surface (V275)", "safety-fmea (buildRiskRegister)", "document-intelligence (reconcileDossier)", "odg-owasp-agentic-matrix (scorecard)", "odg-api-security-posture"]),
  invariants: Object.freeze([
    "real domain computation via existing engines (reuse, no new engine); PREPARE/RECOMMEND only, executionResult null",
    "Sécurité level D: NO AI declares a site physically safe; a residual CRITICAL/HIGH risk requires explicit human acceptance, never silently cleared",
    "Documents: TEXT only; scanned/image documents need OCR (BLOCKED — recognition absent); a missing core document ⇒ MISSING_DATA (fail-closed); nothing assumed",
    "Gouvernance: a threat-coverage scorecard is a POSTURE snapshot, NOT a security certification; gaps tracked not hidden; no validator weakened",
    "UNKNOWN ≠ 0; maturity PARTIAL — NO assistant OPERATIONAL; deterministic/read-only; 15 of 20 domains across Lots 1-5",
  ]),
});

module.exports = { GQ_ASSISTANTS, runGovernanceQualityAssistant, runLot5, GOVERNANCE_QUALITY_ASSISTANTS_CONTRACT };

export {};
