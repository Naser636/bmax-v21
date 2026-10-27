#!/usr/bin/env node
/**
 * iso-27001-clause-matrix — maps ODG's evidence to the PUBLICLY-DOCUMENTED structure of ISO/IEC 27001:2022
 * (management-system clauses 4–10 + Annex A: 93 controls in 4 themes A.5/A.6/A.7/A.8) and its Amd 1:2024 (climate
 * action at 4.1/4.2). It does NOT reproduce normative clause TEXT (that text is paywalled; the AFNOR free-consultation
 * route was not readable in-session) — only the public clause/control STRUCTURE and ODG's own evidence are used.
 *
 * CRITICAL HONESTY RULE (mandate): a passing software test is NOT sufficient to declare a control SATISFIED. A gated
 * suite proves a MECHANISM exists in code; an ISMS control is SATISFIED only when operational evidence (applied policy,
 * records, operation over time) ALSO exists. So: codeEvidence (gated) ⇒ MECHANISM_PRESENT; SATISFIED requires an
 * explicit operationalEvidence assertion (default false). Production-only controls are EXTERNAL. Pure, deterministic.
 * NOT a certification; an accredited body certifies.
 */
"use strict";

// Management-system clauses (public structure). climate note = Amd 1:2024.
const MS_CLAUSES: Array<{ ref: string; area: string; title: string; codeEvidence: string[]; external?: boolean; note?: string }> = [
  { ref: "4", area: "MS", title: "Context of the organization (4.1/4.2 incl. climate — Amd 1:2024)", codeEvidence: ["excellence-coverage", "regulatory-assurance"], note: "climate relevance per Amd 1:2024 to be assessed with the text" },
  { ref: "5", area: "MS", title: "Leadership & policy", codeEvidence: ["excellence-policy", "governance-kernel"] },
  { ref: "6", area: "MS", title: "Planning (risk assessment & treatment)", codeEvidence: ["regulatory-assurance", "excellence-policy"] },
  { ref: "7", area: "MS", title: "Support (resources, competence, documented info)", codeEvidence: ["audit-log", "evidence-provenance"] },
  { ref: "8", area: "MS", title: "Operation (risk treatment in operation)", codeEvidence: ["mechanical-acceptance", "governance-kernel"] },
  { ref: "9", area: "MS", title: "Performance evaluation (monitoring, audit, review)", codeEvidence: ["audit-log"], external: true, note: "internal-audit records + management review are operational/EXTERNAL" },
  { ref: "10", area: "MS", title: "Improvement (nonconformity & corrective action)", codeEvidence: ["build-recovery-engine", "incident-resolution-lifecycle"] },
];

// Representative Annex A controls (public numbering/titles). Not exhaustive of all 93 — representative per theme.
const ANNEX_A: Array<{ ref: string; area: string; title: string; codeEvidence: string[]; external?: boolean; note?: string }> = [
  { ref: "A.5 (Organizational, 37)", area: "A.5", title: "policies, roles, supplier & cloud security, incident mgmt", codeEvidence: ["excellence-policy", "third-party-agent-gate"] },
  { ref: "A.5.7", area: "A.5", title: "threat intelligence", codeEvidence: [], external: true, note: "operational threat-intel feed is EXTERNAL" },
  { ref: "A.6 (People, 8)", area: "A.6", title: "screening, terms, awareness, disciplinary", codeEvidence: [], external: true, note: "HR/people controls are organizational/EXTERNAL for a solo entity" },
  { ref: "A.7 (Physical, 14)", area: "A.7", title: "physical perimeter, equipment, media", codeEvidence: [], external: true, note: "physical controls EXTERNAL (hosting/premises)" },
  { ref: "A.8.2", area: "A.8", title: "privileged access rights", codeEvidence: ["agent-identity", "agent-governance-harness"] },
  { ref: "A.8.5", area: "A.8", title: "secure authentication", codeEvidence: ["agent-identity", "third-party-agent-gate"] },
  { ref: "A.8.13", area: "A.8", title: "information backup", codeEvidence: ["client-store-backup"], external: true, note: "local backup proven; off-host encrypted backup + restore drill EXTERNAL" },
  { ref: "A.8.15", area: "A.8", title: "logging", codeEvidence: ["audit-log", "mission-scheduler"] },
  { ref: "A.8.16", area: "A.8", title: "monitoring activities", codeEvidence: [], external: true, note: "production monitoring/alerting EXTERNAL" },
  { ref: "A.8.24", area: "A.8", title: "use of cryptography / key management", codeEvidence: [], external: true, note: "KMS/HSM custody EXTERNAL" },
  { ref: "A.8.25", area: "A.8", title: "secure development lifecycle", codeEvidence: ["governance-kernel", "mechanical-acceptance"] },
  { ref: "A.8.28", area: "A.8", title: "secure coding", codeEvidence: ["patch-executor-governance-guard"] },
];

