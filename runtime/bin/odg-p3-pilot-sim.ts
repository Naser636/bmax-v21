#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V55 — P3 CRA/SBOM THIRD-PILOT INTERNAL SIMULATION (READINESS ONLY). Runs ONE complete synthetic
 * CRA/SBOM audit parcours over a SYNTHETIC digital product (clearly labelled; no client data) by composing ODG's
 * EXISTING P3 guard (cra-evidence-demonstrator.runCraEvidence → sbom-audit-service + compliance-evidence-pack +
 * golden-path-evidence-bundle + evidence-pack-export; verifyCraEvidence for tamper-evidence) plus the shared O1 report
 * and O2 evidence layers. HONEST SCOPE: technical EVIDENCE/READINESS preparation — NOT CRA conformity, NOT certification,
 * NOT legal advice, and NOT a real CVE scan (the guard marks cveScan=NOT_PERFORMED). Vulnerabilities, incidents and
 * timelines here are EXPLICITLY SIMULATED. E4 rehearsal; E5 = NOT_STARTED. No new engine. Run: `odg-p3-pilot-sim.ts [out]`.
 */

const CRA = require("../core/cra-evidence-demonstrator.js");
const O1 = require("../core/shared-report-generator.js");
const O2 = require("../core/shared-evidence-wrapper.js");
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2] || path.join(__dirname, "..", "..", "docs", "odg", "demonstrators", "P3_CRA_SBOM_PILOT_SIM.json");
function nowIso(): string { return new Date().toISOString(); }
const SYNTHETIC = true;

// ── STEP 1-2 — SYNTHETIC product + its software inventory (a small IoT gateway firmware package). No client data. ──
// synthetic package-lock.json (npm lockfile `packages` section: node_modules/<name> → {version, license}).
const productManifest = JSON.stringify({
  name: "demo-iot-gateway", version: "2.3.0", lockfileVersion: 3,
  packages: {
    "": { name: "demo-iot-gateway", version: "2.3.0" },
    "node_modules/mqtt": { version: "4.3.7", license: "MIT" },
    "node_modules/express": { version: "4.18.2", license: "MIT" },
    "node_modules/node-forge": { version: "1.3.1", license: "(BSD-3-Clause OR GPL-2.0)" },
    "node_modules/left-pad": { version: "1.3.0", license: "WTFPL" },
    "node_modules/typescript": { version: "5.4.0", license: "Apache-2.0", dev: true },
  },
});
const sources = [{ content: productManifest, ecosystem: "npm", file: "package-lock.json" }];

// ── STEP 3-7 — run the composed CRA evidence pipeline (SBOM + license gate + pack + sealed bundle + OSCAL export). ──
const cra = CRA.runCraEvidence({
  sources, target: "commercial-closed", repoName: "demo-iot-gateway",
  lockPackages: { "mqtt": "4.3.7", "express": "4.18.2", "node-forge": "1.3.1", "left-pad": "1.3.0" },
  sourceCommit: "0000000000000000000000000000000000000000", artifactName: "demo-iot-gateway-2.3.0.tar", artifactBytes: "SYNTHETIC-ARTIFACT-BYTES-demo-iot-gateway-2.3.0",
  buildRef: "synthetic-build-ref", confinement: { netOff: true, envCleared: true, roBinds: [] }, health: { available: true, status: "READY" },
  revision: "r1", runId: "p3-pilot-sim",
});
const verify = CRA.verifyCraEvidence(cra, {});                 // tamper-evidence re-verification (integrity, NOT conformity)
const bundleTamperOk = !!(verify.checks && verify.checks.bundle && verify.checks.bundle.ok);  // sealed-bundle digest re-verifies (pack signing is owner-gated; no signer in a synthetic run)
const componentCount = cra.summary ? cra.summary.componentCount : 0;

// ── SIMULATED vulnerabilities — the guard does NOT perform CVE scanning (cveScan=NOT_PERFORMED). These are a CLEARLY
//    LABELLED synthetic finding set for the remediation rehearsal; they are NOT real CVEs and NOT an observed scan. ──
const simulatedVulns = [
  { id: "SIM-VULN-001", component: "left-pad@1.3.0", severity: "LOW", cwe: "N/A", note: "SIMULATED — trivial dependency, illustrative only", exploited: false },
  { id: "SIM-VULN-002", component: "node-forge@1.3.1", severity: "HIGH", cwe: "CWE-310 (crypto handling)", note: "SIMULATED — illustrative high-severity to exercise 24h/72h reporting rehearsal", exploited: true },
  { id: "SIM-VULN-003", component: "express@4.18.2", severity: "MEDIUM", cwe: "CWE-400 (resource exhaustion)", note: "SIMULATED — illustrative medium", exploited: false },
];
// deterministic risk scoring + prioritization (SIMULATED).
const sevRank: any = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const prioritized = simulatedVulns
  .map((v) => ({ ...v, riskScore: sevRank[v.severity] * (v.exploited ? 2 : 1) }))
  .sort((a, b) => b.riskScore - a.riskScore);
