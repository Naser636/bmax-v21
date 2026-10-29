#!/usr/bin/env node
/**
 * sbom-audit-service — the Cyber/Supply-chain (#2/#22) business capability: point it at a REAL project and it reads
 * the REAL dependency manifests, builds a CycloneDX SBOM, and audits each component's LICENSE against an adoption
 * policy — producing severity-ranked findings (same shape as code-review ⇒ SARIF-emittable). The inventory found
 * supply-chain-attest was tested only with an INJECTED lockfile and no service ran it over a real project; this
 * closes that gap by operating on real manifest files (e.g. this repo's own package-lock.json).
 *
 * Composition only (no new primitive): supply-chain-attest.buildSbomMulti + license-policy.classifyLicense/
 * adoptionVerdict. Pure core (auditManifests) + a thin fs reader (auditProjectDir).
 *
 * Honesty / fail-closed (deny-by-default):
 *   - a component whose license cannot be determined is UNKNOWN ⇒ flagged for manual review, NEVER assumed safe.
 *   - CVE/vulnerability scanning is NOT performed (no offline vuln feed) — it is DECLARED not performed, never faked.
 *   - a project with no recognised manifest ⇒ NO_MANIFEST (honest), not an empty "clean" SBOM.
 *   - the SBOM/license audit is informational supply-chain assurance, NOT a legal clearance or certification.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const SA = require("./supply-chain-attest.js");
const LP = require("./license-policy.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// Manifest files → ecosystem (the authoritative component lists; lockfiles preferred over loose manifests).
const MANIFESTS: ReadonlyArray<{ file: string; ecosystem: string }> = Object.freeze([
  { file: "package-lock.json", ecosystem: "npm" },
  { file: "pnpm-lock.yaml", ecosystem: "pnpm" },
  { file: "yarn.lock", ecosystem: "yarn" },
  { file: "requirements.txt", ecosystem: "pypi" },
  { file: "Cargo.lock", ecosystem: "cargo" },
  { file: "go.sum", ecosystem: "golang" },
  { file: "Gemfile.lock", ecosystem: "gem" },
  { file: "composer.lock", ecosystem: "composer" },
]);

const LIMITS = Object.freeze([
  "a license audit is informational supply-chain assurance, NOT a legal clearance or certification",
  "CVE/vulnerability scanning is NOT performed (no offline vulnerability feed) — declared, never faked",
  "a license is read only where the manifest records it (npm lockfiles); otherwise it is UNKNOWN, never assumed safe",
  "SBOM completeness depends on the manifest; dependencies absent from the manifest are not represented",
]);

/** extractNpmLicenses(lockContent): Map name → license string from a package-lock.json `packages` section. */
function extractNpmLicenses(lockContent: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const j = JSON.parse(lockContent);
    const pk = j.packages || {};
    for (const k of Object.keys(pk)) {
      const info = pk[k] || {};
      const name = k.replace(/^.*node_modules\//, "");
      if (!name) continue;
      let lic = info.license;
      if (!lic && Array.isArray(info.licenses)) lic = info.licenses.map((l: any) => (l && l.type) || l).filter(Boolean).join(" OR ");
      if (typeof lic === "string" && lic) out[name] = lic;
    }
  } catch { /* malformed ⇒ no licenses */ }
  return out;
}

/**
 * auditManifests(sources, opts?): PURE — sources = [{content, ecosystem}]. Builds the SBOM and audits licenses.
 * opts = { target?, name?, licenseByName? }. Returns { ok, sbom, audit } or { ok:false, code } if no components.
 */
