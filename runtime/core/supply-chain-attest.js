/**
 * supply-chain-attest — PURE SBOM + provenance-attestation + sign/verify (SOFTWARE_SUPPLY_CHAIN_SLSA_L2_SBOM_V1).
 * No fetch, no fs, no paid dependency: SBOM is derived from an injected lockfile map; signing uses node's native
 * ed25519 (crypto). Reuses the sha256 primitive (cf. evidence-provenance). Keys are PEM passed in — NEVER stored.
 *
 * HONEST SLSA scope: this provides a CycloneDX-shaped SBOM, an in-toto-style statement binding the artifact digest
 * to the SBOM+source, and a reproducible ed25519 sign/verify with tamper-evidence. True **SLSA L2** additionally
 * requires a HOSTED build platform + MANAGED/keyless signing keys (Sigstore/KMS) — NOT available here (ephemeral
 * local key). ⇒ Claim = **SLSA L1 provenance + SBOM + a demonstrated signing mechanism**; L2 is BLOCKED on managed
 * signing (documented, never claimed on the mere presence of a signature). Integrity ≠ information authenticity.
 */
const crypto = require("crypto");

function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
// Deterministic canonical JSON (components are pre-sorted in buildSbom; statements have fixed key order here).
function canon(o) { return JSON.stringify(o); }

