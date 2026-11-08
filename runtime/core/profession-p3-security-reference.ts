#!/usr/bin/env node
"use strict";

/*
 * V12.4 §43 P3 — CYBERSECURITY/DevSecOps reference project (E2 executed + E3 adversarial). PURE, deterministic. A
 * runnable security scan over a CLEARLY-LABELLED SYNTHETIC project: it checks dependency LICENSES (copyleft denied),
 * scans file contents for SECRETS, detects prompt/command INJECTION in inputs, flags UNPINNED dependencies, and checks
 * SBOM presence — composing the EXISTING guards (license-policy.classifyLicense, bash-command-governor.SECRET_PATTERNS,
 * frontier-radar.sanitizeExternal). It builds no second security engine and claims no real-world pentest (E5 owner-
 * gated). Levels: E2 (reference project scanned), E3 (adversarial: planted secret/GPL dep/injection detected). Dual export.
 */

const LP = require("./license-policy");
const BCG = require("./bash-command-governor");
const RADAR = require("./frontier-radar");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const DENIED_LICENSE = /GPL|AGPL|SSPL/i;

/** syntheticProject(opts) -> a clearly-labelled synthetic project: dependencies, files, inputs. */
function syntheticProject(over?: any): any {
  return Object.assign({
    synthetic: true,
    dependencies: [{ name: "left-pad", license: "MIT", version: "1.3.0" }, { name: "lodash", license: "MIT", version: "4.17.21" }],
    files: [{ path: "src/app.ts", content: "export const x = 1;" }],
    inputs: ["normal user input", "search query"],
    sbom: { present: true },
  }, over || {});
}

/** scanProject(project) -> findings + verdict. Fail-closed: any HIGH finding ⇒ not clean. */
function scanProject(project: any): any {
  const p = isObj(project) ? project : {};
  const licenseViolations: any[] = [];
  for (const d of arr(p.dependencies)) {
    if (!isObj(d)) continue;
    const lic = isStr(d.license) ? d.license : "UNKNOWN";
    // reuse license-policy classification; deny copyleft (and fail-closed on UNKNOWN).
    let verdict: any = null; try { verdict = LP.classifyLicense(lic); } catch { verdict = null; }
    const denied = DENIED_LICENSE.test(lic) || lic === "UNKNOWN" || (verdict && verdict.allowed === false);
    if (denied) licenseViolations.push({ name: d.name, license: lic, severity: lic === "UNKNOWN" ? "MEDIUM" : "HIGH" });
  }
  // secrets: reuse bash-command-governor SECRET_PATTERNS over file contents.
  const secretsFound: any[] = [];
  const patterns = arr(BCG.SECRET_PATTERNS);
  for (const f of arr(p.files)) {
    if (!isObj(f) || !isStr(f.content)) continue;
    if (patterns.some((re: any) => { try { return re.test(f.content); } catch { return false; } })) secretsFound.push({ path: f.path, severity: "HIGH" });
  }
  // injection: reuse frontier-radar.sanitizeExternal on each input.
  const injectionVulns: any[] = [];
  for (let i = 0; i < arr(p.inputs).length; i++) {
    const inp = p.inputs[i];
    const meta = RADAR.sanitizeExternal({ title: isStr(inp) ? inp : "", body: "" });
    if (meta.untrusted === true) injectionVulns.push({ index: i, severity: "HIGH" });
  }
  // unpinned deps.
  const unpinnedDeps = arr(p.dependencies).filter((d: any) => isObj(d) && !isStr(d.version)).map((d: any) => d.name);
  const sbomPresent = isObj(p.sbom) && p.sbom.present === true;

  const highs = licenseViolations.filter((v: any) => v.severity === "HIGH").length + secretsFound.length + injectionVulns.length + (sbomPresent ? 0 : 1);
  const findings = { licenseViolations, secretsFound, injectionVulns, unpinnedDeps, sbomPresent };
  const clean = highs === 0 && licenseViolations.length === 0 && unpinnedDeps.length === 0;
  return Object.freeze({
    synthetic: true, profession: "P3",
    findings: Object.freeze(findings), clean, severity: highs > 0 ? "HIGH" : (licenseViolations.length || unpinnedDeps.length ? "MEDIUM" : "NONE"),
    level: "E2", adversarialDetected: highs > 0,
    note: "SYNTHETIC project (not a real system, not E5); composes license-policy + secret-patterns + injection-sanitize; real pentest (E5) is owner-gated NOT_RUN",
  });
}

const P3_SECURITY_REFERENCE_CONTRACT = Object.freeze({
  id: "V124-P3-SECURITY-REFERENCE",
  source: "V12.4 §43 P3 (Cybersecurity/DevSecOps) — E2 reference scan + E3 adversarial",
  levels: Object.freeze(["E0", "E1", "E2", "E3", "E4(owner/independent)", "E5(owner-gated NOT_RUN)"]),
  reuses: Object.freeze(["license-policy.classifyLicense", "bash-command-governor.SECRET_PATTERNS", "frontier-radar.sanitizeExternal"]),
  notAuthority: "a runnable security scan over a SYNTHETIC project; it builds no second security engine and claims no real pentest (E5)",
  invariants: Object.freeze([
    "SYNTHETIC project only; E5 real pentest stays owner-gated NOT_RUN (no inflated level)",
    "copyleft (GPL/AGPL/SSPL) + UNKNOWN licenses flagged; secrets + injection + unpinned deps detected; SBOM checked",
    "composes existing guards (license-policy / secret-patterns / injection-sanitize); no duplication",
    "fail-closed: any HIGH finding ⇒ not clean; adversarial planted hazards are detected (E3)",
  ]),
});

module.exports = { syntheticProject, scanProject, P3_SECURITY_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P3_SECURITY_REFERENCE_CONTRACT, demo: scanProject(syntheticProject()) }, null, 2) + "\n"); }

export {};
