#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V50 (C2 — P10 E4) — AI Governance / AI-Act readiness DEMONSTRATOR. Composes ODG's EXISTING
 * ai-assurance-assessment (assessAISystem — AI-Act role classification + control assessment, fail-closed, NOT a
 * certification) over a SYNTHETIC AI system (no client data) and emits a reproducible client deliverable via the shared O1
 * report layer (+O2 evidence). HONEST SCOPE: an AI-Act/ISO readiness assessment — INSUFFICIENT_EVIDENCE controls are
 * reported as such (never PASS by listing); NOT a certification. Reuses, does not duplicate. Run: `odg-e4-p10-aigov.ts [outPath]`.
 */

const ASSURE = require("../core/ai-assurance-assessment.js");
const O1 = require("../core/shared-report-generator.js");
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2] || path.join(__dirname, "..", "..", "docs", "odg", "demonstrators", "P10_AIGOV_READINESS.json");

// SYNTHETIC AI system (public example; no client data): a CV-screening assistant (high-risk-adjacent activity flags).
const input = { system: { id: "demo-cv-screener", name: "CV screening assistant", intendedUse: "rank job applicants",
  profile: { tenantId: "demo-tenant", targetFrameworks: ["EU-AI-ACT", "ISO-42001"], aiSystems: ["demo-cv-screener"] },
  activities: { employmentScreening: true, biometricCategorisation: false, generatesSyntheticContent: false } }, now: "2026-11-10" };
const r = ASSURE.assessAISystem(input);
const a = r.ok ? r.assessment : null;
const controls = (a && Array.isArray(a.controls)) ? a.controls : [];
const insufficient = controls.filter((c: any) => c.status === "INSUFFICIENT_EVIDENCE").length;

const rep = O1.generateReport({
  metier: "P10", title: "AI Governance / AI-Act Readiness", status: r.ok ? "READINESS — assessed, NOT_CERTIFIED" : `BLOCKED (${r.code})`,
  summary: r.ok ? `AI-Act assessment of '${input.system.name}': role classified from DECLARED activities (deny-by-default); ${controls.length} controls assessed (${insufficient} INSUFFICIENT_EVIDENCE — applicable obligations with no automated test, requiring manual assessment). This is readiness, NOT certification.` : `assessment could not run: ${r.reason}`,
  controls: controls.slice(0, 12).map((c: any) => ({ name: c.id, status: c.status, detail: c.detail })),
  findings: controls.filter((c: any) => c.status === "INSUFFICIENT_EVIDENCE").slice(0, 8).map((c: any) => ({ severity: "MEDIUM", detail: c.detail, basis: "OBSERVED" })),
  recommendations: ["complete the manual assessment for each INSUFFICIENT_EVIDENCE obligation family", "prepare the Annex IV technical documentation (reuse ai-act-annex-iv-completeness)", "do NOT claim certification — this is readiness"],
  limits: ["AI-Act role is from DECLARED activities (declared-not-verified)", "INSUFFICIENT_EVIDENCE ≠ non-compliant and ≠ PASS — manual assessment required", "readiness assessment, NOT an ISO/AI-Act certification", "ODG maturity L2, 0 paying clients"],
  evidence: [{ claim: `AI-Act role classification + ${controls.length} controls assessed`, basis: "OBSERVED", sourceRef: path.basename(OUT) }, { claim: "deny-by-default on undeclared activities", basis: "PROVEN", sourceRef: path.basename(OUT) }],
  validationConditions: ["re-run reproduces the classification from the same declared activities", "evidence digest independently verifiable", "manual-assessment controls completed before any compliance claim"],
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ "//": "CTO V50 P10 E4 AI-Act readiness. SYNTHETIC AI system. INSUFFICIENT_EVIDENCE never PASS. NOT a certification. Reuses ai-assurance-assessment + O1/O2.", assessmentOk: r.ok, controls: controls.length, insufficient, report: rep.json }, null, 2) + "\n");
fs.writeFileSync(OUT.replace(/\.json$/, ".md"), rep.markdown);
process.stdout.write(`=== P10 AI-Gov E4 written: ${OUT} (+ ${OUT.replace(/\.json$/, ".md")}) ===\n`);
process.stdout.write(JSON.stringify({ assessmentOk: r.ok, controls: controls.length, insufficientEvidence: insufficient, reportOk: rep.ok, evidenceVerifiable: rep.evidence.integrity.digest != null }, null, 2) + "\n");

export {};