export interface ClauseMatrix {
  standard: string; certificationStatus: string; now: string;
  rows: Array<{ ref: string; area: string; title: string; status: string; codeEvidenceGated: string[]; note: string }>;
  summary: { satisfied: number; mechanismPresent: number; external: number; gap: number; total: number };
  notes: string[]; markdown: string;
}

/**
 * buildClauseMatrix({ gatedSuites, operationalEvidence?, now }):
 *   gatedSuites = suite base-names actually gated in CI (real code evidence).
 *   operationalEvidence = { <ref>: true } to assert a control is operated (records/policy) — WITHOUT it a code-evidenced
 *   control is only MECHANISM_PRESENT, never SATISFIED (mandate: a test alone does not satisfy a control).
 */
function buildClauseMatrix(opts: any): ClauseMatrix {
  const o = opts || {};
  const gated = new Set((Array.isArray(o.gatedSuites) ? o.gatedSuites : []).map(String));
  const op = o.operationalEvidence && typeof o.operationalEvidence === "object" ? o.operationalEvidence : {};
  const now = String(o.now || "");
  const all = MS_CLAUSES.concat(ANNEX_A);
  const rows = all.map((c) => {
    const present = (c.codeEvidence || []).filter((e) => gated.has(e));
    let status: string;
    if (c.external) status = present.length ? "PARTIAL_EXTERNAL" : "EXTERNAL";
    else if (present.length === 0) status = "GAP";
    else if (op[c.ref] === true) status = "SATISFIED";          // code mechanism + operational evidence
    else status = "MECHANISM_PRESENT";                           // code only — NOT satisfied (honesty rule)
    const note = c.note || (status === "MECHANISM_PRESENT" ? "code mechanism gated; operational evidence (records/policy) NOT asserted ⇒ not satisfied" : status === "SATISFIED" ? "code mechanism + operational evidence asserted" : status === "GAP" ? "no gated code evidence" : "");
    return { ref: c.ref, area: c.area, title: c.title, status, codeEvidenceGated: present, note };
  });
  const summary = {
    satisfied: rows.filter((r) => r.status === "SATISFIED").length,
    mechanismPresent: rows.filter((r) => r.status === "MECHANISM_PRESENT").length,
    external: rows.filter((r) => r.status === "EXTERNAL" || r.status === "PARTIAL_EXTERNAL").length,
    gap: rows.filter((r) => r.status === "GAP").length,
    total: rows.length,
  };
  const notes = [
    "STRUCTURE-LEVEL: public ISO/IEC 27001:2022 clause/control numbering + Annex A themes (A.5 org 37, A.6 people 8, A.7 physical 14, A.8 technological 34). Normative clause TEXT NOT reproduced (paywalled; AFNOR free-consultation route not readable in-session).",
    "MECHANISM_PRESENT ≠ SATISFIED: a gated software test proves a code mechanism, NOT that the ISMS control is operated. SATISFIED requires asserted operational evidence (records/policy over time).",
    "Amd 1:2024 adds climate consideration at clauses 4.1/4.2 — relevance to be assessed with the licensed text.",
    "Annex A rows are representative, not the full 93 controls; a complete mapping requires the licensed/consultation text.",
  ];
  const L: string[] = [];
  L.push("# ODG — ISO/IEC 27001:2022 clause & Annex A matrix (structure-level self-assessment)");
  L.push("");
  L.push("> **NOT_CERTIFIED — ODG prepares; an accredited body certifies. A passing test ≠ an operated control.**");
  L.push("");
  L.push(`Summary: SATISFIED ${summary.satisfied} · MECHANISM_PRESENT ${summary.mechanismPresent} · external ${summary.external} · gap ${summary.gap} / ${summary.total} rows.`);
  L.push("");
  L.push("| ref | title (structure-level) | status | gated code evidence | note |");
  L.push("|---|---|---|---|---|");
  for (const r of rows) L.push(`| ${r.ref} | ${r.title} | ${r.status} | ${r.codeEvidenceGated.join(", ") || "—"} | ${r.note} |`);
  L.push("");
  for (const n of notes) L.push(`> ${n}`);
  return { standard: "ISO/IEC 27001:2022 (+Amd 1:2024)", certificationStatus: "NOT_CERTIFIED — self-assessment; accredited audit required; operational evidence pending", now, rows, summary, notes, markdown: L.join("\n") };
}

export { buildClauseMatrix, MS_CLAUSES, ANNEX_A };
module.exports = { buildClauseMatrix, MS_CLAUSES, ANNEX_A };
