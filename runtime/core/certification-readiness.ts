#!/usr/bin/env node
/**
 * certification-readiness — aggregates the ISO operational-evidence assessment + an administrative dossier checklist
 * into an HONEST go/no-go for an accredited ISO/IEC 27001 certification APPLICATION. FAIL-CLOSED: the verdict is
 * NOT_READY unless (a) every non-EXTERNAL control is SATISFIED (operational evidence, not just a mechanism) AND (b)
 * every mandatory dossier item is really present. It does NOT fabricate evidence or dossier items — absent items are
 * blockers. Readiness ≠ certification: an accredited body still audits (Stage 1/2). EXTERNAL controls (prod KMS,
 * monitoring, off-host backup, multi-tenant) must also be resolved to bring them into a real certification scope.
 * Pure, deterministic. Reuses iso-operational-evidence (no new assessment path).
 */
"use strict";

const OE = require("./iso-operational-evidence.js");

// Administrative/management-system artefacts a CB typically requires for a 27001 application (none fabricated).
const MANDATORY_DOSSIER = [
  "isms_scope",                 // documented ISMS scope
  "security_policy_approved",   // approved information-security policy
  "risk_assessment",            // risk assessment performed
  "risk_treatment_plan",        // risk treatment plan
  "statement_of_applicability", // SoA (requires the standard text for completeness)
  "internal_audit_performed",   // internal audit executed with records
  "management_review_performed",// management review executed with records
  "incident_procedure",         // incident-response procedure
  "backup_continuity",          // backup + continuity (off-host = external)
  "corrective_actions",         // corrective-action records
];

export interface CertificationReadiness {
  verdict: "READY_FOR_STAGE1" | "NOT_READY"; now: string;
  controls: { satisfied: number; nonExternalTotal: number; external: number; missing: string[] };
  dossier: { present: number; total: number; missing: string[] };
  blockers: string[]; notes: string[]; markdown: string;
}

/** assessCertificationReadiness({ gatedSuites, evidence, dossier, now }): dossier = { <item>: true }. Fail-closed. */
function assessCertificationReadiness(opts: any): CertificationReadiness {
  const o = opts || {};
  const op = OE.assessOperational({ gatedSuites: o.gatedSuites, evidence: o.evidence, now: o.now });
  const now = String(o.now || "");
  const nonExternal = op.rows.filter((r: any) => r.status !== "EXTERNAL" && r.status !== "PARTIAL_EXTERNAL");
  const satisfied = nonExternal.filter((r: any) => r.status === "SATISFIED");
  const missingControls = nonExternal.filter((r: any) => r.status !== "SATISFIED").map((r: any) => `${r.ref}: ${r.status}`);
  const external = op.rows.filter((r: any) => r.status === "EXTERNAL" || r.status === "PARTIAL_EXTERNAL").length;

  const dossier = o.dossier && typeof o.dossier === "object" ? o.dossier : {};
  const missingDossier = MANDATORY_DOSSIER.filter((k) => dossier[k] !== true);

  const controlsReady = missingControls.length === 0 && nonExternal.length > 0;
  const dossierReady = missingDossier.length === 0;
  const verdict: CertificationReadiness["verdict"] = controlsReady && dossierReady ? "READY_FOR_STAGE1" : "NOT_READY";

  const blockers: string[] = [];
  if (!controlsReady) blockers.push(`${missingControls.length} non-external control(s) not SATISFIED`);
  if (!dossierReady) blockers.push(`${missingDossier.length} mandatory dossier item(s) missing: ${missingDossier.join(", ")}`);
  if (external > 0) blockers.push(`${external} EXTERNAL control(s) (prod KMS/monitoring/off-host backup/multi-tenant) must be resolved for a real certification scope`);

  const notes = [
    "NOT a certification and NOT a guarantee of passing: an accredited body (verified COFRAC/EA/IAF scope) audits Stage 1 + Stage 2.",
    "READY_FOR_STAGE1 requires every non-external control SATISFIED (operational evidence, not just a code mechanism) AND every mandatory dossier item present — fail-closed.",
    "SoA completeness requires the licensed/consulted 27001 text; dossier items are human/CTO artefacts, never fabricated here.",
  ];
  const L: string[] = [];
  L.push("# ODG — ISO/IEC 27001 certification readiness (self-assessment)");
  L.push("");
  L.push(`> **Verdict: ${verdict}. NOT_CERTIFIED — accredited audit required.**`);
  L.push("");
  L.push(`Controls: ${satisfied.length}/${nonExternal.length} non-external SATISFIED · ${external} EXTERNAL. Dossier: ${MANDATORY_DOSSIER.length - missingDossier.length}/${MANDATORY_DOSSIER.length} present.`);
  L.push("");
  if (blockers.length) { L.push("Blockers:"); for (const b of blockers) L.push(`- ${b}`); L.push(""); }
  for (const n of notes) L.push(`> ${n}`);
  return { verdict, now, controls: { satisfied: satisfied.length, nonExternalTotal: nonExternal.length, external, missing: missingControls }, dossier: { present: MANDATORY_DOSSIER.length - missingDossier.length, total: MANDATORY_DOSSIER.length, missing: missingDossier }, blockers, notes, markdown: L.join("\n") };
}

export { assessCertificationReadiness, MANDATORY_DOSSIER };
module.exports = { assessCertificationReadiness, MANDATORY_DOSSIER };
