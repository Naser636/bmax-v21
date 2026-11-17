#!/usr/bin/env node
"use strict";

/*
 * V12.4 §43 P10 — EU Regulatory/Assurance reference project (E2 + E3). PURE, deterministic. It REUSES
 * ai-act-role-classifier.classifyRole (deny-by-default role/obligation families, declared-not-verified) +
 * regulatory-assurance.assertNotCertified (anti-overclaim: certification is decided by an external accredited body,
 * never by ODG) with NO second classifier. DEMONSTRATES: declared activities => roles+obligation families; no
 * activity => UNDETERMINED (deny-by-default); an overclaiming statement ("ISO 27001 certified") => REFUSED. The
 * output is NOT_CERTIFIED evidence-prep only. Synthetic; real audit engagement (E5) owner-gated NOT_RUN. Dual export.
 */

const AIACT = require("./ai-act-role-classifier");
const RA = require("./regulatory-assurance");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/** buildEvidencePrep(activities, statements) -> classification + anti-overclaim verdicts (NOT a certification). */
function buildEvidencePrep(activities: any, statements: any): any {
  const cls = AIACT.classifyRole(isObj(activities) ? activities : {});
  const checked = arr(statements).map((s: any) => ({ statement: String(s), verdict: RA.assertNotCertified(String(s)) }));
  const refused = checked.filter((c: any) => c.verdict.ok === false).length;
  return Object.freeze({
    roles: cls.roles, obligations: cls.obligations, undetermined: cls.undetermined, declaredNotVerified: cls.declaredNotVerified,
    statements: Object.freeze(checked), overclaimsRefused: refused,
    certified: false, basis: "NOT_CERTIFIED — evidence preparation only; certification is decided by an external accredited body",
  });
}

// V254 §2 — P10 could classify roles/obligations and refuse overclaims, but had NO obligation→EVIDENCE traceability: given
// the obligation families that attach to the declared roles, which have supporting evidence and which are GAPS? That is the
// core assurance-prep capability. assessObligationEvidence reuses classifyRole (no second classifier) and is fail-closed:
// a gap is NEVER a compliance failure of an accredited audit, and full coverage is NEVER "certified" (certification is an
// external accredited body's decision). Distinct from ai-act-annex-iv-completeness (one technical-doc's sections).
/** assessObligationEvidence(activities, providedFamilies) -> per declared obligation family, covered vs MISSING. */
function assessObligationEvidence(activities: any, providedFamilies: any): any {
  const cls = AIACT.classifyRole(isObj(activities) ? activities : {});
  const families: string[] = [];
  for (const o of arr(cls.obligations)) { const fam = o && typeof o.family === "string" ? o.family : null; if (fam && families.indexOf(fam) < 0) families.push(fam); }
  const provided = new Set(arr(providedFamilies).filter((f: any) => typeof f === "string"));
  const covered = families.filter((f: string) => provided.has(f));
  const missing = families.filter((f: string) => !provided.has(f));
  const coverageRatio = families.length > 0 ? Math.round((covered.length / families.length) * 1000) / 1000 : 0;
  return Object.freeze({
    roles: cls.roles, families: Object.freeze(families), covered: Object.freeze(covered), missing: Object.freeze(missing),
    coverageRatio, undetermined: cls.undetermined === true,
    // fail-closed: nothing declared ⇒ not "complete"; a gap is a prep gap, NOT an accredited non-conformity; never certified.
    complete: families.length > 0 && missing.length === 0, certified: false, declaredNotVerified: true,
    basis: "NOT_CERTIFIED — obligation→evidence coverage PREP only; a missing family is an evidence gap to close, not an accredited non-conformity; full coverage is not certification (decided by an external accredited body)",
  });
}

function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const activities = isObj(o.activities) ? o.activities : { developsOrPlacesAiSystemUnderOwnName: true };
  const statements = arr(o.statements).length ? o.statements : [
    "We prepared ISO 27001-aligned evidence and documented our controls.",   // legitimate — must pass
    "Our system is ISO 27001 certified and fully compliant.",                 // overclaim — must be refused
  ];
  const prep = buildEvidencePrep(activities, statements);
  // V254 opt-in obligation→evidence coverage (default path unchanged).
  const coverage = o.providedFamilies !== undefined ? assessObligationEvidence(activities, o.providedFamilies) : null;
  // E2 is clean when at least one overclaim is caught AND nothing is presented as certified.
  const degraded = prep.certified !== false || (coverage && coverage.certified !== false);
  return Object.freeze({
    synthetic: true, profession: "P10", prep, obligationEvidence: coverage,
    level: "E2", degraded: !!degraded, note: "SYNTHETIC declared activities (not a real audited entity, not E5); AI-Act role classification (deny-by-default, declared-not-verified) + anti-overclaim; output is NOT_CERTIFIED evidence-prep; real accredited audit (E5) owner-gated NOT_RUN",
  });
}

const P10_REGULATORY_REFERENCE_CONTRACT = Object.freeze({
  id: "V124-P10-REGULATORY-REFERENCE",
  source: "V12.4 §43 P10 (EU Regulatory/Assurance) — E2 reference + E3 (overclaim / undetermined)",
  levels: Object.freeze(["E0", "E1", "E2", "E3", "E4(owner/independent)", "E5(owner-gated NOT_RUN)"]),
  reuses: Object.freeze(["ai-act-role-classifier.classifyRole (deny-by-default)", "regulatory-assurance.assertNotCertified (anti-overclaim)"]),
  notAuthority: "a runnable regulatory evidence-prep reference; NOT a certification, NOT legal advice; no E5 claim",
  invariants: Object.freeze([
    "role/obligation classification is deny-by-default and declared-not-verified (no activity => UNDETERMINED)",
    "a certification/absolute-compliance claim is REFUSED — certification is decided by an external accredited body",
    "output is NOT_CERTIFIED evidence-prep only; real accredited audit (E5) owner-gated NOT_RUN (no inflated level)",
    "reuses the AI-Act classifier + anti-overclaim guard; no second classifier/assurance engine",
    "V254 obligation→evidence: assessObligationEvidence maps declared obligation families to provided evidence, reporting MISSING gaps + coverageRatio; fail-closed (nothing declared ⇒ not complete); a gap is a prep gap NOT an accredited non-conformity; full coverage is NEVER certification",
  ]),
});

module.exports = { buildEvidencePrep, assessObligationEvidence, runReferenceProject, P10_REGULATORY_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P10_REGULATORY_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
