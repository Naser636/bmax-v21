#!/usr/bin/env node
/**
 * iso-readiness — ODG's OWN ISO/IEC 27001:2022 readiness SELF-assessment (CTO certification track §2.A / §8.3). It maps
 * ODG's real, proven controls to PRINCIPLE-LEVEL security themes (NOT verbatim ISO Annex-A clause text — that text is
 * paywalled and NOT consulted) and marks each theme SATISFIED only when its cited evidence is a suite ACTUALLY gated in
 * CI (verified against the caller-supplied gated-suite list — real evidence, not a claim). Production-only themes
 * (KMS/HSM, off-host backup, prod monitoring, prod multi-tenant) are EXTERNAL. Honest banner: ODG prepares; it is NOT
 * certified and NOT "certification-ready" without an accredited audit. Pure, deterministic, no clock.
 */
"use strict";

// Principle-level themes (NOT ISO clause text). Each lists the ODG evidence suites that demonstrate it, or marks the
// theme EXTERNAL (needs production infra no hermetic test can prove).
const THEMES: Array<{ theme: string; principle: string; evidence: string[]; external?: boolean; externalNote?: string }> = [
  { theme: "Risk-based governance & continual improvement", principle: "ISMS driven by risk + improvement (principle-level; clause text not read)", evidence: ["excellence-coverage", "excellence-policy", "regulatory-assurance"] },
  { theme: "Identity & access / authentication", principle: "authenticated, least-privilege, bound access", evidence: ["agent-identity", "third-party-agent-gate", "agent-governance-harness"] },
  { theme: "Logging, monitoring & audit (tamper-evidence)", principle: "tamper-evident operational logging", evidence: ["audit-log", "mission-scheduler"] },
  { theme: "Secure development & change control", principle: "governed changes + CI gate + no false success", evidence: ["governance-kernel", "patch-executor-governance-guard", "mechanical-acceptance"] },
  { theme: "Incident recovery & resilience", principle: "recover without data loss; no false success", evidence: ["checkpoint-engine", "build-recovery-engine", "idempotency-guard"] },
  { theme: "Supplier / third-party (agent) risk", principle: "third-party admission + supply-chain governance", evidence: ["third-party-agent-gate", "capability-executors"] },
  { theme: "Evidence provenance & integrity", principle: "provenance-sealed, tamper-evident evidence", evidence: ["audit-log", "regulatory-assurance"] },
  { theme: "Backups", principle: "backup of critical stores", evidence: ["client-store-backup"], external: true, externalNote: "local backup logic proven; OFF-HOST encrypted backup + restore drills are EXTERNAL" },
  { theme: "Cryptographic key management", principle: "key custody/rotation", evidence: [], external: true, externalNote: "KMS/HSM custody is EXTERNAL (test-only keys hermetically)" },
  { theme: "Production multi-tenant isolation", principle: "tenant data/resource isolation", evidence: ["agent-governance-harness"], external: true, externalNote: "logical isolation proven hermetically; PRODUCTION datastore/compute isolation is EXTERNAL" },
  { theme: "Operational monitoring / alerting", principle: "runtime monitoring + alerting", evidence: [], external: true, externalNote: "read-only state views exist; production monitoring/alerting + on-call is EXTERNAL" },
];

export interface IsoReadiness {
  standard: string; certificationStatus: string; now: string;
  controls: Array<{ theme: string; principle: string; status: string; evidenceGated: string[]; evidenceMissing: string[]; note: string }>;
  summary: { satisfied: number; partial: number; gap: number; external: number; total: number };
  gaps: string[]; notes: string[]; markdown: string;
}

/** assessIsoReadiness({ gatedSuites, now }): gatedSuites = the list of suite base-names actually in CI (real evidence). */
function assessIsoReadiness(opts: any): IsoReadiness {
  const o = opts || {};
  const gated = new Set((Array.isArray(o.gatedSuites) ? o.gatedSuites : []).map(String));
  const now = String(o.now || "");
  const controls = THEMES.map((t) => {
    const present = t.evidence.filter((e) => gated.has(e));
    const missing = t.evidence.filter((e) => !gated.has(e));
    let status: string;
    if (t.external) status = present.length ? "PARTIAL_EXTERNAL" : "EXTERNAL";       // local part may be proven; prod is external
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
    "PRINCIPLE-LEVEL only: ISO/IEC 27001:2022 Annex-A clause text was NOT consulted (paywalled) — a clause-by-clause mapping requires the standard's text (free AFNOR/ANS consultation route eligibility TBV, else purchase).",
    "ISO/IEC 27001:2022 Amd 1:2024 (climate action) applies — relevance to be assessed with the text.",
  ];
  const L: string[] = [];
  L.push(`# ODG — ISO/IEC 27001:2022 readiness (SELF-assessment, principle-level)`);
  L.push("");
  L.push(`> **${"NOT_CERTIFIED — ODG prepares; an accredited body certifies. This is a self-assessment, not an independent audit or certification."}**`);
  L.push("");
  L.push(`Summary: satisfied ${summary.satisfied} · partial ${summary.partial} · gap ${summary.gap} · external ${summary.external} / ${summary.total} themes.`);
  L.push("");
  L.push(`| theme (principle-level) | status | gated evidence | note |`);
  L.push(`|---|---|---|---|`);
  for (const c of controls) L.push(`| ${c.theme} | ${c.status} | ${c.evidenceGated.join(", ") || "—"} | ${c.note} |`);
  L.push("");
  for (const n of notes) L.push(`> ${n}`);
  return { standard: "ISO/IEC 27001:2022 (+Amd 1:2024)", certificationStatus: "NOT_CERTIFIED — self-assessment only; accredited audit required", now, controls, summary, gaps, notes, markdown: L.join("\n") };
}

export { assessIsoReadiness, THEMES };
module.exports = { assessIsoReadiness, THEMES };
