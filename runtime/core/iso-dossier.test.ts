#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the axis-F ISO dossier composes traceability into an end-to-end dossier:
// standard selection with rationale, per-requirement structure, remediation enriched with owner+dependency+milestone,
// audit-prep records, external-dependency register (human-gated), NOT_CERTIFIED, stale≠satisfied — all honest.
"use strict";
const assert = require("assert");
const DOS = require("./iso-dossier.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };
const NOW = "2026-10-27T00:00:00Z";

const base = {
  standard: "ISO27001",
  gatedSuites: ["audit-log", "evidence-provenance", "mechanical-acceptance", "governance-kernel"],
  evidence: { "7": { state: "APPROVED", responsible: "CTO", artifact: "documented-info-policy.md" }, "8": { state: "DRAFTED" } },
  evidenceDates: { "7": "2026-09-01T00:00:00Z" },   // fresh
  now: NOW,
  owners: { "8": "ISMS lead" },
  remediationPlan: { "8": { dependency: "policy approval", targetMilestone: "2026-12-01" } },
};

// (1) selection + rationale + NOT_CERTIFIED.
const d = DOS.buildDossier(base);
ok("dossier ok + ISO27001 selected with rationale + NOT_CERTIFIED", d.ok && /27001/.test(d.standard) && d.selection.priority === "PRIMARY" && d.selection.rationale.length > 0 && d.certificationStatus === "NOT_CERTIFIED");

// (2) per-requirement dossier structure (applicability/state/evidence/provenance/gap/verification criteria).
const req7 = d.requirements.find(r => r.ref === "7");
ok("per-requirement structure complete", req7 && req7.applicability === "APPLICABLE" && req7.implementationState === "INTERNALLY_VERIFIED" && req7.evidenceAvailable === true && req7.provenance.responsible === "CTO" && req7.internalVerificationCriteria);

// (3) remediation enriched with owner + dependency + target milestone.
const rem8 = d.remediation.find(m => m.ref === "8");
ok("remediation enriched (owner/dependency/milestone)", rem8 && rem8.owner === "ISMS lead" && rem8.dependency === "policy approval" && rem8.targetMilestone === "2026-12-01" && /approve/i.test(rem8.missing));
ok("unassigned remediation defaults to human/CTO", d.remediation.filter(m => m.ref !== "8").every(m => m.owner === "UNASSIGNED (human/CTO)"));

// (4) audit-prep records + management-review material present.
ok("audit-prep records + management-review material", d.auditPrep.requiredOperationalRecords.length >= 5 && d.auditPrep.managementReviewMaterial.length > 0 && /human/i.test(d.auditPrep.note));

// (5) external-dependency register — accredited body (AFNOR/COFRAC), licensed text, fees NO_DATA, human-gated.
ok("external deps: AFNOR/COFRAC + licensed text + fees NO_DATA + authorization required", /AFNOR/.test(d.externalDependencies.accreditedBody) && /COFRAC/.test(d.externalDependencies.accreditedBody) && /paywalled/i.test(d.externalDependencies.licensedText) && /NO_DATA/.test(d.externalDependencies.estimatedFees) && d.externalDependencies.authorizationRequired === true);

// (6) STALE evidence cannot satisfy (inherited): make ref 7 stale ⇒ not INTERNALLY_VERIFIED.
const stale = DOS.buildDossier({ ...base, evidenceDates: { "7": "2024-01-01T00:00:00Z" } });
ok("stale evidence ⇒ ref 7 not INTERNALLY_VERIFIED (STALE), is a gap", stale.requirements.find(r => r.ref === "7").implementationState === "STALE" && stale.requirements.find(r => r.ref === "7").gap === true);

// (7) summary counts coherent (internallyVerified + remediationWithOwner).
ok("summary counts", typeof d.summary.total === "number" && d.summary.internallyVerified >= 1 && d.summary.remediationWithOwner >= 1 && d.summary.gaps >= 1);

// (8) 42001 is selectable + flagged secondary/deferred (not claimed universal).
const ai = DOS.buildDossier({ ...base, standard: "ISO42001" });
ok("42001 selectable, SECONDARY_DEFERRED", ai.ok && ai.selection.priority === "SECONDARY_DEFERRED" && /42001/.test(ai.standard));

// (9) honesty notes + fail-closed.
ok("notes: readiness≠certification + external human-gated", d.notes.some(n => /Readiness . certification|NOT_CERTIFIED/i.test(n)) && d.notes.some(n => /HUMAN-GATED|human-gated/i.test(n)));
ok("fail-closed: unknown standard / missing now", DOS.buildDossier({ standard: "ISO9999", now: NOW }).code === "UNKNOWN_STANDARD" && DOS.buildDossier({ standard: "ISO27001" }).code === "INVALID_INPUT");

// (10) deterministic.
ok("reproducible", JSON.stringify(DOS.buildDossier(base)) === JSON.stringify(d));

console.log(`\nISO-DOSSIER suite — ${pass} assertions passed. (end-to-end 27001 dossier: selection + requirements + owned remediation + audit-prep + external deps; NOT_CERTIFIED; stale≠satisfied)`);
