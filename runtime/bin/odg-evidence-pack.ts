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

function writePack(pack: any, outDir: string): any {
  fs.mkdirSync(outDir, { recursive: true });
  const w = (n: string, obj: any) => { const p = path.join(outDir, n); fs.writeFileSync(p, typeof obj === "string" ? obj : JSON.stringify(obj, null, 2)); return { file: n, sha256: sc.sha256(fs.readFileSync(p)) }; };
  const files = [
    w("sbom.cdx.json", pack.sbom),
    w("attestation.intoto.json", { statement: pack.attestation, envelope: pack.envelope, publicKeyPem: pack.publicKeyPem }),
    w("licence-risk.json", pack.licenceRisk),
    w("summary.json", pack.summary),
  ];
  const report = [
    `# Software Evidence Pack — ${pack.summary.mission}`,
    ``, `Generated by ODG evidence-pack (R9-lite), composing the supply-chain-attest engine. Offline, reproducible.`,
    ``, `## Summary`,
    `- SBOM components: ${pack.summary.components} (reconciles to packages-with-version: ${pack.summary.reconciles})`,
    `- SBOM digest (sha256): ${pack.summary.sbomDigest}`,
    `- Provenance (in-toto/SLSA): verified=${pack.summary.provenanceVerified}; ${pack.summary.slsa}`,
    `- Licence risk: licensed=${pack.summary.licence.licensed}, unknown=${pack.summary.licence.unknown}, copyleft=${pack.summary.licence.copyleft}`,
    pack.summary.empty ? `- WARNING: empty input ⇒ 0-component pack (honest empty; NOT a completed assessment).` : ``,
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
module.exports = { buildEvidencePack, writePack, licenceRisk, verifyArtifactIntegrity, LIMITS };

// CLI: node odg-evidence-pack.js <lockfile.json> [outDir] [--name <app>]
if (require.main === module) {
  const args = process.argv.slice(2);
  const lockPath = args[0];
  const outDir = args[1] && !args[1].startsWith("--") ? args[1] : path.join(ROOT, "runtime", "generated", "evidence-pack");
  const nameIdx = args.indexOf("--name");
  const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined;
  if (!lockPath) { console.error("usage: odg-evidence-pack <lockfile.json> [outDir] [--name <app>]"); process.exit(2); }
  let lock: any;
  try { lock = JSON.parse(fs.readFileSync(lockPath, "utf8")); }
  catch (e: any) { console.error("odg-evidence-pack: cannot read/parse lockfile:", (e && e.message) || e); process.exit(1); }
  try {
    const bytes = fs.readFileSync(lockPath);
    const pack = buildEvidencePack(lock.packages || {}, { name: name || lock.name, version: lock.version, artifactBytes: bytes });
    const files = writePack(pack, outDir);
    console.log(`[odg-evidence-pack] ${pack.summary.ok ? "OK" : "FLAGGED"} — components=${pack.summary.components} reconciles=${pack.summary.reconciles} provenance=${pack.summary.provenanceVerified} licence(unknown=${pack.summary.licence.unknown},copyleft=${pack.summary.licence.copyleft})`);
    console.log(`  pack → ${outDir} (${files.map((f: any) => f.file).join(", ")})`);
    process.exit(pack.summary.ok ? 0 : 1);
  } catch (e: any) { console.error("odg-evidence-pack: FAILED —", (e && e.message) || e); process.exit(1); }
}