const remediationPlan = prioritized.map((v, i) => ({
  priority: i + 1, vuln: v.id, component: v.component, severity: v.severity, basis: "SIMULATED",
  action: v.exploited ? "SIMULATED: patch/upgrade immediately; prepare CRA actively-exploited reporting rehearsal (24h early warning / 72h notification / 14-day report — owner-operated)" : `SIMULATED: schedule upgrade of ${v.component}`,
}));
const activelyExploited = prioritized.filter((v) => v.exploited).length;

// ── CRA reporting obligations (DATES ARE DATA — repo-documented; see P3_CRA_SBOM_READINESS.json). Reporting is an
//    owner-operated PROCESS; ODG supplies the inventory/evidence, NOT the legal reporting duty. ──
const craObligations = [
  { obligation: "Actively-exploited-vuln reporting to ENISA/CSIRT — early warning", deadline: "24h", applicableFrom: "2026-09-11", requirementType: "LEGAL_OBLIGATION", owner: "manufacturer (owner-operated process)" },
  { obligation: "Vulnerability notification", deadline: "72h", applicableFrom: "2026-09-11", requirementType: "LEGAL_OBLIGATION", owner: "manufacturer" },
  { obligation: "Final report", deadline: "14 days", applicableFrom: "2026-09-11", requirementType: "LEGAL_OBLIGATION", owner: "manufacturer" },
  { obligation: "Machine-readable SBOM in technical documentation + main CRA obligations", deadline: "N/A", applicableFrom: "2027-12-11", requirementType: "LEGAL_OBLIGATION", owner: "manufacturer" },
  { obligation: "CE marking + declaration of conformity", deadline: "N/A", applicableFrom: "2027-12-11", requirementType: "NEEDS_LEGAL_EXPERTISE", owner: "manufacturer/legal" },
];

// ── STEP 8 — deliverable via shared O1 report (+O2 evidence). ──
const rep = O1.generateReport({
  metier: "P3", title: "CRA / SBOM Audit — PILOT SIMULATION (synthetic product)",
  status: `SIMULATION — ${componentCount}-component SBOM; CRA evidence ${cra.verdict}; ciGate=${cra.ciGate}; ${simulatedVulns.length} SIMULATED vulns (${activelyExploited} actively-exploited). READINESS, NOT CRA conformity/certification.`,
  summary: `Synthetic digital product 'demo-iot-gateway'. Composed CRA evidence run: SBOM (${componentCount} components), license-policy gate (ciGate=${cra.ciGate}: ${cra.ciGate === 1 ? "build should FAIL" : cra.ciGate === 0 ? "clean/review-only" : "audit unavailable"}), sealed golden-path bundle (attested=${cra.summary && cra.summary.bundleAttested}), OSCAL-interop export (${cra.summary && cra.summary.interopExport}). CVE scanning NOT_PERFORMED by the tool; ${simulatedVulns.length} SIMULATED vulns drive a remediation rehearsal (${activelyExploited} would trigger the 24h/72h/14-day owner-operated reporting process). Every vuln/incident/timeline is SIMULATED — NOT a real scan, NOT conformity, NOT legal advice.`,
  controls: [
    { name: "Machine-readable SBOM", status: componentCount > 0 ? "PRODUCED" : "EMPTY", detail: `${componentCount} components` },
    { name: "License-policy CI gate", status: cra.ciGate === 1 ? "WOULD-FAIL" : cra.ciGate === 0 ? "CLEAN/REVIEW" : "UNAVAILABLE", detail: `ciGate=${cra.ciGate}; policyClean=${cra.summary && cra.summary.policyClean}; needsReview=${cra.summary && cra.summary.needsReview}` },
    { name: "Tamper-evident evidence bundle", status: cra.summary && cra.summary.bundleAttested ? "ATTESTED" : "NOT-ATTESTED", detail: `sealed-bundle digest re-verified=${bundleTamperOk}; pack-signature owner-gated (no signer in synthetic run)` },
    { name: "OSCAL-interop export", status: cra.summary && cra.summary.interopExport ? "OK" : "MISSING", detail: "downstream GRC shape" },
    { name: "CVE scan", status: "NOT_PERFORMED", detail: "guard performs license audit, not CVE scanning — SIMULATED vulns are illustrative" },
  ],
  findings: [
    ...prioritized.map((v) => ({ severity: v.severity, detail: `[SIMULATED] ${v.id} ${v.component}${v.exploited ? " (actively-exploited → reporting rehearsal)" : ""}`, basis: "SIMULATED" })),
    ...(cra.gaps || []).slice(0, 5).map((g: string) => ({ severity: "MEDIUM", detail: `evidence gap: ${g}`, basis: "PROVEN" })),
  ],
  recommendations: [
    "run a REAL CVE scan against an offline feed before any vulnerability claim (tool does license audit only)",
    "keep the machine-readable SBOM in the technical documentation (CRA main obligations 2027-12-11)",
    "operate the 24h/72h/14-day reporting PROCESS (owner duty; ODG supplies inventory/evidence, not the legal filing)",
    "do NOT present this as CRA conformity, certification, or legal advice",
  ],
  limits: [
    "ALL inputs are SYNTHETIC — no client product, no client data",
    "vulnerabilities/incidents/timelines are SIMULATED and illustrative — NOT a real CVE scan (cveScan=NOT_PERFORMED)",
    "technical EVIDENCE/READINESS only — NOT CRA conformity, NOT certification, NOT legal advice",
    "CRA reporting is an owner-operated legal PROCESS; ODG supplies the inventory/evidence, not the reporting duty",
    "ODG maturity L2 for P3; 0 paying clients; E5 (client-validated) = NOT_STARTED",
  ],
  evidence: [
    { claim: `${componentCount}-component machine-readable SBOM + license-policy gate (ciGate=${cra.ciGate})`, basis: "PROVEN", sourceRef: path.basename(OUT) },
    { claim: `sealed golden-path bundle tamper-evidence re-verified: ${bundleTamperOk}`, basis: "PROVEN", sourceRef: path.basename(OUT) },
    { claim: `${simulatedVulns.length} SIMULATED vulnerabilities + prioritized remediation`, basis: "SIMULATED", sourceRef: path.basename(OUT) },
    { claim: `CRA reporting obligations mapped (dates are data; owner-operated)`, basis: "ESTIMATED", sourceRef: path.basename(OUT) },
  ],
  validationConditions: [
    "re-run reproduces the SBOM + gate + evidence digest from identical synthetic inputs",
    "evidence digest independently verifiable via O2.verifyEvidence; bundle tamper-evidence via verifyCraEvidence",
    "before E5: real authorized client + real product manifests + a real CVE scan + documented client validation",
  ],
});

