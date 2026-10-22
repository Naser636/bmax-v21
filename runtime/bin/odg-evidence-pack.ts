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

// Discover supported manifests in a directory. Deterministic; fail-closed. Returns detected sources + warnings.
// Policy: absent manifest ⇒ not detected (not a warning). Present-but-unreadable ⇒ warning + excluded (never
// silently dropped). Parse-time emptiness/malformation is flagged later in buildEvidencePackMulti.
function detectManifestSources(dir: any): any {
  const sources: any[] = []; const detected: any[] = []; const warnings: string[] = [];
  if (!dir || typeof dir !== "string") return { sources, detected, warnings: ["detectManifestSources: invalid directory"] };
  for (const m of MANIFESTS) {
    const p = path.join(dir, m.file);
    let st: any;
    try { st = fs.statSync(p); } catch { continue; } // absent ⇒ simply not present
    if (!st.isFile()) continue;
    let content: string;
    try { content = fs.readFileSync(p, "utf8"); }
    catch (e: any) { warnings.push(`cannot read manifest ${m.file} (${m.ecosystem}): ${(e && e.message) || e}`); continue; }
    sources.push({ content, ecosystem: m.ecosystem, manifest: m.file });
    detected.push({ ecosystem: m.ecosystem, manifest: m.file });
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
  // Licence risk: analyzable only from an npm package-lock (licence metadata is not in pypi/cargo/go manifests).
  let risk: any; let licenceNote: string | null = null; const analyzedEcosystems: string[] = [];
  const npmSrc = sources.find((s: any) => s && s.ecosystem === "npm" && typeof s.content === "string");
  if (npmSrc) {
    let pkgs: any = {}; try { pkgs = (JSON.parse(npmSrc.content).packages) || {}; } catch { pkgs = {}; }
    risk = licenceRisk(pkgs); analyzedEcosystems.push("npm");
  } else {
    risk = { licensed: 0, unknownCount: 0, unknown: [], copyleftCount: 0, copyleft: [] };
    licenceNote = "no npm lockfile detected ⇒ licence risk NOT analyzed (licence metadata is absent from pypi/cargo/go manifests in this pack)";
  }
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
module.exports = { buildEvidencePack, buildEvidencePackMulti, buildEvidencePackFromDir, detectManifestSources, writePack, licenceRisk, verifyArtifactIntegrity, LIMITS, MANIFESTS };

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
