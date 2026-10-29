#!/usr/bin/env node
/**
 * ai-assurance-report — PRODUCT D7 SLICE 2: the next AI-assurance vertical. It EXECUTES supported technical checks and
 * gates on evidence FRESHNESS/integrity, then emits a reproducible, exportable, integrity-stamped assessment report.
 * Composes existing services via verified interfaces — ai-assurance-assessment (slice 1: control mapping + fail-closed
 * status), assurance-pilot-runner (real technical findings with an exit code), control-evidence-freshness (TTL gate),
 * and evidence-provenance (report integrity digest). NO new primitive.
 *
 * Fail-closed additions over slice 1 (mandate §2):
 *  - a real technical check runs (assurance-pilot-runner) ⇒ a HIGH finding ⇒ exitCode 1 ⇒ technical FAIL (never PASS).
 *  - STALE / NO_EVIDENCE / INVALID evidence CANNOT support PASS — it downgrades the overall to NOT_ASSURED.
 *  - the report records WHICH checks ran, their exit codes, and the evidence per result.
 *  - always NOT_CERTIFIED unless a real applicable certification was actually obtained (never asserted here).
 */
"use strict";

const ASSESS = require("./ai-assurance-assessment.js");
const PILOT = require("./assurance-pilot-runner.js");
const FRESH = require("./control-evidence-freshness.js");
const prov = require("./evidence-provenance.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isHigh(f: any): boolean { const s = String((f && f.severity) || "").toUpperCase(); return s === "HIGH" || s === "ERROR" || s === "CRITICAL"; }

/**
 * buildAssuranceReport(input, opts?): input extends ai-assurance-assessment input with:
 *   technical?: { dependencies:[{name,license,version,outdated}], tests?:{total,passing}, aiActivities? }
 *   evidenceControls?: [{ ref, operationalEvidenceAt }]   ttlDays?   now (ISO, required for freshness)
 * Returns { ok, report, exportJson } — a reproducible, fail-closed, integrity-stamped assurance report.
 */
function buildAssuranceReport(input: any, opts: any = {}): any {
  if (!isObj(input) || !isObj(input.system)) return { ok: false, code: "INVALID_INPUT", reason: "input { system:{…} } required" };
  const base = ASSESS.assessAISystem(input, opts);
  if (!base.ok) return base;
  const a = base.assessment;
  const now = typeof input.now === "string" ? input.now : "";
  const executedChecks = [...a.executedChecks];
  const checkResults: any[] = [];

  // (A) technical checks — assurance-pilot-runner (real dependency/license/coverage/AI-Act findings + an exit code).
  let technical: any = { status: "NOT_APPLICABLE", reason: "no technical inputs (dependencies) supplied" };
  if (isObj(input.technical) && Array.isArray(input.technical.dependencies)) {
    const p = PILOT.runPilot({ project: input.system.id, dependencies: input.technical.dependencies, tests: input.technical.tests, aiActivities: input.technical.aiActivities || input.system.activities });
    if (p && p.ok) {
      const highs = (p.findings || []).filter(isHigh).length;
      const exitCode = highs > 0 ? 1 : 0;   // HIGH finding ⇒ non-zero ⇒ FAIL (a passing-looking run cannot mask a HIGH)
      technical = { status: exitCode === 0 ? "PASS" : "FAIL", exitCode, findingCount: (p.findings || []).length, highCount: highs, findings: p.findings || [] };
      executedChecks.push(`assurance-pilot(exit=${exitCode})`);
      checkResults.push({ check: "assurance-pilot-runner", exitCode, findingCount: (p.findings || []).length, highCount: highs });
    } else {
      technical = { status: "INSUFFICIENT_EVIDENCE", reason: (p && p.detail) || "pilot could not run" };
      checkResults.push({ check: "assurance-pilot-runner", exitCode: null, error: technical.reason });
    }
  }

  // (B) evidence freshness/integrity — STALE/NO_EVIDENCE/INVALID cannot support PASS.
  let evidenceFreshness: any = { status: "NOT_APPLICABLE", reason: "no evidenceControls supplied" };
  let staleOrMissing = 0;
  if (Array.isArray(input.evidenceControls) && input.evidenceControls.length) {
    const fr = FRESH.assessFreshness(input.evidenceControls, { now, ttlDays: input.ttlDays });
    if (fr.ok) {
      staleOrMissing = fr.summary.stale + fr.summary.noEvidence + fr.summary.invalid;
      evidenceFreshness = { status: staleOrMissing > 0 ? "FAIL" : "PASS", summary: fr.summary, notFresh: fr.rows.filter((r: any) => r.status !== "FRESH").map((r: any) => ({ ref: r.ref, status: r.status, ageDays: r.ageDays })) };
      executedChecks.push("evidence-freshness");
      checkResults.push({ check: "control-evidence-freshness", exitCode: staleOrMissing > 0 ? 1 : 0, stale: fr.summary.stale, noEvidence: fr.summary.noEvidence });
    } else {
      evidenceFreshness = { status: "INSUFFICIENT_EVIDENCE", reason: fr.detail || "freshness could not run" };
    }
  }

  // (C) consolidate — fail-closed: report-level ASSURED requires the base ASSURED, technical not FAIL/INSUFFICIENT,
  // and NO stale/missing evidence. Stale evidence or a HIGH technical finding ⇒ NOT_ASSURED.
  const technicalOk = technical.status === "PASS" || technical.status === "NOT_APPLICABLE";
  const freshnessOk = evidenceFreshness.status === "PASS" || evidenceFreshness.status === "NOT_APPLICABLE";
  const overall = (a.overall === "ASSURED_TECHNICAL" && technicalOk && freshnessOk && staleOrMissing === 0) ? "ASSURED_TECHNICAL" : "NOT_ASSURED";

  const report: any = {
    model: "ai-assurance-report/1",
    generatedAt: now || null,
    system: a.inventory,
    overall,
    controlTally: a.tally,
    aiAct: a.aiAct,
    frameworkTally: a.frameworkTally,
    supplyChain: a.supplyChain,
    technical,
    evidenceFreshness,
    executedChecks,
    checkResults,
    certificationStatus: a.certificationStatus,   // always NOT_CERTIFIED unless a real certification was obtained
    remediation: [
      ...(technical.findings || []).filter(isHigh).map((f: any) => ({ source: "technical", action: f.remediation || f.detail })),
      ...(evidenceFreshness.notFresh || []).map((r: any) => ({ source: "evidence-freshness", action: `re-attest control ${r.ref} (${r.status})` })),
    ],
    limitations: [
      ...a.limitations,
      "a real technical check (assurance-pilot) is run when dependencies are supplied; a HIGH finding ⇒ exitCode 1 ⇒ technical FAIL",
      "STALE / NO_EVIDENCE / INVALID evidence CANNOT support PASS (freshness gate); fresh ≠ satisfied",
      "report is NOT a certification and NOT formal conformity assessment",
    ],
    note: "Reproducible, integrity-stamped AI-assurance report: executed checks + exit codes + evidence freshness, fail-closed. ASSURED_TECHNICAL requires base-assured + no technical HIGH + no stale/missing evidence. NOT a certification.",
  };
  // integrity digest over the report content (detects accidental mutation of the stored report; not a signature).
  report.integrityDigest = prov.contentDigest(report);
  return { ok: true, report, exportJson: JSON.stringify(report) };
}

export { buildAssuranceReport };
module.exports = { buildAssuranceReport };

if (require.main === module) {
  const r = buildAssuranceReport({
    system: { id: "sys-1", name: "Triage AI", activities: {}, profile: { tenantId: "t1", country: "FR", processesEUPersonalData: true, targetFrameworks: ["GDPR"] } },
    technical: { dependencies: [{ name: "left-pad", license: "MIT" }], tests: { total: 10, passing: 10 } },
    evidenceControls: [{ ref: "ROPA", operationalEvidenceAt: "2026-10-01" }],
    now: "2026-10-29",
  });
  const a = r.report;
  process.stdout.write(JSON.stringify({ overall: a && a.overall, technical: a && a.technical.status, freshness: a && a.evidenceFreshness.status, executed: a && a.executedChecks }, null, 2) + "\n");
}
