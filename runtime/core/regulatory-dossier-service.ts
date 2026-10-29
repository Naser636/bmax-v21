#!/usr/bin/env node
/**
 * regulatory-dossier-service — the Legal/Compliance (#15) business capability: from a DECLARED system/company profile,
 * produce ONE regulatory readiness dossier combining (a) the EU AI-Act role classification and (b) the framework
 * readiness assessment (GDPR / ISO 27001 / ISO 42001 / DORA), with source-cited obligations and SARIF-emittable
 * findings. Composes two proven primitives — ai-act-role-classifier.classifyRole + regulatory-assurance.buildDossier —
 * no new primitive, no orchestrator.
 *
 * Honesty / fail-closed (deny-by-default), inherited from the primitives and enforced here:
 *   - NOT a legal opinion and NOT a certification — certificationStatus is always NOT_CERTIFIED; a "certified" claim
 *     is refused (assertNotCertified).
 *   - AI-Act role is UNDETERMINED (no obligation asserted) unless a qualifying activity is declared.
 *   - a framework obligation whose source is absent from the reference registry is REFUSED, never emitted as fact.
 *   - client-declared evidence is never "verified" without an injected independent verifier; missing ⇒ GAP.
 * Pure/deterministic (dates are DATA; "now" is injected).
 */
"use strict";

