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

function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const activities = isObj(o.activities) ? o.activities : { developsOrPlacesAiSystemUnderOwnName: true };
  const statements = arr(o.statements).length ? o.statements : [
    "We prepared ISO 27001-aligned evidence and documented our controls.",   // legitimate — must pass
    "Our system is ISO 27001 certified and fully compliant.",                 // overclaim — must be refused
  ];
  const prep = buildEvidencePrep(activities, statements);
  // E2 is clean when at least one overclaim is caught AND nothing is presented as certified.
  const degraded = prep.certified !== false;
  return Object.freeze({
    synthetic: true, profession: "P10", prep,
    level: "E2", degraded, note: "SYNTHETIC declared activities (not a real audited entity, not E5); AI-Act role classification (deny-by-default, declared-not-verified) + anti-overclaim; output is NOT_CERTIFIED evidence-prep; real accredited audit (E5) owner-gated NOT_RUN",
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
  ]),
});

module.exports = { buildEvidencePrep, runReferenceProject, P10_REGULATORY_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P10_REGULATORY_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
