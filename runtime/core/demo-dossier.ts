#!/usr/bin/env node
/**
 * demo-dossier — a REPRODUCIBLE sales/demo renderer (Track 1 demo + Track 3 value). It is a thin, read-only consumer
 * of the already-PROVEN regulatory-assurance.buildDossier: given a SYNTHETIC company profile it produces a
 * human-readable Markdown dossier for a live demonstration. It invents NOTHING — it only formats buildDossier's output
 * and always surfaces the honesty controls (NOT_CERTIFIED; declared-vs-verified evidence; applicability justifications;
 * refused obligations). No new capability, no new primitive; pure + deterministic (now is DATA).
 */
"use strict";

const RA = require("./regulatory-assurance.js");

/** Build the dossier (proven capability) + render it as Markdown. Returns { dossier, markdown }. */
function renderDemoDossier(profile: any, opts: any): { dossier: any; markdown: string } {
  const d = RA.buildDossier(profile, opts || {});
  const L: string[] = [];
  L.push(`# Regulatory-readiness dossier (DEMO) — tenant ${d.tenantId}`);
  L.push("");
  L.push(`> **This is a preparation dossier, not a certification.** ${d.certificationStatus}`);
  L.push("");
  L.push(`Modules run: ${d.modulesRun.join(", ") || "(none)"}`);
  L.push("");
  L.push(`## Summary`);
  L.push(`- applicable obligations: **${d.summary.applicable}**`);
  L.push(`- satisfied (independently verified): **${d.summary.satisfiedVerified}**`);
  L.push(`- declared but UNVERIFIED (client-declared ≠ verified): **${d.summary.declaredUnverified}**`);
  L.push(`- gaps: **${d.summary.gaps}**`);
  L.push(`- not applicable (justified): **${d.summary.notApplicable}**`);
  if (d.refusedObligations.length) L.push(`- refused (unknown source — hallucination control): **${d.refusedObligations.length}**`);
  L.push("");
  L.push(`## Findings (requirement → control → evidence → owner → verification)`);
  L.push(`| obligation | module | status | evidence class | owner | applicability |`);
  L.push(`|---|---|---|---|---|---|`);
  for (const f of d.findings) {
    L.push(`| ${f.title} | ${f.module} | ${f.status} | ${f.evidenceClass} | ${f.owner || "—"} | ${f.applicable ? "applicable" : "N/A: " + f.applicabilityNote} |`);
  }
  L.push("");
  if (d.remediationPlan.length) {
    L.push(`## Prioritized remediation (by risk)`);
    for (const r of d.remediationPlan) L.push(`${r.priority}. **${r.obligationId}** — ${r.action}`);
    L.push("");
  }
  L.push(`## Excellence self-review (auto)`);
  L.push(`- verdict: **${d.excellenceReview.verdict}** — ${d.excellenceReview.recommendation}`);
  L.push("");
  L.push(`## Honest limits`);
  L.push(`- ODG prepares; an accredited/independent body certifies. No conformity or certification is claimed here.`);
  L.push(`- Evidence marked "client-declared" is NOT independently verified; "independently-verified" passed an injected verifier.`);
  L.push(`- Reference texts not fully consulted (e.g. ISO) are mapped at principle level only.`);
  return { dossier: d, markdown: L.join("\n") };
}

export { renderDemoDossier };
module.exports = { renderDemoDossier };