const o2verify = O2.verifyEvidence(rep.json.evidence);

const artifact = {
  "//": "CTO V55 — P3 CRA/SBOM THIRD-PILOT internal simulation. SYNTHETIC product. SBOM/gate/bundle are real composition over synthetic manifests; vulns/incidents/timelines SIMULATED (no CVE scan). READINESS, NOT CRA conformity/certification/legal advice. E4 rehearsal; E5=NOT_STARTED. Reuses cra-evidence-demonstrator + O1/O2; no new engine.",
  demonstrator: "P3 CRA/SBOM — third-pilot internal simulation (readiness only)",
  generatedAt: nowIso(), synthetic: SYNTHETIC,
  parcours: ["1 scope", "2 software inventory", "3 SBOM + provenance", "4 vulnerabilities (SIMULATED)", "5 risk analysis", "6 prioritization", "7 remediation plan", "8 O1 deliverable + O2 evidence", "9 reporting obligations", "10 independent controller review (external, owner-gated)"],
  craEvidence: { verdict: cra.verdict, basis: cra.basis, ciGate: cra.ciGate, summary: cra.summary, gaps: cra.gaps },
  tamperEvidenceVerification: verify,
  simulatedVulnerabilities: prioritized, remediationPlan, activelyExploited,
  craReportingObligations: craObligations,
  independentEvidenceVerification: o2verify,
  e5Status: "NOT_STARTED — simulation only; no real client, no real product, no CVE scan, no client validation",
  report: rep.json,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2) + "\n");
fs.writeFileSync(OUT.replace(/\.json$/, ".md"), rep.markdown);
process.stdout.write(`=== P3 CRA/SBOM PILOT SIMULATION written: ${OUT} (+ ${OUT.replace(/\.json$/, ".md")}) ===\n`);
process.stdout.write(JSON.stringify({ components: componentCount, ciGate: cra.ciGate, verdict: cra.verdict, bundleAttested: cra.summary && cra.summary.bundleAttested, tamperVerified: verify.ok, simulatedVulns: simulatedVulns.length, activelyExploited, reportOk: rep.ok, evidenceVerified: o2verify.ok, evidenceDigest: rep.json.evidence.integrity.digest, certified: false, e5: "NOT_STARTED" }, null, 2) + "\n");

export {};
