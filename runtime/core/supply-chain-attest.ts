/**
 * supply-chain-attest — PURE SBOM + provenance-attestation + sign/verify (SOFTWARE_SUPPLY_CHAIN_SLSA_L2_SBOM_V1).
 * No fetch, no fs, no paid dependency: SBOM is derived from an injected lockfile map; signing uses node's native
 * ed25519 (crypto). Reuses the sha256 primitive (cf. evidence-provenance). Keys are PEM passed in — NEVER stored.
 *
 * HONEST SLSA scope: CycloneDX-shaped SBOM + in-toto-style statement binding artifact digest to SBOM+source +
 * reproducible ed25519 sign/verify with tamper-evidence. True **SLSA L2** also requires a HOSTED build platform +
 * MANAGED/keyless signing (Sigstore/KMS) — NOT available here (ephemeral local key). ⇒ Claim = L1 provenance + SBOM
 * + demonstrated signing mechanism; **L2 BLOCKED** on managed signing. Integrity ≠ information authenticity.
 */
const crypto = require("crypto");

function sha256(buf: any): string { return crypto.createHash("sha256").update(buf).digest("hex"); }
function canon(o: any): string { return JSON.stringify(o); }

function buildSbom(lockPackages: any, meta?: any): any {
  const comps: any[] = [];
  for (const p of Object.keys(lockPackages || {})) {
    if (!p) continue;
    const info = lockPackages[p] || {};
    const name = p.replace(/^.*node_modules\//, "");
    const version = info.version;
    if (!name || !version) continue;
    comps.push({ type: "library", name, version, purl: `pkg:npm/${name}@${version}` });
  }
  comps.sort((a, b) => (a.purl < b.purl ? -1 : a.purl > b.purl ? 1 : 0));
  return {
    bomFormat: "CycloneDX", specVersion: "1.5", version: 1,
    metadata: { component: { type: "application", name: (meta && meta.name) || "bmax-v21", version: (meta && meta.version) || "0.0.0" } },
    components: comps,
  };
}

function buildAttestation(artifact: any, sbom: any, source?: any): any {
  const a = artifact || {};
  return {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: a.name || "artifact", digest: { sha256: a.sha256 || null } }],
    predicateType: "https://slsa.dev/provenance/v1",
    predicate: {
      buildType: "local/odg-release",
      builder: { id: (source && source.builderId) || "local" },
      sbomDigest: sbom ? sha256(canon(sbom)) : null,
      sourceCommit: (source && source.commit) || null,
      finishedAt: (source && source.finishedAt) || null,
      slsaLevelClaim: "L1+mechanism (L2 BLOCKED: no managed/keyless signing)",
    },
  };
}

function signStatement(statement: any, privateKeyPem: any): any {
  const payload = Buffer.from(canon(statement));
  const signature = crypto.sign(null, payload, privateKeyPem).toString("base64");
  return { payloadType: "application/vnd.in-toto+json", payloadSha256: sha256(payload), signature };
}

function verifyStatement(statement: any, envelope: any, publicKeyPem: any, opts?: any): any {
  if (!statement || !envelope || !publicKeyPem) return { ok: false, reason: "missing attestation, signature or key", checks: {} };
  const o = opts || {};
  const reasons: string[] = [];
  const payload = Buffer.from(canon(statement));
  let sigOk = false;
  try { sigOk = crypto.verify(null, payload, publicKeyPem, Buffer.from(envelope.signature || "", "base64")); } catch { sigOk = false; }
  if (!sigOk) reasons.push("invalid signature");
  if (o.artifactBytes !== undefined) {
    const recomputed = sha256(o.artifactBytes);
    const claimed = statement.subject && statement.subject[0] && statement.subject[0].digest && statement.subject[0].digest.sha256;
    if (recomputed !== claimed) reasons.push("artifact digest mismatch (tampered subject)");
  }
  if (o.expectName !== undefined) {
    const n = statement.subject && statement.subject[0] && statement.subject[0].name;
    if (n !== o.expectName) reasons.push("wrong subject name");
  }
  if (o.sbom !== undefined) {
    const d = sha256(canon(o.sbom));
    if (d !== (statement.predicate && statement.predicate.sbomDigest)) reasons.push("SBOM digest inconsistent with attestation");
  }
  return { ok: reasons.length === 0, reason: reasons.length ? reasons.join("; ") : "verified (signature + subject digest + SBOM rebind)", checks: { sigOk, reasons } };
}

module.exports = { sha256, canon, buildSbom, buildAttestation, signStatement, verifyStatement };
export {};
