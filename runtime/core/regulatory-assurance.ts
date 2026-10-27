#!/usr/bin/env node
/**
 * regulatory-assurance — REGULATORY_ASSURANCE capability (CTO "WORLD-CLASS REGULATORY ASSURANCE").
 *
 * A single, generic, reusable capability that takes a configurable COMPANY PROFILE and produces a sector/size/
 * country/data/AI/risk/scope-specific assurance dossier, via independent modules:
 *   GDPR_READINESS · ISO27001_READINESS · ISO42001_READINESS
 *
 * Design constraints (honest, fail-closed, no marketing):
 *  - NOT a new primitive and NOT an orchestrator. A pure, deterministic capability (no network, no clock — dates are
 *    DATA; "now" is injected) that the normal ODG execution mechanism calls and the capability registry lists.
 *  - HALLUCINATION CONTROL: every obligation MUST cite a sourceId present in the supplied reference registry; an
 *    obligation with no valid source is REFUSED (dropped + recorded), never emitted as fact. No normative text is
 *    reproduced — only authorized PRINCIPLES. Non-applicable obligations are KEPT with a justification.
 *  - EVIDENCE HONESTY: client-DECLARED evidence is never treated as verified. Only evidence an injected INDEPENDENT
 *    verifier confirms is SATISFIED_VERIFIED. Missing ⇒ GAP. Nothing is invented.
 *  - MULTI-TENANT SEPARATION: the dossier is tenant-scoped; evidence from another tenant is rejected (fail-closed).
 *  - NO CERTIFICATION CLAIM: ODG prepares; an accredited/independent body certifies. certificationStatus is always
 *    NOT_CERTIFIED and a claim of "certified" is refused.
 *  - EXCELLENCE: consults excellence-policy automatically (reference search + gap analysis + measured evaluation) so
 *    the standing excellence rule is applied without a per-mission reminder.
 */
"use strict";

const prov = require("./evidence-provenance.js");
const EXC = require("./excellence-policy.js");

const EU_COUNTRIES = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]);

export interface CompanyProfile {
  tenantId: string;
  name?: string;
  sector?: string;
  size?: string;                        // "micro"|"sme"|"mid"|"large"
  country?: string;                     // ISO-2
  processesEUPersonalData?: boolean;
  dataCategories?: string[];            // e.g. ["personal","sensitive","health"]
  aiSystems?: Array<{ id: string; purpose?: string; risk?: string }>;
  highRiskProcessing?: boolean;
  scope?: string;
  targetFrameworks?: string[];          // subset of ["GDPR","ISO27001","ISO42001"]
  declaredEvidence?: Array<{ id: string; obligationId: string; tenantId: string; artifact?: string; owner?: string }>;
}

type ObStatus = "SATISFIED_VERIFIED" | "DECLARED_UNVERIFIED" | "GAP" | "NOT_APPLICABLE";

export interface Obligation {
  id: string; module: string; title: string; sourceId: string; risk: number; // 1..5
  applies: (p: CompanyProfile) => boolean;
  applicabilityNote: string;
}

export interface Finding {
  obligationId: string; module: string; title: string; sourceId: string; sourceValid: boolean;
  applicable: boolean; applicabilityNote: string; status: ObStatus; risk: number;
  control: string | null; evidenceId: string | null; evidenceClass: "none" | "client-declared" | "independently-verified";
  owner: string | null; verification: { verified: boolean; reason: string } | null; remediation: string | null;
  verification2?: { verified: boolean; reason: string } | null;             // optional SECOND independent verifier
  verifierAgreement?: "single" | "agree-satisfied" | "agree-unsatisfied" | "disagree";
}

