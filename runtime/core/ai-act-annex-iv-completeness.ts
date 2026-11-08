#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 / WAVE-9 (P10 regulatory — world-research gap) — EU AI-ACT ANNEX IV TECHNICAL-DOCUMENTATION COMPLETENESS.
 * PURE, deterministic. World reference: EU AI Act (Reg 2024/1689) Article 11 + Annex IV — a high-risk PROVIDER must
 * prepare technical documentation covering NINE mandatory sections (general description + intended purpose; development
 * process/methods; architecture & compute; data governance; human oversight; performance metrics & test logs; risk-
 * management system; lifecycle changes; post-market monitoring plan), retained ≥10 years; standalone Annex-III high-
 * risk obligations in force 2-Aug-2026. ODG's ai-act-role-classifier NAMES "technical documentation" as a PROVIDER
 * obligation FAMILY but never checks it exists/complete; ai-assurance-assessment books it as INSUFFICIENT_EVIDENCE
 * ("no automated test executed") — a hole the codebase itself flags (grep-verified: Annex IV appears only as free-text
 * in compliance-evidence-pack, never enumerated/checked). This composes ai-act-role-classifier.classifyRole (role GATE)
 * + a frozen ANNEX_IV_SECTIONS registry + the standard finding shape. Presence/completeness only — declared-not-verified,
 * NOT a legal adequacy or conformity claim, NOT a certification. Deny-by-default. Dual export.
 */

const CLASSIFIER = require("./ai-act-role-classifier");   // classifyRole — only PROVIDER / GPAI_PROVIDER carry the Art.11 duty

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function finding(id: string, area: string, severity: string, detail: string, remediation: string, evidence: string): any {
  return Object.freeze({ id, area, severity, detail, remediation, evidence });
}

// Annex IV (Art.11) — the nine mandatory technical-documentation sections (no optional set).
const ANNEX_IV_SECTIONS = Object.freeze([
  { key: "generalDescription", title: "General description of the AI system + intended purpose" },
  { key: "developmentProcess", title: "Development process, design specifications & methods" },
  { key: "architectureCompute", title: "System architecture & computational resources" },
  { key: "dataGovernance", title: "Data governance: datasets, provenance, labelling, cleaning" },
  { key: "humanOversight", title: "Human oversight measures" },
  { key: "performanceMetrics", title: "Performance metrics, accuracy/robustness & test logs" },
  { key: "riskManagement", title: "Risk-management system (Art.9)" },
  { key: "lifecycleChanges", title: "Changes made to the system through its lifecycle" },
  { key: "postMarketMonitoring", title: "Post-market monitoring plan" },
]);
const PLACEHOLDERS = new Set(["", "tbd", "todo", "n/a", "na", "pending", "placeholder", "xxx", "..."]);

function sectionPresent(v: any): boolean {
  if (isStr(v)) return !PLACEHOLDERS.has(v.trim().toLowerCase());
  if (isObj(v)) return isStr(v.content) ? !PLACEHOLDERS.has(v.content.trim().toLowerCase()) : Object.keys(v).length > 0;
  return false;
}

/** assessAnnexIvCompleteness({ activities, techDoc }) -> { verdict, roleGate, sectionCoverage, missing, findings, declaredNotVerified }. */
function assessAnnexIvCompleteness(input: any): any {
  const o = isObj(input) ? input : {};
  const role = CLASSIFIER.classifyRole(isObj(o.activities) ? o.activities : {});
  const roles = Array.isArray(role.roles) ? role.roles : [];
  const isProvider = roles.some((r: any) => /PROVIDER/i.test(String(r)));

  if (role.undetermined) return gate("UNDETERMINED", "role undetermined — cannot assert Annex IV applicability (deny-by-default, no silent pass)", roles, [], []);
  if (!isProvider) return gate("NOT_APPLICABLE", "role carries no Art.11/Annex IV technical-documentation duty (only PROVIDER / GPAI_PROVIDER do)", roles, [], []);

  const techDoc = isObj(o.techDoc) ? o.techDoc : {};
  const sectionCoverage: any[] = []; const missing: string[] = []; const findings: any[] = [];
  for (const sec of ANNEX_IV_SECTIONS) {
    const present = sectionPresent(techDoc[sec.key]);
    sectionCoverage.push(Object.freeze({ key: sec.key, title: sec.title, present }));
    if (!present) {
      missing.push(sec.key);
      findings.push(finding(`annex-iv:missing:${sec.key}`, "regulatory", "HIGH", `Annex IV section missing/empty/placeholder: ${sec.title}`, `document the '${sec.title}' section of the Art.11 technical file`, `techDoc.${sec.key} absent`));
    }
  }
  const verdict = missing.length === 0 ? "COMPLETE_READINESS" : "INCOMPLETE";
  return gate(verdict, verdict === "COMPLETE_READINESS" ? "all nine Annex IV sections present & non-empty (presence only — declared-not-verified)" : `${missing.length}/9 Annex IV sections missing`, roles, sectionCoverage, missing, findings);
}

function gate(verdict: string, note: string, roles: any, sectionCoverage: any, missing: any, findings: any = []): any {
  return Object.freeze({
    verdict, roleGate: Object.freeze(roles), note,
    sectionCoverage: Object.freeze(sectionCoverage), missing: Object.freeze(missing), findings: Object.freeze(findings),
    declaredNotVerified: true, notLegalAdvice: true, certificationStatus: "NOT_CERTIFIED",   // presence check, NOT conformity
  });
}

const ANNEX_IV_COMPLETENESS_CONTRACT = Object.freeze({
  id: "V124-AI-ACT-ANNEX-IV-COMPLETENESS",
  source: "SÉRIE 23/W9 P10 — EU AI-Act Art.11 + Annex IV technical-documentation completeness (Reg 2024/1689; in force 2-Aug-2026)",
  sections: ANNEX_IV_SECTIONS.map((s) => s.key),
  reuses: Object.freeze(["ai-act-role-classifier.classifyRole (role gate)", "standard {id,area,severity,...} finding shape → sarif path", "converts ai-assurance-assessment's INSUFFICIENT_EVIDENCE for this family into an executable check"]),
  notAuthority: "a presence/completeness check on a declared technical file; NOT legal adequacy, NOT conformity, NOT a certification",
  invariants: Object.freeze([
    "only a PROVIDER / GPAI_PROVIDER carries the Art.11 duty; other roles ⇒ NOT_APPLICABLE; undetermined role ⇒ UNDETERMINED (deny-by-default, no silent pass)",
    "COMPLETE_READINESS only if ALL nine Annex IV sections are present AND non-empty (placeholders like TBD/TODO count as absent)",
    "any missing/empty section ⇒ INCOMPLETE + a HIGH finding per section",
    "presence only — declared-not-verified, certificationStatus NOT_CERTIFIED; it asserts no legal adequacy",
    "pure/deterministic: classify + registry membership; no clock/random/network",
  ]),
});

module.exports = { ANNEX_IV_SECTIONS, assessAnnexIvCompleteness, ANNEX_IV_COMPLETENESS_CONTRACT };

if (require.main === module) {
  const demo = assessAnnexIvCompleteness({ activities: { developsOrPlacesAiSystemUnderOwnName: true }, techDoc: { generalDescription: "x", dataGovernance: "y" } });
  process.stdout.write(JSON.stringify({ ...ANNEX_IV_COMPLETENESS_CONTRACT, demo: { verdict: demo.verdict, missing: demo.missing.length } }, null, 2) + "\n");
}

export {};
