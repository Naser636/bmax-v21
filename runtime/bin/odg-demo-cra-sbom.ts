#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V44 Chantier B — P3 "CRA SBOM readiness" DEMONSTRATOR. Composes ODG's EXISTING, gate-tested capabilities
 * (sbom-audit-service + supply-chain-attest + license-policy) over PUBLIC inputs (a project's own dependency manifests —
 * no client data) to produce a reproducible readiness artifact: a machine-readable SBOM + a license-policy audit mapped to
 * the EU Cyber Resilience Act's concrete obligations. HONEST SCOPE: ODG produces the SBOM + audit = *readiness evidence*,
 * NOT full CRA compliance (which also needs the manufacturer's full technical file, the 24h vuln-reporting process, and CE
 * marking — organisational, owner-side). Pure composition; no network; no mutation. Run: `odg-demo-cra-sbom.ts [projectDir] [outPath]`.
 */

const AUDIT = require("../core/sbom-audit-service.js");
const ATTEST = require("../core/supply-chain-attest.js");
const fs = require("fs");
const path = require("path");

const projectDir = process.argv[2] || ".";
const OUT = process.argv[3] || path.join(__dirname, "..", "..", "docs", "odg", "demonstrators", "P3_CRA_SBOM_READINESS.json");

function nowIso(): string { return new Date().toISOString(); }

const audit = AUDIT.auditProjectDir({ projectDir });
if (!audit || audit.ok !== true) { process.stderr.write(`demo failed: ${(audit && audit.reason) || "unknown"}\n`); process.exit(2); }
const a = audit.audit;
// build the machine-readable SBOM from the SAME recognised manifests.
const sources = (a.manifests || []).map((file: string) => { const eco = (AUDIT.MANIFESTS.find((m: any) => m.file === file) || {}).ecosystem; return { content: fs.readFileSync(path.join(projectDir, file), "utf8"), ecosystem: eco }; });
const sbom = ATTEST.buildSbomMulti(sources, { name: a.name, timestamp: nowIso() });
const componentCount = (sbom && Array.isArray(sbom.components)) ? sbom.components.length : 0;
const exitCode = AUDIT.auditExitCode(a);

// Map real ODG outputs to the CRA's concrete, dated obligations (facts verified 2026-11-10).
const craMapping = [
  { obligation: "Machine-readable SBOM covering (at least) top-level dependencies, kept in the technical documentation", dueDate: "2027-12-11", odgEvidence: `SBOM built (${componentCount} components across ${(a.manifests || []).length} manifest(s): ${(a.manifests || []).join(", ")})`, status: componentCount > 0 ? "PREPARED (machine-readable SBOM produced)" : "NOT_READY (no components extracted)" },
  { obligation: "Component-level visibility — prerequisite for 24h actively-exploited-vuln reporting to ENISA", dueDate: "2026-09-11", odgEvidence: `per-component inventory + license classification (${componentCount} components); feeds a vulnerability-reporting process (owner-operated)`, status: componentCount > 0 ? "PREPARED (inventory available)" : "NOT_READY" },
  { obligation: "License / supply-chain hygiene (secure-by-design inputs)", dueDate: "2027-12-11", odgEvidence: `license-policy audit: policyClean=${a.policyClean}, findings=${Array.isArray(a.findings) ? a.findings.length : "n/a"}`, status: a.policyClean === true ? "CLEAN" : "REVIEW_REQUIRED" },
];
const notCovered = [
  "Full technical documentation file (organisational — owner)",
  "24h/72h/14-day vulnerability reporting PROCESS to ENISA (owner-operated; ODG supplies the inventory, not the reporting duty)",
  "CE marking + declaration of conformity (owner/legal)",
  "5-year support + 10-year update availability commitments (owner/commercial)",
];

const artifact = {
  "//": "CTO V44 Chantier B — P3 CRA-SBOM READINESS demonstrator. REPRODUCIBLE on public inputs. ODG produces readiness EVIDENCE (SBOM + audit), NOT full CRA compliance (owner-side obligations listed). No client data. VERIFIED in-repo != a sold product (L2, 0 clients).",
  demonstrator: "P3 supply-chain / SBOM — EU Cyber Resilience Act readiness",
  generatedAt: nowIso(), project: a.name, inputManifests: a.manifests || [], publicInputs: true,
  sbom: { format: sbom && sbom.bomFormat ? sbom.bomFormat : "CycloneDX-like", specVersion: sbom && sbom.specVersion ? sbom.specVersion : null, componentCount, sampleComponents: (sbom.components || []).slice(0, 5) },
  licenseAudit: { policyClean: a.policyClean, findingsCount: Array.isArray(a.findings) ? a.findings.length : null, ciGateExitCode: exitCode, ciGateMeaning: exitCode === 1 ? "WOULD FAIL a CI gate (HIGH finding / policy violation)" : exitCode === 0 ? "clean / review-only" : "operational error" },
  craReadinessMapping: craMapping,
  notCoveredByOdg_ownerSide: notCovered,
  honesty: "This is a DEMONSTRATOR on public inputs, not a sold engagement. ODG capability maturity = L2 (locally proven, 0 paying clients). It evidences SBOM + audit readiness; it does NOT certify CRA compliance.",
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2) + "\n");
process.stdout.write(`=== P3 CRA-SBOM demonstrator written: ${OUT} ===\n`);
process.stdout.write(JSON.stringify({ project: a.name, componentCount, manifests: a.manifests, policyClean: a.policyClean, ciGateExitCode: exitCode }, null, 2) + "\n");

export {};