export interface AssuranceDossier {
  tenantId: string; now: string; profileDigest: string;
  modulesRun: string[];
  certificationStatus: string;
  findings: Finding[];
  refusedObligations: Array<{ id: string; reason: string }>;
  summary: { applicable: number; satisfiedVerified: number; declaredUnverified: number; gaps: number; notApplicable: number };
  remediationPlan: Array<{ obligationId: string; priority: number; action: string }>;
  referenceChanges: Array<{ id: string; knownVersion: string; registryVersion: string }>;
  excellenceReview: any;
  notes: string[];
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Obligation catalogs — authorized PRINCIPLES only; each cites a reference sourceId. NO copyrighted normative text.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const gdprApplies = (p: CompanyProfile) => !!(p.processesEUPersonalData || (p.country && EU_COUNTRIES.has(p.country)) || (p.dataCategories || []).includes("personal"));

const CATALOG: Obligation[] = [
  // GDPR_READINESS — Regulation (EU) 2016/679 (legal obligation; public text)
  { id: "GDPR-ROPA", module: "GDPR_READINESS", title: "Records of processing activities", sourceId: "GDPR-2016-679", risk: 4, applies: gdprApplies, applicabilityNote: "applies when processing EU personal data" },
  { id: "GDPR-LAWFUL", module: "GDPR_READINESS", title: "Lawful basis for each processing", sourceId: "GDPR-2016-679", risk: 5, applies: gdprApplies, applicabilityNote: "applies when processing EU personal data" },
  { id: "GDPR-DPIA", module: "GDPR_READINESS", title: "DPIA for high-risk processing", sourceId: "GDPR-2016-679", risk: 5, applies: (p) => gdprApplies(p) && !!(p.highRiskProcessing || (p.dataCategories || []).some(d => ["sensitive", "health", "biometric"].includes(d))), applicabilityNote: "only when high-risk / special-category processing" },
  { id: "GDPR-BREACH", module: "GDPR_READINESS", title: "Personal-data breach notification process", sourceId: "GDPR-2016-679", risk: 4, applies: gdprApplies, applicabilityNote: "applies when processing EU personal data" },
  // ISO27001_READINESS — ISO/IEC 27001:2022 (voluntary standard; principles only)
  { id: "ISO27001-ISMS", module: "ISO27001_READINESS", title: "Risk-based ISMS established", sourceId: "ISO27001-2022", risk: 4, applies: (p) => (p.targetFrameworks || []).includes("ISO27001"), applicabilityNote: "when the company targets ISO/IEC 27001" },
  { id: "ISO27001-SOA", module: "ISO27001_READINESS", title: "Statement of Applicability", sourceId: "ISO27001-2022", risk: 3, applies: (p) => (p.targetFrameworks || []).includes("ISO27001"), applicabilityNote: "when the company targets ISO/IEC 27001" },
  { id: "ISO27001-IMPROVE", module: "ISO27001_READINESS", title: "Continual improvement + internal audit", sourceId: "ISO27001-2022", risk: 3, applies: (p) => (p.targetFrameworks || []).includes("ISO27001"), applicabilityNote: "when the company targets ISO/IEC 27001" },
  // ISO42001_READINESS — ISO/IEC 42001:2023 AI management system (voluntary standard; principles only)
  { id: "ISO42001-AIMS", module: "ISO42001_READINESS", title: "AI management system established", sourceId: "ISO42001-2023", risk: 4, applies: (p) => (p.targetFrameworks || []).includes("ISO42001") && (p.aiSystems || []).length > 0, applicabilityNote: "only when the company operates AI systems and targets ISO/IEC 42001" },
  { id: "ISO42001-RISK", module: "ISO42001_READINESS", title: "AI risk + impact assessment", sourceId: "ISO42001-2023", risk: 5, applies: (p) => (p.targetFrameworks || []).includes("ISO42001") && (p.aiSystems || []).length > 0, applicabilityNote: "only when the company operates AI systems and targets ISO/IEC 42001" },
];

const MODULE_FRAMEWORK: Record<string, string> = { GDPR_READINESS: "GDPR", ISO27001_READINESS: "ISO27001", ISO42001_READINESS: "ISO42001" };

/**
 * Assess one obligation against the tenant-filtered evidence index + injected INDEPENDENT verifier(s). With a SECOND
 * verifier (role separation / dual control), an obligation is SATISFIED_VERIFIED only when BOTH independently agree
 * "verified"; a DISAGREEMENT (one yes, one no) ⇒ DECLARED_UNVERIFIED (contradiction surfaced, never a false success).
 */
function assessObligation(ob: Obligation, profile: CompanyProfile, evidenceByObligation: Map<string, any>, verifier: any, sourceValid: boolean, verifier2?: any): Finding {
  const applicable = sourceValid && !!ob.applies(profile);
  const base: Finding = { obligationId: ob.id, module: ob.module, title: ob.title, sourceId: ob.sourceId, sourceValid, applicable, applicabilityNote: ob.applicabilityNote, status: "NOT_APPLICABLE", risk: ob.risk, control: null, evidenceId: null, evidenceClass: "none", owner: null, verification: null, remediation: null, verification2: null, verifierAgreement: "single" };
  if (!applicable) { base.remediation = sourceValid ? null : "obligation REFUSED upstream (no valid source) — not assessed"; return base; }
  const ev = evidenceByObligation.get(ob.id);
  if (!ev) { base.status = "GAP"; base.remediation = `produce a control + evidence for "${ob.title}"`; return base; }
  base.evidenceId = ev.id; base.owner = ev.owner || null; base.control = ev.artifact || null; base.evidenceClass = "client-declared";
  const run = (v: any) => typeof v === "function" ? (v(ob.id, ev) || { verified: false, reason: "no verifier result" }) : { verified: false, reason: "no independent verifier supplied — client-declared evidence is NOT verified" };
  const vr = run(verifier); base.verification = { verified: vr.verified === true, reason: String(vr.reason || "") };
  const hasV2 = typeof verifier2 === "function";
  if (!hasV2) {
    base.verifierAgreement = "single";
    if (vr.verified === true) { base.status = "SATISFIED_VERIFIED"; base.evidenceClass = "independently-verified"; }
    else { base.status = "DECLARED_UNVERIFIED"; base.remediation = `independently verify the declared evidence for "${ob.title}" (${base.verification.reason})`; }
    return base;
  }
  // DUAL CONTROL: a separate, independent second verifier must also confirm.
  const vr2 = run(verifier2); base.verification2 = { verified: vr2.verified === true, reason: String(vr2.reason || "") };
  const a = vr.verified === true, b = vr2.verified === true;
  if (a && b) { base.status = "SATISFIED_VERIFIED"; base.evidenceClass = "independently-verified"; base.verifierAgreement = "agree-satisfied"; }
  else if (!a && !b) { base.status = "DECLARED_UNVERIFIED"; base.verifierAgreement = "agree-unsatisfied"; base.remediation = `both independent verifiers reject the declared evidence for "${ob.title}"`; }
  else { base.status = "DECLARED_UNVERIFIED"; base.verifierAgreement = "disagree"; base.remediation = `independent verifiers DISAGREE on "${ob.title}" (v1=${a}, v2=${b}) — contradiction; resolve before claiming satisfied (no false success)`; }
  return base;
}

/** Detect reference version drift vs the versions the dossier was previously built against. */
function detectReferenceChanges(registry: any[], knownVersions: Record<string, string> | undefined): Array<{ id: string; knownVersion: string; registryVersion: string }> {
  const out: Array<{ id: string; knownVersion: string; registryVersion: string }> = [];
  if (!knownVersions) return out;
  const byId = new Map((Array.isArray(registry) ? registry : []).map((r: any) => [r.id, r]));
  for (const id of Object.keys(knownVersions)) { const r = byId.get(id); if (r && r.version !== knownVersions[id]) out.push({ id, knownVersion: knownVersions[id], registryVersion: r.version }); }
  return out;
}

/**
 * buildDossier — the capability entrypoint. Tenant-scoped, fail-closed, source-cited.
 *   opts = { registry, now, verifier, knownVersions?, excellenceThresholds?, excellenceMeasured? }
 */
function buildDossier(profile: CompanyProfile, opts: any): AssuranceDossier {
  const o = opts || {};
  const registry = o.registry || [];
  const now = o.now || "";
  const tenantId = profile && profile.tenantId;
  const notes: string[] = [];
  if (!tenantId) throw new TypeError("regulatory-assurance: profile.tenantId is required (multi-tenant separation)");

  const registryIds = new Set((Array.isArray(registry) ? registry : []).map((r: any) => r.id));
  const targeted = new Set(profile.targetFrameworks || []);

  // MULTI-TENANT SEPARATION: index ONLY this tenant's declared evidence; foreign-tenant evidence is rejected.
  const evidenceByObligation = new Map<string, any>();
  let rejectedForeign = 0;
  for (const ev of (profile.declaredEvidence || [])) {
    if (ev.tenantId !== tenantId) { rejectedForeign++; continue; }        // cross-tenant evidence NEVER used
    evidenceByObligation.set(ev.obligationId, ev);
  }
  if (rejectedForeign) notes.push(`${rejectedForeign} declared-evidence item(s) rejected: foreign tenantId (cross-tenant isolation)`);

  // HALLUCINATION CONTROL: an obligation whose sourceId is not in the registry is REFUSED (dropped + recorded).
  const refused: Array<{ id: string; reason: string }> = [];
  const findings: Finding[] = [];
  const modulesRun = new Set<string>();
  for (const ob of CATALOG) {
    if (!targeted.has(MODULE_FRAMEWORK[ob.module])) continue;             // only run targeted modules
    modulesRun.add(ob.module);
    const sourceValid = registryIds.has(ob.sourceId);
    if (!sourceValid) { refused.push({ id: ob.id, reason: `cites unknown source "${ob.sourceId}" absent from the reference registry — refused (no unjustified claim)` }); }
    findings.push(assessObligation(ob, profile, evidenceByObligation, o.verifier, sourceValid, o.verifier2));
  }

  const applicableFindings = findings.filter(f => f.applicable);
  const summary = {
    applicable: applicableFindings.length,
    satisfiedVerified: applicableFindings.filter(f => f.status === "SATISFIED_VERIFIED").length,
    declaredUnverified: applicableFindings.filter(f => f.status === "DECLARED_UNVERIFIED").length,
    gaps: applicableFindings.filter(f => f.status === "GAP").length,
    notApplicable: findings.filter(f => !f.applicable).length,
  };

  // Prioritized remediation: open items (GAP or DECLARED_UNVERIFIED) ranked by risk desc.
  const remediationPlan = applicableFindings
    .filter(f => f.status === "GAP" || f.status === "DECLARED_UNVERIFIED")
    .sort((a, b) => b.risk - a.risk)
    .map((f, i) => ({ obligationId: f.obligationId, priority: i + 1, action: f.remediation || `remediate ${f.title}` }));

  const referenceChanges = detectReferenceChanges(registry, o.knownVersions);
  if (referenceChanges.length) notes.push(`${referenceChanges.length} reference version change(s) detected — re-assess affected obligations`);

  // EXCELLENCE: consult the canonical policy automatically for this domain (reference search + gaps + measured eval).
  const excThresholds = o.excellenceThresholds || { coverage: 0.9, traceability: 1.0 };
  const coverage = summary.applicable ? (summary.satisfiedVerified + summary.declaredUnverified) / summary.applicable : 0;
  const traceability = findings.length ? findings.filter(f => !f.applicable || f.evidenceId !== null || f.status === "GAP").length / findings.length : 0;
  const excellenceReview = EXC.reviewForExcellence({
    domain: "regulatory-assurance", now, registry,
    currentPractices: ["obligation-mapping", "applicability-justification", "gap-analysis", "traceability-requirement-to-evidence", "evidence-independent-verification", "no-certification-claim"],
    thresholds: excThresholds, measured: { coverage: Math.round(coverage * 100) / 100, traceability: Math.round(traceability * 100) / 100 },
    claims: ["prepares regulatory evidence dossiers; does NOT issue certification"],
  });

  const profileDigest = prov.contentDigest({ tenantId, sector: profile.sector, size: profile.size, country: profile.country, frameworks: [...targeted].sort(), ai: (profile.aiSystems || []).length });

  return {
    tenantId, now, profileDigest,
    modulesRun: [...modulesRun].sort(),
    certificationStatus: "NOT_CERTIFIED — ODG prepares documents/controls/evidence; an accredited/independent body is required to certify",
    findings, refusedObligations: refused, summary, remediationPlan, referenceChanges, excellenceReview, notes,
  };
}

/** Refuse any attempt to declare a certification obtained without an external decision. */
function assertNotCertified(statement: string): { ok: boolean; reason: string } {
  const claimsCert = /\b(certified|certification\s+(obtained|achieved|granted)|iso\s*27001\s+certified|compliant\s+guaranteed|fully\s+compliant)\b/i.test(String(statement || ""));
  return claimsCert ? { ok: false, reason: "refused: certification/absolute-compliance is decided by an external accredited body, not by ODG" } : { ok: true, reason: "no unjustified certification claim" };
}

/** Seal a dossier as tamper-evident evidence; a sealed dossier is attributable ONLY to its tenant. */
function sealDossier(dossier: AssuranceDossier, opts?: any): any { return prov.stampProvenance(dossier, { revision: opts && opts.revision }); }
function dossierBelongsToTenant(sealed: any, tenantId: string): boolean { return !!sealed && sealed.tenantId === tenantId && prov.verifyProvenance(sealed).ok === true; }

export { buildDossier, assessObligation, detectReferenceChanges, assertNotCertified, sealDossier, dossierBelongsToTenant, CATALOG };
module.exports = { buildDossier, assessObligation, detectReferenceChanges, assertNotCertified, sealDossier, dossierBelongsToTenant, CATALOG };
