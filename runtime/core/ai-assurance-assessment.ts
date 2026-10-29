#!/usr/bin/env node
/**
 * ai-assurance-assessment — PRODUCT D7 (AI Assurance & Governance): an integrated, EXECUTABLE assessment workflow that
 * composes existing ODG services through their verified interfaces — ai-act-role-classifier (role + obligations,
 * deny-by-default), regulatory-dossier-service/regulatory-assurance (requirement→control→evidence with
 * SATISFIED_VERIFIED/GAP/DECLARED_UNVERIFIED/NOT_APPLICABLE), and sbom-audit-service (real supply-chain checks).
 *
 * Control status vocabulary (fail-closed): PASS (a real check RAN and an independent verifier confirmed evidence) ·
 * FAIL (applicable, required evidence absent) · INSUFFICIENT_EVIDENCE (declared-but-unverified, OR a listed control with
 * NO executable check run here) · NOT_APPLICABLE. The CRITICAL honesty rule (mandate §3/§7): a LISTED control is NEVER
 * PASS unless its check actually executed and produced valid evidence — "listed" ⇒ INSUFFICIENT_EVIDENCE.
 *
 * This is TECHNICAL assurance, explicitly SEPARATE from legal certification / formal conformity assessment:
 * certificationStatus is always NOT_CERTIFIED. Composes existing services; NO new primitive. Pure/deterministic given
 * the injected now/verifier/runner (sbom read is fs-bounded).
 */
"use strict";

const AIACT = require("./ai-act-role-classifier.js");
const REG = require("./regulatory-dossier-service.js");
const SBOM = require("./sbom-audit-service.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * assessAISystem(input, opts?): input = { system:{ id, name?, intendedUse?, activities?(AI-Act flags),
 *   profile(CompanyProfile: tenantId, targetFrameworks, aiSystems, …), projectDir?, target? }, now?, registry?, verifier? }.
 * Returns { ok, assessment } — a reproducible, fail-closed technical assurance assessment. NOT a certification.
 */
