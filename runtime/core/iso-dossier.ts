#!/usr/bin/env node
/**
 * iso-dossier — axis F (CTO V28): the end-to-end readiness DOSSIER for ONE prioritized standard. It COMPOSES
 * certification-traceability (requirement→evidence→verificationState→gap, with freshness) and adds the dossier
 * layer certification-traceability does NOT provide: per-requirement remediation OWNER + dependency + target
 * milestone + internal-verification criteria, an EXTERNAL-dependency register (accredited body, licensed text,
 * qualified reviewer, fees, authorization), audit-preparation records, and the standard-SELECTION rationale.
 *
 * STANDARD SELECTION (recorded, not assumed-universal): ISO/IEC 27001:2022 is prioritized because ODG's target
 * market (teams facing enterprise security reviews) asks for it, and it has the richest existing evidence in-repo
 * (clause-matrix + operational-evidence + freshness + traceability). ISO/IEC 42001 (AI management) is a relevant
 * SECONDARY standard, deferred until the 27001 base is further along. Other ISO standards are NOT claimed necessary.
 *
 * HONESTY (mandate): readiness ≠ certification — certificationStatus stays NOT_CERTIFIED unless valid EXTERNAL
 * accredited evidence exists; a policy draft is not implementation proof; STALE evidence cannot satisfy a control
 * (inherited from traceability). External audit / licensed text / fees are HUMAN-GATED (€0 default; never purchased
 * here). Pure/deterministic; reuses the existing matrices + readiness vocabulary (no duplication).
 */
"use strict";

const TRACE = require("./certification-traceability.js");

// Verified external fact (PR#67): for ISO/IEC 27001 in France, AFNOR Certification operates under COFRAC
// accreditation n°4-0001. This is the accredited-body dependency; ODG cannot self-certify.
const STANDARDS: Readonly<Record<string, any>> = Object.freeze({
  ISO27001: {
    id: "ISO/IEC 27001:2022 (+Amd 1:2024)",
    priority: "PRIMARY",
    rationale: "target market (enterprise security reviews) requires it; richest existing in-repo evidence (clause-matrix + operational-evidence + freshness + traceability)",
    accreditedBody: "AFNOR Certification (France) under COFRAC accreditation n°4-0001",
    licensedText: "ISO/IEC 27001:2022 standard text is paywalled (purchase from ISO/AFNOR) — not reproduced",
  },
  ISO42001: {
    id: "ISO/IEC 42001:2023",
    priority: "SECONDARY_DEFERRED",
    rationale: "AI management system — relevant to ODG's AI-assurance activities; deferred until the 27001 base is further along",
    accreditedBody: "accredited body TBD (scheme nascent)",
    licensedText: "ISO/IEC 42001:2023 text paywalled — not reproduced",
  },
});

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/**
 * buildDossier({ standard, gatedSuites, evidence, evidenceDates, now, ttlDays, owners, remediationPlan }):
 * owners = { "<ref>": ownerRole }; remediationPlan = { "<ref>": { dependency, targetMilestone } }.
 */