const AIACT = require("./ai-act-role-classifier.js");
const REG = require("./regulatory-assurance.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// The authorized public reference registry for the sources the obligation CATALOG cites (ids must match sourceIds).
// These are real public instruments; version is the governing year. A source NOT here ⇒ its obligations are refused.
const DEFAULT_REGISTRY = Object.freeze([
  { id: "GDPR-2016-679", version: "2016", title: "Regulation (EU) 2016/679 (GDPR)" },
  { id: "ISO27001-2022", version: "2022", title: "ISO/IEC 27001:2022" },
  { id: "ISO42001-2023", version: "2023", title: "ISO/IEC 42001:2023" },
  { id: "DORA-2022-2554", version: "2022", title: "Regulation (EU) 2022/2554 (DORA)" },
]);

function severityOfRisk(risk: number): string { return risk >= 4 ? "HIGH" : risk === 3 ? "MEDIUM" : "LOW"; }

/**
 * buildRegulatoryDossier(input, opts?): input = { profile (CompanyProfile), activities?, now?, registry? }.
 * opts.verifier / opts.verifier2 are injected independent evidence verifiers (optional). Returns { ok, dossier }.
 */
function buildRegulatoryDossier(input: any, opts: any = {}): any {
  if (!isObj(input) || !isObj(input.profile) || typeof input.profile.tenantId !== "string" || !input.profile.tenantId) {
    return { ok: false, code: "INVALID_INPUT", reason: "input { profile: { tenantId, … }, activities?, now? } required" };
  }
  const now = typeof input.now === "string" ? input.now : "";
  const registry = Array.isArray(input.registry) ? input.registry : DEFAULT_REGISTRY;

  // (a) EU AI-Act role classification (fail-closed — UNDETERMINED unless an activity is declared).
  const role = AIACT.classifyRole(input.activities || {});

  // (b) framework readiness dossier (source-cited; refuses unknown sources; evidence fail-closed).
  let fw: any;
  try { fw = REG.buildDossier(input.profile, { registry, now, verifier: opts.verifier, verifier2: opts.verifier2, knownVersions: opts.knownVersions }); }
  catch (e: any) { return { ok: false, code: "DOSSIER_ERROR", reason: (e && e.message) || String(e) }; }

  // ---- unified findings (SARIF-emittable) ----
  const findings: any[] = [];
  // framework: open obligations (GAP / DECLARED_UNVERIFIED) become findings ranked by risk; refused sources ⇒ HIGH.
  for (const f of fw.findings) {
    if (!f.applicable) continue;
    if (f.status === "GAP") findings.push({ id: `compliance:${f.obligationId}`, area: "compliance", severity: severityOfRisk(f.risk), detail: `${f.module}: ${f.title} — GAP (no verified evidence)`, remediation: f.remediation || `establish evidence for ${f.title}`, evidence: `source ${f.sourceId} (valid=${f.sourceValid})` });
    else if (f.status === "DECLARED_UNVERIFIED") findings.push({ id: `compliance:${f.obligationId}`, area: "compliance", severity: "MEDIUM", detail: `${f.module}: ${f.title} — declared but NOT independently verified`, remediation: "obtain independent verification of the declared evidence", evidence: `source ${f.sourceId}` });
  }
  for (const r of fw.refusedObligations) findings.push({ id: `refused:${r.id}`, area: "source-integrity", severity: "HIGH", detail: `obligation ${r.id} refused: ${r.reason}`, remediation: "add the cited source to the reference registry or correct the citation", evidence: r.reason });
  // AI-Act: Art.50 transparency duties are concrete ⇒ MEDIUM; role obligation families are applicable items ⇒ LOW/INFO.
  for (const a of role.art50) findings.push({ id: `ai-act:art50`, area: "ai-act", severity: "MEDIUM", detail: `AI-Act transparency obligation: ${a}`, remediation: "implement the transparency disclosure", evidence: "declared activity triggers Art.50" });
  for (const ob of role.obligations) findings.push({ id: `ai-act:${ob.role}`, area: "ai-act", severity: "LOW", detail: `AI-Act ${ob.role} obligation family: ${ob.family}`, remediation: "assess readiness against this obligation family", evidence: "role classification from declared activities (declared-not-verified)" });

  findings.sort((a, b) => { const o = { HIGH: 0, MEDIUM: 1, LOW: 2 } as any; return (o[a.severity] ?? 3) - (o[b.severity] ?? 3); });

  return {
    ok: true,
    dossier: {
      tenantId: input.profile.tenantId,
      now,
      certificationStatus: fw.certificationStatus,         // always NOT_CERTIFIED
      aiAct: { roles: role.roles, obligations: role.obligations, art50: role.art50, undetermined: role.undetermined, notes: role.notes },
      frameworks: { modulesRun: fw.modulesRun, summary: fw.summary, refusedObligations: fw.refusedObligations, remediationPlan: fw.remediationPlan, referenceChanges: fw.referenceChanges },
      findings,
      findingCount: findings.length,
      openHighCount: findings.filter((f) => f.severity === "HIGH").length,
      limits: [
        "this is a regulatory READINESS dossier, NOT a legal opinion and NOT a certification",
        "certificationStatus is always NOT_CERTIFIED — only an accredited/independent body can certify",
        "AI-Act role is UNDETERMINED (no obligation asserted) unless a qualifying activity is declared",
        "obligations whose source is absent from the reference registry are refused, never asserted; exact dates live in the standards register",
        "declared evidence is not 'verified' without an independent verifier; activities are declared-not-verified",
      ],
      note: "Composed AI-Act role classification + framework readiness (GDPR/ISO27001/ISO42001/DORA). Source-cited, fail-closed, deny-by-default. NOT a legal opinion or certification. Nothing invented; nothing sent anywhere.",
    },
  };
}

/** assertNotCertified passthrough — refuse any statement that claims certification/absolute compliance. */
function assertNotCertified(statement: string): any { return REG.assertNotCertified(statement); }

export { DEFAULT_REGISTRY, buildRegulatoryDossier, assertNotCertified };
module.exports = { DEFAULT_REGISTRY, buildRegulatoryDossier, assertNotCertified };

if (require.main === module) {
  const r = buildRegulatoryDossier({
    profile: { tenantId: "t1", country: "FR", processesEUPersonalData: true, targetFrameworks: ["GDPR", "ISO42001"], aiSystems: [{ id: "s1", purpose: "triage" }] },
    activities: { usesAiSystemUnderOwnAuthority: true, systemInteractsWithHumans: true },
    now: "2026-10-29",
  });
  process.stdout.write(JSON.stringify({ ok: r.ok, roles: r.dossier.aiAct.roles, art50: r.dossier.aiAct.art50.length, findingCount: r.dossier.findingCount, cert: r.dossier.certificationStatus.slice(0, 13) }, null, 2) + "\n");
}
