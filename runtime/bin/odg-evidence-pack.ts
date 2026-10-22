#!/usr/bin/env node
/*
 * ODG EVIDENCE PACK (R9-lite) — the smallest deliverable productization of the PROVEN R2 evidence engine.
 *
 * NOT a new primitive and NOT a second orchestrator: it is a thin, explainable CLI/library that composes the
 * EXISTING `supply-chain-attest` engine (buildSbom/buildAttestation/signStatement/verifyStatement) into one
 * reproducible, fail-closed, client-deliverable pack from a single npm lockfile `packages` map:
 *   - SBOM (CycloneDX) with component reconciliation (components == packages-with-version; no false/dropped),
 *   - in-toto/SLSA-L1 provenance (ed25519 self-signed; L2 honestly declared BLOCKED), verify + tamper-check,
 *   - licence/dependency-risk register (copyleft + unknown surfaced; never a false "all clear"),
 *   - a report with provenance, artifact sha256 digests, explicit LIMITS and liability EXCLUSIONS,
 *   - deterministic / reproducible output (stable SBOM digest).
 *
 * Fail-closed / no false success: an invalid/missing lockfile ⇒ throws (CLI exit 1). An EMPTY lockfile ⇒ an
 * honest 0-component pack flagged `empty:true` (never silently "complete"). Offline, no network, no secrets.
 * Readiness/evidence only — NOT a certification, compliance attestation, or security guarantee.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ROOT: string = process.cwd();
const sc = require(path.join(ROOT, "runtime", "core", "supply-chain-attest.js"));

const LIMITS = [
  "Evidence/readiness only — NOT a certification, regulatory-compliance attestation, or security guarantee.",
  "SLSA L1 + mechanism only (self-signed); L2 BLOCKED (no managed/keyless signing).",
  "Derived from the provided lockfile; npm ecosystem; no source-code/vuln/CVE analysis in this pack.",
  "A public-OSS or synthetic input is technical evidence, NOT a client validation (R4).",
];

function licenceRisk(lockPackages: any): any {
  const COPYLEFT = /GPL|AGPL|LGPL/i;
  const copyleft: string[] = []; const unknown: string[] = []; let licensed = 0;
  for (const k of Object.keys(lockPackages || {})) {
    const p = lockPackages[k];
    if (!k || !p || !p.version) continue;
    const name = k.replace(/^.*node_modules\//, "") || "(root)";
    const lic = p.license;
    if (!lic) unknown.push(name);
    else { licensed++; if (COPYLEFT.test(typeof lic === "string" ? lic : JSON.stringify(lic))) copyleft.push(name); }
  }
  return { licensed, unknownCount: unknown.length, unknown, copyleftCount: copyleft.length, copyleft: [...new Set(copyleft)] };
}

// Licence risk from a composer.lock (JSON): packages + packages-dev each carry a per-package `license`
// (SPDX string or array). Same risk shape as licenceRisk. Pure + fail-closed (malformed ⇒ zero risk, no throw).
function licenceRiskComposer(content: any): any {
  const COPYLEFT = /GPL|AGPL|LGPL/i;
  const copyleft: string[] = []; const unknown: string[] = []; let licensed = 0;
  let j: any; try { j = JSON.parse(content); } catch { return { licensed: 0, unknownCount: 0, unknown: [], copyleftCount: 0, copyleft: [] }; }
  for (const arr of [j && j.packages, j && j["packages-dev"]]) {
    if (!Array.isArray(arr)) continue;
    for (const p of arr) {
      if (!p || !p.name || !p.version) continue;
      const lic = p.license;
      const licStr = Array.isArray(lic) ? lic.join(" ") : (typeof lic === "string" ? lic : "");
      if (!licStr) unknown.push(p.name);
      else { licensed++; if (COPYLEFT.test(licStr)) copyleft.push(p.name); }
    }
  }
  return { licensed, unknownCount: unknown.length, unknown, copyleftCount: copyleft.length, copyleft: [...new Set(copyleft)] };
}

// Pure-ish builder: returns the pack. `opts.privateKey/publicKey` injectable (deterministic tests); else ephemeral.
function buildEvidencePack(lockPackages: any, opts?: any): any {
  const o = opts || {};
  if (!lockPackages || typeof lockPackages !== "object") throw new Error("odg-evidence-pack: invalid lockfile packages map");
  const meta = { name: o.name || "subject", version: o.version || "0.0.0" };
  const withVersion = Object.keys(lockPackages).filter((k) => k && lockPackages[k] && lockPackages[k].version).length;
  const sbom = sc.buildSbom(lockPackages, meta);
  const reconciles = sbom.components.length === withVersion; // fail-closed: must reconcile
  const sbomDigest = sc.sha256(sc.canon(sbom));
  const risk = licenceRisk(lockPackages);
  const { publicKey, privateKey } = (o.publicKey && o.privateKey)
    ? { publicKey: o.publicKey, privateKey: o.privateKey }
    : crypto.generateKeyPairSync("ed25519");
  const artifact = { name: meta.name + " lockfile", sha256: o.artifactBytes != null ? sc.sha256(o.artifactBytes) : sbomDigest };
  const attestation = sc.buildAttestation(artifact, sbom, { commit: o.sourceCommit || null, builderId: "odg-evidence-pack" });
  const envelope = sc.signStatement(attestation, privateKey);
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const selfVerify = sc.verifyStatement(attestation, envelope, publicKey, { sbom });
  const empty = sbom.components.length === 0;
  const summary = {
    mission: o.name || "subject", components: sbom.components.length, reconciles, sbomDigest,
    licence: { licensed: risk.licensed, unknown: risk.unknownCount, copyleft: risk.copyleftCount },
    provenanceVerified: selfVerify.ok === true, slsa: attestation.predicate.slsaLevelClaim,
    empty, ok: reconciles && selfVerify.ok === true,
  };
  return { sbom, attestation, envelope, publicKeyPem, licenceRisk: risk, summary, limits: LIMITS, exclusions: ["no certification", "no compliance guarantee", "no security audit", "no SLSA L2"] };
}

// --- POLYGLOT auto-detection (CTO POLYGLOT SBOM AUTO-DETECTION V1) ---------------------------------------
// Deterministic manifest discovery for the ecosystems the canonical engine already parses. Fixed order +
// fixed canonical lockfile names ⇒ reproducible. Reuses sc.buildSbomMulti/componentsFromManifest; NO new engine.
const MANIFESTS: Array<{ ecosystem: string; file: string }> = [
  { ecosystem: "npm", file: "package-lock.json" },
  { ecosystem: "pnpm", file: "pnpm-lock.yaml" },
  { ecosystem: "yarn", file: "yarn.lock" },
  { ecosystem: "pypi", file: "requirements.txt" },
  { ecosystem: "cargo", file: "Cargo.lock" },
  { ecosystem: "golang", file: "go.mod" },
  { ecosystem: "gem", file: "Gemfile.lock" },
  { ecosystem: "composer", file: "composer.lock" },
];

// Directories never walked: dependency trees (whose own lockfiles must NOT be ingested), VCS and build output.
const SKIP_DIRS = new Set(["node_modules", ".git", "vendor", "dist", "build", "target", ".next", "__pycache__", "venv", ".venv", ".tox", "coverage", ".cache", ".pnpm-store", "bower_components"]);
const MAX_DEPTH = 8; // bounded: cycle/runaway safe

// Walk `dir` (bounded depth, skip-list) and collect repo-relative paths of every file whose basename is a known
// manifest. Returns a map basename ⇒ sorted relative paths. Deterministic. Fail-closed (unreadable dir ⇒ skipped).
function walkManifests(dir: string): { byName: Record<string, string[]>; warnings: string[] } {
  const wanted = new Set(MANIFESTS.map((m) => m.file));
  const byName: Record<string, string[]> = {}; const warnings: string[] = [];
  const visit = (abs: string, rel: string, depth: number): void => {
    let entries: any[];
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); }
    catch (e: any) { warnings.push(`cannot read directory ${rel || "."}: ${(e && e.message) || e}`); return; }
    for (const ent of entries) {
      const name = ent.name;
      const childRel = rel ? `${rel}/${name}` : name;
      if (ent.isDirectory()) { if (depth < MAX_DEPTH && !SKIP_DIRS.has(name) && !name.startsWith(".git")) visit(path.join(abs, name), childRel, depth + 1); }
      else if (ent.isFile() && wanted.has(name)) { (byName[name] = byName[name] || []).push(childRel); }
    }
  };
  visit(dir, "", 0);
  for (const k of Object.keys(byName)) byName[k].sort(); // POSIX-relative lexicographic ⇒ deterministic
  return { byName, warnings };
}

// Discover supported manifests in a repository (RECURSIVE, monorepo-aware). Deterministic; fail-closed. Sources
// are ordered by ecosystem (MANIFESTS order) then relative path — so a ROOT-ONLY repo yields the identical result
// as the previous root-only implementation. Dependency/VCS/build dirs are skipped ⇒ a dependency's own lockfile is
// never ingested. Policy: absent ⇒ not detected; present-but-unreadable ⇒ warning + excluded (never silent drop).
function detectManifestSources(dir: any): any {
  const sources: any[] = []; const detected: any[] = []; const warnings: string[] = [];
  if (!dir || typeof dir !== "string") return { sources, detected, warnings: ["detectManifestSources: invalid directory"] };
  const { byName, warnings: walkWarn } = walkManifests(dir);
  warnings.push(...walkWarn);
  for (const m of MANIFESTS) {
    for (const rel of (byName[m.file] || [])) {
      let content: string;
      try { content = fs.readFileSync(path.join(dir, rel), "utf8"); }
      catch (e: any) { warnings.push(`cannot read manifest ${rel} (${m.ecosystem}): ${(e && e.message) || e}`); continue; }
      sources.push({ content, ecosystem: m.ecosystem, manifest: rel });
      detected.push({ ecosystem: m.ecosystem, manifest: rel });
    }
  }
  return { sources, detected, warnings };
}

// Build a deliverable pack from MULTIPLE ecosystem sources in ONE pass, reusing the engine's buildSbomMulti and
// the SAME attestation/sign/verify + licence writers. Licence risk is npm-lockfile-only (honestly declared for
// the others). Fail-closed; never presents a partial SBOM as exhaustive (warnings are surfaced + flagged).
function buildEvidencePackMulti(sources: any, opts?: any): any {
  const o = opts || {};
  if (!Array.isArray(sources)) throw new Error("odg-evidence-pack: sources must be an array of {content, ecosystem}");
  const meta = { name: o.name || "subject", version: o.version || "0.0.0" };
  const warnings: string[] = Array.isArray(o.detectedWarnings) ? [...o.detectedWarnings] : [];
  // Per-ecosystem parse (reuses the proven engine). Flag any present manifest that parses to 0 components.
  const perEcosystem: any[] = [];
  let componentsParsed = 0;
  for (const s of sources) {
    const comps = sc.componentsFromManifest(s && s.content, s && s.ecosystem);
    componentsParsed += comps.length;
    perEcosystem.push({ ecosystem: s && s.ecosystem, manifest: (s && s.manifest) || null, components: comps.length });
    const nonEmpty = typeof (s && s.content) === "string" && s.content.trim() !== "";
    if (comps.length === 0 && nonEmpty) warnings.push(`manifest ${(s && s.manifest) || s.ecosystem} (${s && s.ecosystem}) parsed to 0 components (empty or malformed) — excluded from SBOM, NOT silently completed`);
  }
  const sbom = sc.buildSbomMulti(sources, meta); // deduped union across ecosystems
  const uniqueParsedPurls = new Set<string>();
  for (const s of sources) for (const c of sc.componentsFromManifest(s && s.content, s && s.ecosystem)) uniqueParsedPurls.add(c.purl);
  const reconciles = sbom.components.length === uniqueParsedPurls.size; // coherent union; no false/dropped component
  const duplicatesRemoved = componentsParsed - sbom.components.length;
  const sbomDigest = sc.sha256(sc.canon(sbom));
  // Licence risk: extracted from the manifests that actually CARRY per-package licence metadata — npm
  // package-lock (`license`) and composer.lock (`license` SPDX). pypi/cargo/go/pnpm/yarn/gem lockfiles do
  // not carry a standard licence field here ⇒ honestly reported as not-analyzed (never a false all-clear).
  const LICENCE_ANALYZABLE = ["npm", "composer"];
  const emptyRisk = () => ({ licensed: 0, unknownCount: 0, unknown: [] as string[], copyleftCount: 0, copyleft: [] as string[] });
  const mergeRisk = (a: any, b: any) => { const copyleft = [...new Set([...a.copyleft, ...b.copyleft])]; const unknown = [...new Set([...a.unknown, ...b.unknown])]; return { licensed: a.licensed + b.licensed, unknownCount: unknown.length, unknown, copyleftCount: copyleft.length, copyleft }; };
  let risk: any = emptyRisk(); let licenceNote: string | null = null; const analyzedEcosystems: string[] = [];
  // Iterate ALL npm + composer sources (monorepo-safe — the recursive detector can yield several).
  for (const s of sources.filter((s: any) => s && s.ecosystem === "npm" && typeof s.content === "string")) {
    let pkgs: any = {}; try { pkgs = (JSON.parse(s.content).packages) || {}; } catch { pkgs = {}; }
    risk = mergeRisk(risk, licenceRisk(pkgs));
  }
  if (sources.some((s: any) => s && s.ecosystem === "npm")) analyzedEcosystems.push("npm");
  for (const s of sources.filter((s: any) => s && s.ecosystem === "composer" && typeof s.content === "string")) {
    risk = mergeRisk(risk, licenceRiskComposer(s.content));
  }
  if (sources.some((s: any) => s && s.ecosystem === "composer")) analyzedEcosystems.push("composer");
  const unanalyzed = [...new Set(sources.map((s: any) => s && s.ecosystem).filter((e: any) => e && !LICENCE_ANALYZABLE.includes(e)))];
  if (analyzedEcosystems.length === 0) licenceNote = `no npm lockfile or composer.lock detected ⇒ licence risk NOT analyzed${unanalyzed.length ? ` (present ecosystems carry no licence metadata here: ${unanalyzed.join(", ")})` : ""}`;
  else if (unanalyzed.length) licenceNote = `licence analyzed for ${analyzedEcosystems.join(", ")}; NOT analyzed for ${unanalyzed.join(", ")} (their lockfiles carry no licence metadata here)`;
  const { publicKey, privateKey } = (o.publicKey && o.privateKey)
    ? { publicKey: o.publicKey, privateKey: o.privateKey }
    : crypto.generateKeyPairSync("ed25519");
  const artifact = { name: meta.name + " manifests", sha256: sbomDigest };
  const attestation = sc.buildAttestation(artifact, sbom, { commit: o.sourceCommit || null, builderId: "odg-evidence-pack" });
  const envelope = sc.signStatement(attestation, privateKey);
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const selfVerify = sc.verifyStatement(attestation, envelope, publicKey, { sbom });
  const empty = sbom.components.length === 0;
  const summary = {
    mission: meta.name, components: sbom.components.length, reconciles, sbomDigest,
    ecosystems: sbom.metadata.ecosystems, perEcosystem, componentsParsed, duplicatesRemoved,
    licence: { licensed: risk.licensed, unknown: risk.unknownCount, copyleft: risk.copyleftCount, analyzedEcosystems, note: licenceNote },
    provenanceVerified: selfVerify.ok === true, slsa: attestation.predicate.slsaLevelClaim,
    empty, exhaustive: warnings.length === 0, warnings,
    ok: reconciles && selfVerify.ok === true,
  };
  return { sbom, attestation, envelope, publicKeyPem, licenceRisk: risk, summary, limits: LIMITS, exclusions: ["no certification", "no compliance guarantee", "no security audit", "no SLSA L2"], detected: o.detected || perEcosystem, warnings };
}

// Single normal run over a repository directory: detect supported manifests ⇒ ONE coherent multi-ecosystem pack.
function buildEvidencePackFromDir(dir: any, opts?: any): any {
  const o = opts || {};
  const det = detectManifestSources(dir);
  const name = o.name || (typeof dir === "string" ? path.basename(path.resolve(dir)) : "subject");
  return buildEvidencePackMulti(det.sources, { ...o, name, detected: det.detected, detectedWarnings: det.warnings });
}

function writePack(pack: any, outDir: string): any {
  fs.mkdirSync(outDir, { recursive: true });
  const w = (n: string, obj: any) => { const p = path.join(outDir, n); fs.writeFileSync(p, typeof obj === "string" ? obj : JSON.stringify(obj, null, 2)); return { file: n, sha256: sc.sha256(fs.readFileSync(p)) }; };
  const files = [
    w("sbom.cdx.json", pack.sbom),
    w("attestation.intoto.json", { statement: pack.attestation, envelope: pack.envelope, publicKeyPem: pack.publicKeyPem }),
    w("licence-risk.json", pack.licenceRisk),
    w("summary.json", pack.summary),
  ];
  const multi = Array.isArray(pack.summary.ecosystems); // polyglot pack carries ecosystems metadata
  const reconcileLabel = multi ? "coherent union of parsed manifest components, deduped by purl" : "packages-with-version";
  const ecoSection = multi
    ? [
        ``, `## Ecosystems covered (auto-detected, single run)`,
        `- Detected: ${pack.summary.ecosystems.join(", ") || "(none)"}`,
        ...pack.summary.perEcosystem.map((e: any) => `- ${e.ecosystem} (${e.manifest || "?"}): ${e.components} component(s)`),
        `- Parsed total ${pack.summary.componentsParsed}; deduped to ${pack.summary.components} (duplicates removed: ${pack.summary.duplicatesRemoved}).`,
        pack.summary.licence.note ? `- Licence note: ${pack.summary.licence.note}` : `- Licence analyzed for: ${pack.summary.licence.analyzedEcosystems.join(", ")}`,
        `- Coverage exhaustive (no skipped/malformed manifest): ${pack.summary.exhaustive}`,
        ...(pack.summary.warnings && pack.summary.warnings.length ? [``, `### WARNINGS (partial coverage — NOT silently completed)`, ...pack.summary.warnings.map((wn: string) => `- ${wn}`)] : []),
      ]
    : [];
  const report = [
    `# Software Evidence Pack — ${pack.summary.mission}`,
    ``, `Generated by ODG evidence-pack (R9-lite), composing the supply-chain-attest engine. Offline, reproducible.`,
    ``, `## Summary`,
    `- SBOM components: ${pack.summary.components} (reconciles to ${reconcileLabel}: ${pack.summary.reconciles})`,
    `- SBOM digest (sha256): ${pack.summary.sbomDigest}`,
    `- Provenance (in-toto/SLSA): verified=${pack.summary.provenanceVerified}; ${pack.summary.slsa}`,
    `- Licence risk: licensed=${pack.summary.licence.licensed}, unknown=${pack.summary.licence.unknown}, copyleft=${pack.summary.licence.copyleft}`,
    pack.summary.empty ? `- WARNING: empty input ⇒ 0-component pack (honest empty; NOT a completed assessment).` : ``,
    ...ecoSection,
    ``, `## Limits (explicit)`, ...pack.limits.map((l: string) => `- ${l}`),
    ``, `## Liability exclusions`, ...pack.exclusions.map((e: string) => `- ${e}`),
    ``, `_This pack is evidence/readiness input for independent (R3) review; it is not a client reference (R4) unless delivered to and accepted by a consenting client._`,
  ].join("\n");
  files.push(w("report.md", report));
  return files;
}

// Verify a release ARTIFACT's bytes against a PUBLISHED integrity hash (e.g. npm `dist.integrity` SRI
// "sha512-<base64>" or the legacy `dist.shasum` sha1 hex). Pure + fail-closed: an unrecognised format or a
// mismatch ⇒ ok:false (no false success). Implements the "cryptographic verification of release artifacts"
// supply-chain criterion against the registry's own published provenance — reusing node crypto only.
function verifyArtifactIntegrity(bytes: any, integrity: any): any {
  if (bytes == null || typeof integrity !== "string" || !integrity) return { ok: false, reason: "missing bytes or integrity" };
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  let algorithm: string; let expected: string; let enc: "base64" | "hex";
  const dash = integrity.indexOf("-");
  if (dash > 0 && /^(sha256|sha384|sha512)-/.test(integrity)) { algorithm = integrity.slice(0, dash); expected = integrity.slice(dash + 1); enc = "base64"; }
  else if (/^[0-9a-f]{40}$/i.test(integrity)) { algorithm = "sha1"; expected = integrity.toLowerCase(); enc = "hex"; } // npm legacy shasum
  else return { ok: false, reason: "unrecognised integrity format (expected SRI 'algo-base64' or sha1 hex)" };
  const actual = crypto.createHash(algorithm).update(buf).digest(enc);
  const ok = enc === "base64" ? actual === expected : actual.toLowerCase() === expected;
  return { ok, algorithm, expected, actual, reason: ok ? "artifact integrity verified against published hash" : "integrity mismatch (artifact differs from published hash — tampered or wrong artifact)" };
}

export {};
module.exports = { buildEvidencePack, buildEvidencePackMulti, buildEvidencePackFromDir, detectManifestSources, writePack, licenceRisk, licenceRiskComposer, verifyArtifactIntegrity, LIMITS, MANIFESTS };

// CLI: node odg-evidence-pack.js <lockfile.json | repoDir> [outDir] [--name <app>]
//   - a .json npm lockfile  ⇒ existing npm pack (UNCHANGED, backward compatible)
//   - a DIRECTORY           ⇒ polyglot: auto-detect npm/pypi/cargo/golang manifests ⇒ ONE coherent SBOM
if (require.main === module) {
  const args = process.argv.slice(2);
  const inPath = args[0];
  const outDir = args[1] && !args[1].startsWith("--") ? args[1] : path.join(ROOT, "runtime", "generated", "evidence-pack");
  const nameIdx = args.indexOf("--name");
  const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined;
  if (!inPath) { console.error("usage: odg-evidence-pack <lockfile.json | repoDir> [outDir] [--name <app>]"); process.exit(2); }
  let stat: any;
  try { stat = fs.statSync(inPath); }
  catch (e: any) { console.error("odg-evidence-pack: cannot stat input:", (e && e.message) || e); process.exit(1); }
  try {
    let pack: any;
    if (stat.isDirectory()) {
      pack = buildEvidencePackFromDir(inPath, { name });
      const det = pack.summary.ecosystems.join(",") || "(none)";
      console.log(`[odg-evidence-pack:polyglot] ${pack.summary.ok ? "OK" : "FLAGGED"} — ecosystems=[${det}] components=${pack.summary.components} reconciles=${pack.summary.reconciles} exhaustive=${pack.summary.exhaustive} provenance=${pack.summary.provenanceVerified}`);
      if (pack.summary.warnings && pack.summary.warnings.length) for (const wn of pack.summary.warnings) console.log(`  WARNING: ${wn}`);
    } else {
      const lock = JSON.parse(fs.readFileSync(inPath, "utf8"));
      const bytes = fs.readFileSync(inPath);
      pack = buildEvidencePack(lock.packages || {}, { name: name || lock.name, version: lock.version, artifactBytes: bytes });
      console.log(`[odg-evidence-pack] ${pack.summary.ok ? "OK" : "FLAGGED"} — components=${pack.summary.components} reconciles=${pack.summary.reconciles} provenance=${pack.summary.provenanceVerified} licence(unknown=${pack.summary.licence.unknown},copyleft=${pack.summary.licence.copyleft})`);
    }
    const files = writePack(pack, outDir);
    console.log(`  pack → ${outDir} (${files.map((f: any) => f.file).join(", ")})`);
    process.exit(pack.summary.ok ? 0 : 1);
  } catch (e: any) { console.error("odg-evidence-pack: FAILED —", (e && e.message) || e); process.exit(1); }
}
