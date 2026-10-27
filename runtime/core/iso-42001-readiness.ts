#!/usr/bin/env node
/**
 * iso-42001-readiness — ODG's OWN ISO/IEC 42001:2023 (AI management system) readiness SELF-assessment.
 * Companion to iso-readiness.ts (27001). It maps ODG's real, proven controls to PRINCIPLE-LEVEL AIMS themes
 * that are publicly documented (ISO's public abstract + the widely-summarised Annex-A control areas) — it does
 * NOT reproduce or claim to quote the paywalled standard text (ACCESS = metadata-only; clause text NOT consulted).
 * A theme is SATISFIED only when every cited evidence suite is ACTUALLY gated in CI (verified against the
 * caller-supplied gated-suite list — real evidence, not a claim). Production-only themes (prod monitoring of AI
 * behaviour, off-host logging retention) are EXTERNAL. Honest banner: ODG prepares an AIMS posture; it is NOT
 * certified to ISO/IEC 42001 and is NOT "certification-ready" without an accredited audit. Pure, deterministic.
 */
"use strict";

// Principle-level AIMS themes (publicly-known 42001 scope — NOT clause text). Each cites ODG evidence suites, or
// is marked EXTERNAL where a hermetic test cannot prove it.
const THEMES: Array<{ theme: string; principle: string; evidence: string[]; external?: boolean; externalNote?: string }> = [
  { theme: "AI management system & policy", principle: "a governed, documented AI management system driven by policy + improvement", evidence: ["regulatory-assurance", "excellence-policy", "excellence-coverage"] },
  { theme: "Roles, responsibilities & authority", principle: "defined AI roles with authenticated, bound authority", evidence: ["agent-identity", "agent-governance-harness", "third-party-agent-gate"] },
  { theme: "AI risk assessment", principle: "systematic AI risk assessment feeding decisions", evidence: ["regulatory-assurance", "excellence-policy"] },
  { theme: "AI system impact assessment", principle: "assess impact of AI systems on individuals/society before/while operating", evidence: ["regulatory-assurance"] },
  { theme: "Data governance for AI", principle: "provenance + integrity of data/evidence used by AI", evidence: ["audit-log", "regulatory-assurance"] },
  { theme: "Lifecycle & change management of AI", principle: "governed changes, no false success, recoverable", evidence: ["governance-kernel", "checkpoint-engine", "build-recovery-engine"] },
  { theme: "Transparency & information to users", principle: "honest capability claims; no overclaim / no fabricated certification", evidence: ["excellence-policy", "proposal-generator", "regulatory-assurance"] },
  { theme: "Human oversight & accountability", principle: "human-gated consequential/external acts (deny-by-default)", evidence: ["agent-governance-harness", "quote"] },
  { theme: "Logging & traceability of AI decisions", principle: "tamper-evident decision/operation logs", evidence: ["audit-log", "mission-scheduler"] },
  { theme: "Third-party / supplier AI", principle: "admission + governance of third-party agents/components", evidence: ["third-party-agent-gate", "capability-executors"] },
  { theme: "Operational monitoring of AI behaviour", principle: "runtime monitoring/alerting on AI behaviour in production", evidence: [], external: true, externalNote: "read-only state views exist; PRODUCTION AI-behaviour monitoring + alerting + on-call is EXTERNAL" },
];

export interface Iso42001Readiness {
  standard: string; certificationStatus: string; now: string;
  controls: Array<{ theme: string; principle: string; status: string; evidenceGated: string[]; evidenceMissing: string[]; note: string }>;
  summary: { satisfied: number; partial: number; gap: number; external: number; total: number };
  gaps: string[]; notes: string[]; markdown: string;
}

/** assessIso42001Readiness({ gatedSuites, now }): gatedSuites = suite base-names actually gated in CI (real evidence). */
function assessIso42001Readiness(opts: any): Iso42001Readiness {
  const o = opts || {};
  const gated = new Set((Array.isArray(o.gatedSuites) ? o.gatedSuites : []).map(String));
  const now = String(o.now || "");
  const controls = THEMES.map((t) => {
    const present = t.evidence.filter((e) => gated.has(e));
    const missing = t.evidence.filter((e) => !gated.has(e));
    let status: string;
    if (t.external) status = present.length ? "PARTIAL_EXTERNAL" : "EXTERNAL";
    else if (t.evidence.length && missing.length === 0) status = "SATISFIED_VERIFIED";
    else if (present.length) status = "PARTIAL";
    else status = "GAP";
    const note = t.external ? (t.externalNote || "EXTERNAL") : (status === "SATISFIED_VERIFIED" ? "all cited evidence suites are gated in CI" : status === "PARTIAL" ? "some evidence gated; rest missing" : "no gated evidence");
    return { theme: t.theme, principle: t.principle, status, evidenceGated: present, evidenceMissing: missing, note };
  });
  const summary = {
    satisfied: controls.filter((c) => c.status === "SATISFIED_VERIFIED").length,
    partial: controls.filter((c) => c.status === "PARTIAL" || c.status === "PARTIAL_EXTERNAL").length,
    gap: controls.filter((c) => c.status === "GAP").length,
    external: controls.filter((c) => c.status === "EXTERNAL" || c.status === "PARTIAL_EXTERNAL").length,
    total: controls.length,
  };
  const gaps = controls.filter((c) => c.status === "GAP").map((c) => c.theme);
  const notes = [
    "PRINCIPLE-LEVEL only: ISO/IEC 42001:2023 clause/Annex-A text was NOT consulted (ACCESS=metadata-only, paywalled) — a clause-by-clause mapping requires the standard's text (free AFNOR/ANS consultation route eligibility TBV, else purchase).",
    "ISO/IEC 42001:2023 is a certifiable AI-management-system standard; themes above reflect its publicly-documented scope, not verbatim requirements.",
    "This self-assessment is distinct from the EU AI Act (a law) and from ISO/IEC 27001 (security MS); see iso-readiness for 27001.",
  ];
  const L: string[] = [];
  L.push(`# ODG — ISO/IEC 42001:2023 AI-management-system readiness (SELF-assessment, principle-level)`);
  L.push("");
  L.push(`> **NOT_CERTIFIED — ODG prepares an AIMS posture; an accredited body certifies. This is a self-assessment, not an independent audit or certification.**`);
  L.push("");
  L.push(`Summary: satisfied ${summary.satisfied} · partial ${summary.partial} · gap ${summary.gap} · external ${summary.external} / ${summary.total} themes.`);
  L.push("");
  L.push(`| theme (principle-level) | status | gated evidence | note |`);
  L.push(`|---|---|---|---|`);
  for (const c of controls) L.push(`| ${c.theme} | ${c.status} | ${c.evidenceGated.join(", ") || "—"} | ${c.note} |`);
  L.push("");
  for (const n of notes) L.push(`> ${n}`);
  return { standard: "ISO/IEC 42001:2023", certificationStatus: "NOT_CERTIFIED — self-assessment only; accredited audit required", now, controls, summary, gaps, notes, markdown: L.join("\n") };
}

export { assessIso42001Readiness, THEMES };
module.exports = { assessIso42001Readiness, THEMES };