function buildDossier(opts: any = {}): any {
  const key = nonEmptyString(opts.standard) ? opts.standard : "ISO27001";
  const std = STANDARDS[key];
  if (!std) return { ok: false, code: "UNKNOWN_STANDARD", detail: `select one of: ${Object.keys(STANDARDS).join(", ")}` };
  if (!nonEmptyString(opts.now)) return { ok: false, code: "INVALID_INPUT", detail: "now (ISO date) required" };

  const trace = TRACE.buildTraceability({ gatedSuites: opts.gatedSuites, evidence: opts.evidence, evidenceDates: opts.evidenceDates, now: opts.now, ttlDays: opts.ttlDays });
  if (!trace.ok) return { ok: false, code: trace.code };

  const owners = isObj(opts.owners) ? opts.owners : {};
  const plan = isObj(opts.remediationPlan) ? opts.remediationPlan : {};

  // Per-requirement dossier rows (full structure).
  const requirements = trace.rows.map((r: any) => ({
    ref: r.ref, title: r.title,
    applicability: r.verificationState === "BLOCKED" ? "EXTERNAL/OUT_OF_SCOPE" : "APPLICABLE",
    implementationState: r.verificationState,          // NOT_STARTED..INTERNALLY_VERIFIED/STALE (shared vocab)
    evidenceRequired: true,
    evidenceAvailable: r.traceable,                    // responsible + artifact present
    provenance: { responsible: r.responsible, artifact: r.artifact, evidenceDate: r.evidenceDate, freshness: r.freshness },
    gap: r.gap,
    internalVerificationCriteria: "SATISFIED only with APPROVED/EXECUTED operational evidence (responsible + artifact) AND fresh (within TTL); a draft or stale record does NOT satisfy",
  }));

  // Remediation register enriched with owner + dependency + target milestone (dossier layer).
  const remediation = trace.remediation.map((m: any) => ({
    ref: m.ref, title: m.title, state: m.state, missing: m.missing,
    owner: nonEmptyString(owners[m.ref]) ? owners[m.ref] : "UNASSIGNED (human/CTO)",
    dependency: (plan[m.ref] && plan[m.ref].dependency) || null,
    targetMilestone: (plan[m.ref] && plan[m.ref].targetMilestone) || "NOT_SET",
  }));

  // Audit preparation — operational records + management-review material (clauses 9/10 require EXECUTED evidence).
  const auditPrep = {
    requiredOperationalRecords: ["risk assessment + treatment plan", "Statement of Applicability", "internal audit records (clause 9)", "management review minutes (clause 9.3)", "corrective-action / nonconformity register (clause 10)", "approved policies with version + approver"],
    managementReviewMaterial: ["ISMS performance vs objectives", "audit results + nonconformities", "risk status", "improvement actions"],
    note: "these are HUMAN/operational acts — ODG prepares templates/registers; approval + execution are human (CTO) acts, not auto-generated.",
  };

  // External dependencies — all HUMAN-GATED, €0 default (never purchased/committed here).
  const externalDependencies = {
    accreditedBody: std.accreditedBody,
    licensedText: std.licensedText,
    qualifiedReviewer: "an ISMS lead implementer / auditor (human) — not provided",
    estimatedFees: "NO_DATA — audit + standard-text + reviewer fees are human-gated; none incurred (€0 default)",
    authorizationRequired: true,
  };

  return {
    ok: true,
    standard: std.id,
    selection: { key, priority: std.priority, rationale: std.rationale },
    certificationStatus: "NOT_CERTIFIED",
    now: opts.now,
    summary: {
      total: trace.summary.total,
      internallyVerified: trace.summary.internallyVerified,
      stale: trace.summary.stale,
      gaps: trace.summary.gaps,
      blockedExternal: trace.summary.blockedExternal,
      remediationWithOwner: remediation.filter((m: any) => m.owner !== "UNASSIGNED (human/CTO)").length,
    },
    requirements,
    remediation,
    auditPrep,
    externalDependencies,
    notes: [
      "Readiness ≠ certification: NOT_CERTIFIED unless valid EXTERNAL accredited evidence exists. ODG prepares; AFNOR/COFRAC certifies.",
      "A policy draft is not implementation proof; STALE evidence does not satisfy a control (inherited from certification-traceability).",
      "Standard SELECTED on product/market fit + existing evidence; not every ISO standard is claimed necessary (42001 is secondary/deferred).",
      "External audit, licensed standard text, and reviewer fees are HUMAN-GATED; €0 default; nothing purchased or committed here.",
    ],
  };
}

export { STANDARDS, buildDossier };
module.exports = { STANDARDS, buildDossier };

// Read-only CLI: print the standard selection + honesty rules; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "iso-dossier/1", standards: Object.keys(STANDARDS), primary: "ISO27001", rule: "readiness≠certification; external deps human-gated €0" }, null, 2) + "\n");
}