function auditManifests(sources: any, opts: any = {}): any {
  if (!Array.isArray(sources) || sources.length === 0) return { ok: false, code: "NO_MANIFEST", reason: "no dependency manifest provided" };
  const target = typeof opts.target === "string" ? opts.target : "commercial-closed";
  const sbom = SA.buildSbomMulti(sources, { name: opts.name || "target" });
  if (!sbom.components || sbom.components.length === 0) return { ok: false, code: "NO_COMPONENTS", reason: "manifests parsed but no components found" };

  // license map: explicit injection wins; else aggregate npm-lockfile licenses from the sources.
  const licenseByName: Record<string, string> = isObj(opts.licenseByName) ? { ...opts.licenseByName } : {};
  if (!isObj(opts.licenseByName)) for (const s of sources) if (s && String(s.ecosystem).toLowerCase() === "npm" && typeof s.content === "string") Object.assign(licenseByName, extractNpmLicenses(s.content));

  const findingsByLicense: Record<string, any> = {};
  const byFamily: Record<string, number> = {};
  let withLicense = 0, unknownLicense = 0;
  for (const c of sbom.components) {
    const lic = licenseByName[c.name];
    const verdict = LP.adoptionVerdict(lic || "", { target });
    const fam = verdict.license.family;
    byFamily[fam] = (byFamily[fam] || 0) + 1;
    if (lic) withLicense++; else unknownLicense++;
    // adoptable: true ⇒ fine; false ⇒ HIGH (policy violation); null ⇒ MEDIUM (unknown/conditional ⇒ manual review).
    if (verdict.adoptable === true) continue;
    const sev = verdict.adoptable === false ? "HIGH" : "MEDIUM";
    const key = `${sev}:${lic || "UNKNOWN"}`;
    if (!findingsByLicense[key]) findingsByLicense[key] = { severity: sev, license: lic || "UNKNOWN", family: fam, reason: verdict.reason, components: [] };
    findingsByLicense[key].components.push(`${c.name}@${c.version}`);
  }

  const findings = Object.values(findingsByLicense).map((g: any) => ({
    id: `license:${g.license}`, area: "license", severity: g.severity,
    detail: `${g.components.length} component(s) under '${g.license}' (${g.family}) — ${g.reason} [target=${target}]`,
    remediation: g.severity === "HIGH" ? "replace/remove the component or obtain a commercial license; do not ship under this license for the target" : "verify the license manually before adoption (unknown or conditional)",
    evidence: `components: ${g.components.slice(0, 20).join(", ")}${g.components.length > 20 ? ` (+${g.components.length - 20} more)` : ""}`,
  })).sort((a: any, b: any) => (a.severity === b.severity ? 0 : a.severity === "HIGH" ? -1 : 1));

  return {
    ok: true,
    sbom,
    audit: {
      target,
      componentCount: sbom.components.length,
      ecosystems: (sbom.metadata && sbom.metadata.ecosystems) || [],
      licenseCoverage: { withLicense, unknownLicense },
      byFamily,
      findings,
      findingCount: findings.length,
      policyClean: findings.filter((f: any) => f.severity === "HIGH").length === 0,
      cveScan: "NOT_PERFORMED (no offline vulnerability feed; license audit only)",
      limits: LIMITS,
      note: "CycloneDX SBOM + license-policy audit over REAL manifests. UNKNOWN licenses are flagged for manual review (fail-closed), never assumed safe. CVE scanning NOT performed. Informational supply-chain assurance, NOT a legal clearance/certification.",
    },
  };
}

/** auditProjectDir({projectDir, target?}): read the real manifests present under projectDir and audit them. */
function auditProjectDir(input: any): any {
  if (!isObj(input) || typeof input.projectDir !== "string") return { ok: false, code: "INVALID_INPUT", reason: "input { projectDir, target? } required" };
  let stat: any;
  try { stat = fs.statSync(input.projectDir); } catch { return { ok: false, code: "NO_DIR", reason: `cannot stat '${input.projectDir}'` }; }
  if (!stat.isDirectory()) return { ok: false, code: "NO_DIR", reason: `'${input.projectDir}' is not a directory` };
  const sources: any[] = [];
  for (const m of MANIFESTS) {
    const p = path.join(input.projectDir, m.file);
    try { const st = fs.statSync(p); if (st.isFile() && st.size <= 32 * 1024 * 1024) sources.push({ content: fs.readFileSync(p, "utf8"), ecosystem: m.ecosystem, file: m.file }); } catch { /* absent ⇒ skip */ }
  }
  if (sources.length === 0) return { ok: false, code: "NO_MANIFEST", reason: "no recognised dependency manifest found (package-lock.json, requirements.txt, Cargo.lock, go.sum, …)" };
  const r = auditManifests(sources, { target: input.target, name: path.basename(path.resolve(input.projectDir)) });
  if (r.ok) r.audit.manifests = sources.map((s) => s.file);
  return r;
}

export { MANIFESTS, LIMITS, extractNpmLicenses, auditManifests, auditProjectDir };
module.exports = { MANIFESTS, LIMITS, extractNpmLicenses, auditManifests, auditProjectDir };

if (require.main === module) {
  const dir = process.argv[2] || process.cwd();
  const r = auditProjectDir({ projectDir: dir, target: process.argv[3] });
  if (!r.ok) { process.stdout.write(JSON.stringify(r, null, 2) + "\n"); process.exit(2); }
  process.stdout.write(JSON.stringify({ ok: true, componentCount: r.audit.componentCount, ecosystems: r.audit.ecosystems, byFamily: r.audit.byFamily, findingCount: r.audit.findingCount, policyClean: r.audit.policyClean, cveScan: r.audit.cveScan }, null, 2) + "\n");
}