/** CycloneDX-shaped SBOM from a lockfile `packages` map ({ "node_modules/x": {version} }). Deterministic (sorted). */
function buildSbom(lockPackages, meta) {
  const comps = [];
  for (const p of Object.keys(lockPackages || {})) {
    if (!p) continue; // root package entry ("")
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

// UNIVERSAL ecosystem coverage (parity twin of supply-chain-attest.ts). Pure; unknown/malformed ⇒ [] (no throw).
function componentsFromManifest(content, ecosystem) {
  const comps = [];
  const eco = String(ecosystem || "").toLowerCase();
  if (typeof content !== "string" || !content) return comps;
  const push = (type, name, version) => { if (name && version) comps.push({ type: "library", name, version, purl: `pkg:${type}/${name}@${version}` }); };
  if (eco === "npm") {
    try { const j = JSON.parse(content); const pk = j.packages || {}; for (const k of Object.keys(pk)) { const info = pk[k] || {}; const name = k.replace(/^.*node_modules\//, ""); if (name && info.version) push("npm", name, info.version); } } catch { /* malformed ⇒ empty */ }
  } else if (eco === "pypi" || eco === "python") {
    for (const raw of content.split(/\r?\n/)) { const line = raw.replace(/#.*/, "").trim(); if (!line || line.startsWith("-")) continue; const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*==\s*([A-Za-z0-9][A-Za-z0-9._!+-]*)/); if (m) push("pypi", m[1].toLowerCase(), m[2]); }
  } else if (eco === "cargo" || eco === "rust") {
    for (const b of content.split(/\[\[package\]\]/).slice(1)) { const n = b.match(/name\s*=\s*"([^"]+)"/); const v = b.match(/version\s*=\s*"([^"]+)"/); if (n && v) push("cargo", n[1], v[1]); }
  } else if (eco === "golang" || eco === "go") {
    for (const raw of content.split(/\r?\n/)) { const line = raw.replace(/\/\/.*/, "").trim(); if (!line || line.startsWith("module ") || line.startsWith("go ") || line === "require (" || line === ")") continue; const m = line.match(/^(?:require\s+)?([a-zA-Z0-9][a-zA-Z0-9._~/-]*\.[a-zA-Z0-9._~/-]+)\s+v([0-9][0-9A-Za-z.+-]*)/); if (m) push("golang", m[1], "v" + m[2]); }
  } else if (eco === "pnpm") {
    // pnpm-lock.yaml: top-level `packages:` section (2-space 'name@version': keys). npm packages ⇒ purl npm.
    // Section-bounded so the following `snapshots:` block is not double-counted.
    let inPkgs = false;
    for (const raw of content.split(/\r?\n/)) {
      if (/^packages:\s*$/.test(raw)) { inPkgs = true; continue; }
      if (!inPkgs) continue;
      if (/^\S/.test(raw)) break;
      const m = raw.match(/^  '?([^'\s][^']*?)'?:\s*$/);
      if (!m) continue;
      let key = m[1]; const paren = key.indexOf("("); if (paren >= 0) key = key.slice(0, paren);
      const at = key.lastIndexOf("@"); if (at <= 0) continue;
      push("npm", key.slice(0, at), key.slice(at + 1));
    }
  } else if (eco === "yarn") {
    // yarn.lock v1 (`name@range:` + `  version "x"`) and berry (`"name@npm:range":` + `  version: x`).
    let curName = null;
    for (const raw of content.split(/\r?\n/)) {
      if (/^[^\s#]/.test(raw) && raw.trim().endsWith(":")) {
        let spec = raw.split(",")[0].trim().replace(/:$/, "").replace(/^"(.*)"$/, "$1");
        const at = spec.lastIndexOf("@"); curName = at > 0 ? spec.slice(0, at) : null;
      } else if (curName) {
        const vm = raw.match(/^\s+version:?\s+"?([^"\s]+)"?/);
        if (vm) { push("npm", curName, vm[1]); curName = null; }
      }
    }
  } else if (eco === "gem" || eco === "ruby" || eco === "bundler") {
    // Gemfile.lock: GEM → `  specs:` → 4-space `name (version)` top-level gems (6-space deps skipped).
    let inSpecs = false;
    for (const raw of content.split(/\r?\n/)) {
      if (/^  specs:\s*$/.test(raw)) { inSpecs = true; continue; }
      if (!inSpecs) continue;
      if (/^\S/.test(raw)) { inSpecs = false; continue; }
      const m = raw.match(/^    ([A-Za-z0-9][A-Za-z0-9._-]*) \(([^)]+)\)\s*$/);
      if (m) push("gem", m[1], m[2]);
    }
  } else if (eco === "composer" || eco === "php") {
    // composer.lock (JSON): packages + packages-dev arrays of {name, version}. purl pkg:composer.
    try { const j = JSON.parse(content); for (const arr of [j.packages, j["packages-dev"]]) if (Array.isArray(arr)) for (const p of arr) if (p && p.name && p.version) push("composer", p.name, p.version); } catch { /* malformed ⇒ empty */ }
  }
  comps.sort((a, b) => (a.purl < b.purl ? -1 : a.purl > b.purl ? 1 : 0));
  return comps;
}

function buildSbomMulti(sources, meta) {
  let comps = []; const ecosystems = [];
  for (const s of (Array.isArray(sources) ? sources : [])) { const c = componentsFromManifest(s && s.content, s && s.ecosystem); if (s && s.ecosystem) ecosystems.push(String(s.ecosystem).toLowerCase()); comps = comps.concat(c); }
  const seen = new Set(); comps = comps.filter((c) => (seen.has(c.purl) ? false : (seen.add(c.purl), true)));
  comps.sort((a, b) => (a.purl < b.purl ? -1 : a.purl > b.purl ? 1 : 0));
  return { bomFormat: "CycloneDX", specVersion: "1.5", version: 1, metadata: { component: { type: "application", name: (meta && meta.name) || "target", version: (meta && meta.version) || "0.0.0" }, ecosystems: [...new Set(ecosystems)] }, components: comps };
}

/** in-toto-style statement binding an artifact (by sha256) to the SBOM digest + source. Caller supplies timestamps. */
function buildAttestation(artifact, sbom, source) {
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

/** DSSE-ish ed25519 signing envelope. privateKeyPem is an EPHEMERAL/managed key — never committed. */
function signStatement(statement, privateKeyPem) {
  const payload = Buffer.from(canon(statement));
  const signature = crypto.sign(null, payload, privateKeyPem).toString("base64");
  return { payloadType: "application/vnd.in-toto+json", payloadSha256: sha256(payload), signature };
}

/**
 * Verify: (1) signature over the statement; (2) artifact digest rebind (tamper-evident) if artifactBytes given;
 * (3) subject-name match if expectName given; (4) SBOM consistency if sbom given. Fail-closed, lists every reason.
 */
function verifyStatement(statement, envelope, publicKeyPem, opts) {
  if (!statement || !envelope || !publicKeyPem) return { ok: false, reason: "missing attestation, signature or key", checks: {} };
  const o = opts || {};
  const reasons = [];
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

module.exports = { sha256, canon, buildSbom, componentsFromManifest, buildSbomMulti, buildAttestation, signStatement, verifyStatement };
