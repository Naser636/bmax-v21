#!/usr/bin/env node
/**
 * assurance-pilot-runner — a REPRODUCIBLE, deterministic pilot that runs the assurance analysis on a SYNTHETIC project
 * descriptor and produces an honest client-style dossier: findings (outdated deps, license conflicts, test-coverage
 * gap, EU AI-Act Art.50 flags), each with severity + remediation + evidence; a before/after remediation delta; a
 * testable acceptance verdict; a provenance SEAL (reuses evidence-provenance.contentDigest) and a tamper-evident run
 * log (reuses audit-log). SYNTHETIC ONLY — this proves the delivery SHAPE is reproducible; it is NOT a real client
 * engagement, issues no certification, and guarantees nothing. No network, no external system, no client data. Pure/
 * deterministic: same input ⇒ same findings ⇒ same digest. Fail-closed on malformed input.
 */
"use strict";

const PROV = require("./evidence-provenance.js");
const AUDIT = require("./audit-log.js");

const PERMISSIVE = new Set(["MIT", "APACHE-2.0", "BSD-2-CLAUSE", "BSD-3-CLAUSE", "ISC", "MPL-2.0"]);
const COVERAGE_MIN = 0.8;

function sev(s: string) { return s; }

/** runPilot(input, opts?): input = { project, dependencies:[{name,version,license,outdated}], tests:{total,passing}, aiActivities }. */
function runPilot(input: any, opts: any = {}): any {
  if (!input || typeof input !== "object" || !Array.isArray(input.dependencies)) {
    return { ok: false, code: "INVALID_INPUT", detail: "project + dependencies[] required (synthetic)" };
  }
  const project = String(input.project || "synthetic-project");
  const deps = input.dependencies;
  const findings: any[] = [];

  // Dependency / license / outdated findings.
  for (const d of deps) {
    const name = String((d && d.name) || "?");
    const lic = String((d && d.license) || "UNKNOWN").toUpperCase();
    if (d && d.outdated === true) findings.push({ id: `DEP-OUTDATED:${name}`, area: "dependency", severity: sev("MEDIUM"), detail: `${name} is outdated`, remediation: `upgrade ${name} to a maintained version`, evidence: `SBOM entry ${name}@${d.version || "?"}` });
    if (!PERMISSIVE.has(lic)) findings.push({ id: `LICENSE:${name}`, area: "license", severity: sev(lic === "UNKNOWN" ? "HIGH" : "HIGH"), detail: `${name} license ${lic} is non-permissive/unknown`, remediation: `review obligations or replace ${name}`, evidence: `license-policy classification ${lic}` });
  }
  // Test-coverage finding.
  const t = input.tests || {};
  const total = Number(t.total) || 0, passing = Number(t.passing) || 0;
  const ratio = total > 0 ? passing / total : 0;
  if (ratio < COVERAGE_MIN) findings.push({ id: "TEST-COVERAGE", area: "reliability", severity: sev("MEDIUM"), detail: `passing ratio ${Math.round(ratio * 100)}% < ${COVERAGE_MIN * 100}%`, remediation: "raise test coverage / fix failing tests", evidence: `tests ${passing}/${total}` });
  // AI-Act Art.50 flags.
  const ai = input.aiActivities || {};
  if (ai.generatesSyntheticContent === true) findings.push({ id: "AIACT-50-2", area: "ai-act", severity: sev("HIGH"), detail: "generates synthetic content — Art.50(2) marking applies", remediation: "machine-readable marking of AI-generated content", evidence: "declared aiActivities.generatesSyntheticContent" });
  if (ai.systemInteractsWithHumans === true) findings.push({ id: "AIACT-50-1", area: "ai-act", severity: sev("MEDIUM"), detail: "user-facing AI — Art.50(1) disclosure applies", remediation: "inform users they interact with an AI", evidence: "declared aiActivities.systemInteractsWithHumans" });

  // SBOM summary (synthetic).
  const licenses: Record<string, number> = {};
  for (const d of deps) { const l = String((d && d.license) || "UNKNOWN").toUpperCase(); licenses[l] = (licenses[l] || 0) + 1; }
  const sbom = { dependencyCount: deps.length, licenses };

  // Acceptance: every finding has severity + remediation + evidence (by construction) ⇒ dossier is acceptable-form.
  const acceptance = { everyFindingActionable: findings.every((f) => f.severity && f.remediation && f.evidence), findingCount: findings.length };

  const payload = { project, sbom, findings, acceptance, synthetic: true };
  const seal = PROV.contentDigest(payload);
  const chain = AUDIT.appendEntry(Array.isArray(opts.chain) ? opts.chain : [], { run: "assurance-pilot", project, findingCount: findings.length, seal, at: String(opts.at || "") });

  const L: string[] = [];
  L.push(`# Assurance pilot dossier — ${project} (SYNTHETIC)`);
  L.push("");
  L.push("> **SYNTHETIC reproducible pilot — NOT a real client engagement; no certification; no guarantee; no client data.**");
  L.push("");
  L.push(`SBOM: ${sbom.dependencyCount} dependencies · licenses ${Object.entries(licenses).map(([k, v]) => `${k}:${v}`).join(", ")}.`);
  L.push("");
  L.push(`Findings (${findings.length}):`);
  for (const f of findings) L.push(`- [${f.severity}] ${f.area} — ${f.detail} → ${f.remediation} (evidence: ${f.evidence})`);
  L.push("");
  L.push(`Acceptance: every finding actionable = ${acceptance.everyFindingActionable}. Provenance seal: ${seal}.`);
  return { ok: true, project, sbom, findings, acceptance, seal, chain, synthetic: true, markdown: L.join("\n") };
}

/** applyRemediation(result, input): synthetic "after" — outdated upgraded, non-permissive flagged-resolved. Delta only. */
function applyRemediation(result: any, input: any): any {
  if (!result || !result.ok) return { ok: false, code: "NO_BASELINE" };
  const after = runPilot(Object.assign({}, input, {
    dependencies: (input.dependencies || []).map((d: any) => ({ ...d, outdated: false, license: PERMISSIVE.has(String(d.license || "").toUpperCase()) ? d.license : "MIT" })),
    tests: { total: (input.tests && input.tests.total) || 1, passing: (input.tests && input.tests.total) || 1 },
    aiActivities: input.aiActivities,          // AI-Act flags are compliance tasks, not auto-remediated
  }), {});
  return { ok: true, before: result.findings.length, after: after.findings.length, resolved: result.findings.length - after.findings.length, afterResult: after };
}

export { runPilot, applyRemediation };
module.exports = { runPilot, applyRemediation };