function assessAISystem(input: any, opts: any = {}): any {
  if (!isObj(input) || !isObj(input.system) || typeof input.system.id !== "string" || !input.system.id) {
    return { ok: false, code: "INVALID_INPUT", reason: "input { system:{ id, profile:{tenantId,…} } } required" };
  }
  const sys = input.system;
  if (!isObj(sys.profile) || typeof sys.profile.tenantId !== "string" || !sys.profile.tenantId) {
    return { ok: false, code: "INVALID_INPUT", reason: "system.profile.tenantId required (multi-tenant isolation)" };
  }
  const now = typeof input.now === "string" ? input.now : "";
  const activities = isObj(sys.activities) ? sys.activities : {};
  const executedChecks: string[] = [];
  const controls: any[] = [];

  // (1) inventory + declared intended use.
  const inventory = { id: sys.id, name: sys.name || null, intendedUse: sys.intendedUse || null, declaredActivities: Object.keys(activities).filter((k) => activities[k] === true) };

  // (2) AI-Act role classification (REAL check: deny-by-default from declared activities).
  const role = AIACT.classifyRole(activities);
  executedChecks.push("ai-act-role-classification");
  // AI-Act obligation families are APPLICABLE controls with NO automated test here ⇒ INSUFFICIENT_EVIDENCE (never PASS by listing).
  if (role.undetermined) {
    controls.push({ id: "ai-act:role", group: "ai-act", status: "NOT_APPLICABLE", detail: "no qualifying AI-Act activity declared (deny-by-default)", evidence: "ai-act-role-classifier" });
  } else {
    for (const ob of role.obligations) controls.push({ id: `ai-act:${ob.role}:${ob.family.slice(0, 32)}`, group: "ai-act", status: "INSUFFICIENT_EVIDENCE", detail: `${ob.role} obligation family: ${ob.family} — applicable, no automated test executed (manual assessment required)`, evidence: "role classification (declared-not-verified)" });
    for (const a of role.art50) controls.push({ id: "ai-act:art50", group: "ai-act", status: "INSUFFICIENT_EVIDENCE", detail: `AI-Act transparency obligation: ${a}`, evidence: "declared activity triggers Art.50" });
  }

  // (3) framework readiness: requirement→control→evidence (REAL evidence gate via regulatory-assurance).
  const dossier = REG.buildRegulatoryDossier({ profile: sys.profile, activities, now, registry: input.registry }, { verifier: opts.verifier || input.verifier });
  let frameworkTally = { PASS: 0, FAIL: 0, INSUFFICIENT_EVIDENCE: 0, NOT_APPLICABLE: 0 };
  if (dossier.ok) {
    executedChecks.push("framework-evidence-assessment");
    const s = dossier.dossier.frameworks.summary;
    frameworkTally = { PASS: s.satisfiedVerified || 0, FAIL: s.gaps || 0, INSUFFICIENT_EVIDENCE: s.declaredUnverified || 0, NOT_APPLICABLE: s.notApplicable || 0 };
    // surface the OPEN framework controls (FAIL/INSUFFICIENT) as individual control entries from the dossier findings.
    for (const f of (dossier.dossier.findings || [])) {
      if (f.area === "compliance") controls.push({ id: f.id, group: "framework", status: /declared but NOT independently verified/i.test(f.detail) ? "INSUFFICIENT_EVIDENCE" : "FAIL", detail: f.detail, evidence: f.evidence });
      else if (f.area === "source-integrity") controls.push({ id: f.id, group: "framework", status: "FAIL", detail: f.detail, evidence: f.evidence });
    }
  } else {
    controls.push({ id: "framework:error", group: "framework", status: "INSUFFICIENT_EVIDENCE", detail: `framework assessment could not run: ${dossier.reason || dossier.code}`, evidence: "regulatory-dossier-service" });
  }

  // (4) supply-chain assurance (REAL): only if a projectDir is supplied, else NOT_APPLICABLE (not assessed, not faked PASS).
  let supplyChain: any = { status: "NOT_APPLICABLE", reason: "no projectDir supplied — supply-chain not assessed" };
  if (typeof sys.projectDir === "string" && sys.projectDir) {
    const sc = SBOM.auditProjectDir({ projectDir: sys.projectDir, target: sys.target || "commercial-closed" });
    if (sc.ok) {
      executedChecks.push("sbom-license-audit");
      const high = (sc.audit.findings || []).filter((f: any) => f.severity === "HIGH").length;
      const status = high > 0 ? "FAIL" : (sc.audit.needsReview ? "INSUFFICIENT_EVIDENCE" : "PASS");
      supplyChain = { status, componentCount: sc.audit.componentCount, findingCount: sc.audit.findingCount, policyClean: sc.audit.policyClean, needsReview: sc.audit.needsReview, cveScan: sc.audit.cveScan };
      controls.push({ id: "supply-chain:license", group: "supply-chain", status, detail: `SBOM license audit: ${sc.audit.componentCount} components, ${sc.audit.findingCount} finding(s)`, evidence: `real sbom-audit (${sc.audit.cveScan})` });
    } else {
      supplyChain = { status: "INSUFFICIENT_EVIDENCE", reason: `sbom audit could not run: ${sc.reason || sc.code}` };
      controls.push({ id: "supply-chain:license", group: "supply-chain", status: "INSUFFICIENT_EVIDENCE", detail: supplyChain.reason, evidence: "sbom-audit-service" });
    }
  }

  // consolidate.
  const tally = { PASS: 0, FAIL: 0, INSUFFICIENT_EVIDENCE: 0, NOT_APPLICABLE: 0 } as any;
  for (const c of controls) tally[c.status] = (tally[c.status] || 0) + 1;
  // add the framework PASS/NOT_APPLICABLE counts not individually listed (only open ones were pushed).
  tally.PASS += frameworkTally.PASS;
  tally.NOT_APPLICABLE += frameworkTally.NOT_APPLICABLE;
  const applicable = tally.PASS + tally.FAIL + tally.INSUFFICIENT_EVIDENCE;
  // fail-closed: ASSURED only if at least one real check ran AND no FAIL AND no INSUFFICIENT_EVIDENCE on applicable controls.
  const assured = executedChecks.length > 0 && tally.FAIL === 0 && tally.INSUFFICIENT_EVIDENCE === 0 && applicable > 0;

  return {
    ok: true,
    assessment: {
      inventory, now,
      executedChecks,
      aiAct: { roles: role.roles, undetermined: role.undetermined, obligationCount: role.obligations.length, art50Count: role.art50.length },
      frameworkTally, supplyChain,
      controls, tally, applicableControls: applicable,
      overall: assured ? "ASSURED_TECHNICAL" : "NOT_ASSURED",
      certificationStatus: dossier.ok ? dossier.dossier.certificationStatus : "NOT_CERTIFIED — assessment incomplete",
      limitations: [
        "TECHNICAL assurance only — NOT legal certification, NOT formal conformity assessment, NOT independent accredited assurance",
        "a control is PASS only when a real check ran AND an independent verifier confirmed evidence; a listed-but-untested control is INSUFFICIENT_EVIDENCE, never PASS",
        "AI-Act obligation families carry NO automated test here ⇒ INSUFFICIENT_EVIDENCE (manual/qualified assessment required)",
        "supply-chain CVE scanning is NOT performed (license audit only); absent projectDir ⇒ supply-chain NOT_APPLICABLE (not faked)",
      ],
      note: "Integrated technical AI-assurance assessment composing ai-act-role-classifier + regulatory-dossier + sbom-audit. Fail-closed: ASSURED_TECHNICAL requires a real check executed AND zero FAIL/INSUFFICIENT on applicable controls. NOT a certification. Nothing retained; nothing sent.",
    },
  };
}

export { assessAISystem };
module.exports = { assessAISystem };

if (require.main === module) {
  const r = assessAISystem({ system: { id: "sys-1", name: "Triage AI", intendedUse: "patient triage", activities: { usesAiSystemUnderOwnAuthority: true, systemInteractsWithHumans: true }, profile: { tenantId: "t1", country: "FR", processesEUPersonalData: true, targetFrameworks: ["GDPR", "ISO42001"], aiSystems: [{ id: "s1" }] } }, now: "2026-10-29" });
  const a = r.assessment;
  process.stdout.write(JSON.stringify({ overall: a && a.overall, tally: a && a.tally, executed: a && a.executedChecks }, null, 2) + "\n");
}
