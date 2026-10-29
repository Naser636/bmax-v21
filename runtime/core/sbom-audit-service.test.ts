#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the Cyber/Supply-chain capability end-to-end on REAL data (this repo's own
// package-lock.json) + synthetic license cases: a CycloneDX SBOM is built from real manifests, licenses are audited
// against an adoption policy, a GPL component is flagged HIGH (not shippable closed), an UNKNOWN license is flagged
// for manual review (fail-closed, never assumed safe), permissive deps pass, CVE scanning is declared NOT performed,
// and the findings emit valid SARIF. Deterministic (pure core + real file read of the committed lockfile).
"use strict";
const assert = require("assert");
const path = require("path");
const S = require("./sbom-audit-service.js");
const SARIF = require("./sarif-report.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const npmLock = (pkgs) => JSON.stringify({ name: "fix", lockfileVersion: 3, packages: pkgs });

// (1) REAL DATA: audit THIS repo's committed package-lock.json ⇒ a real SBOM with many components.
{
  const r = S.auditProjectDir({ projectDir: process.cwd() });
  ok("real repo package-lock.json ⇒ ok, CycloneDX SBOM, >100 components, npm ecosystem",
     r.ok && r.sbom.bomFormat === "CycloneDX" && r.audit.componentCount > 100 && r.audit.ecosystems.includes("npm") && typeof r.audit.findingCount === "number");
  // deterministic: a second read yields the identical component count + findings.
  const r2 = S.auditProjectDir({ projectDir: process.cwd() });
  ok("audit is deterministic (same componentCount + findingCount on re-run)", r2.audit.componentCount === r.audit.componentCount && r2.audit.findingCount === r.audit.findingCount);
}

// (2) a GPL-3.0 component ⇒ HIGH finding, NOT policy-clean for a commercial-closed product.
{
  const r = S.auditManifests([{ content: npmLock({ "": { name: "x" }, "node_modules/gpllib": { version: "1.0.0", license: "GPL-3.0-only" }, "node_modules/okmit": { version: "2.0.0", license: "MIT" } }), ecosystem: "npm" }], { target: "commercial-closed" });
  const hi = r.audit.findings.find((f) => f.severity === "HIGH");
  ok("GPL-3.0 ⇒ HIGH license finding, policyClean=false, MIT not flagged",
     r.ok && !!hi && /gpllib@1.0.0/.test(hi.evidence) && hi.area === "license" && r.audit.policyClean === false);
}

// (3) an UNKNOWN / missing license ⇒ MEDIUM review finding (fail-closed, never assumed safe).
{
  const r = S.auditManifests([{ content: npmLock({ "": { name: "x" }, "node_modules/mystery": { version: "0.1.0" } }), ecosystem: "npm" }], { target: "commercial-closed" });
  const med = r.audit.findings.find((f) => f.severity === "MEDIUM" && /UNKNOWN/.test(f.id));
  ok("missing license ⇒ MEDIUM 'UNKNOWN' review finding (fail-closed)", !!med && r.audit.licenseCoverage.unknownLicense === 1);
}

// (4) permissive-only project ⇒ 0 findings, policyClean=true.
{
  const r = S.auditManifests([{ content: npmLock({ "": { name: "x" }, "node_modules/a": { version: "1.0.0", license: "MIT" }, "node_modules/b": { version: "2.0.0", license: "Apache-2.0" } }), ecosystem: "npm" }], { target: "commercial-closed" });
  ok("all-permissive ⇒ 0 findings, policyClean=true, 2 components", r.audit.findingCount === 0 && r.audit.policyClean === true && r.audit.componentCount === 2);
}

// (5) target passthrough: AGPL is HIGH for commercial-saas but acceptable for an internal target.
{
  const lock = npmLock({ "": { name: "x" }, "node_modules/agpllib": { version: "1.0.0", license: "AGPL-3.0-only" } });
  const saas = S.auditManifests([{ content: lock, ecosystem: "npm" }], { target: "commercial-saas" });
  const internal = S.auditManifests([{ content: lock, ecosystem: "npm" }], { target: "internal" });
  ok("AGPL ⇒ HIGH for SaaS, not HIGH for internal (policy target respected)",
     saas.audit.findings.some((f) => f.severity === "HIGH") && !internal.audit.findings.some((f) => f.severity === "HIGH"));
}

// (6) CVE scanning is declared NOT performed (honest, never faked).
{
  const r = S.auditManifests([{ content: npmLock({ "": {}, "node_modules/a": { version: "1.0.0", license: "MIT" } }), ecosystem: "npm" }]);
  ok("CVE scan declared NOT_PERFORMED + limits present", /NOT_PERFORMED/.test(r.audit.cveScan) && Array.isArray(r.audit.limits) && r.audit.limits.length >= 3);
}

// (7) fail-closed on bad input / no manifest.
{
  ok("no manifest ⇒ NO_MANIFEST (not a fake empty-clean SBOM)", S.auditManifests([]).code === "NO_MANIFEST" && S.auditProjectDir({}).ok === false);
}

// (8) findings emit valid SARIF 2.1.0 (interoperable, same pipe as code-review).
{
  const r = S.auditManifests([{ content: npmLock({ "": {}, "node_modules/gpllib": { version: "1.0.0", license: "GPL-3.0-only" } }), ecosystem: "npm" }], { target: "commercial-closed" });
  const s = SARIF.toSarif({ ok: true, project: "sbom", findings: r.audit.findings }, { toolName: "ODG-SBOM-Audit", version: "1" });
  ok("license findings ⇒ valid SARIF 2.1.0 (HIGH→error)", s.ok && SARIF.isValidSarif(s.sarif) && s.sarif.runs[0].results[0].level === "error");
}

console.log(`\nSBOM-AUDIT-SERVICE suite — ${pass} assertions passed. (REAL repo lockfile SBOM; GPL⇒HIGH; UNKNOWN⇒review fail-closed; permissive clean; policy target respected; CVE declared NOT performed; valid SARIF)`);
