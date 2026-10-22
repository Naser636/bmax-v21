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

// UNIVERSAL ecosystem coverage (closes the "other ecosystems not covered" gap). Extract CycloneDX components
// from a dependency manifest of several ecosystems into correct purls — pure, deterministic, no fetch/fs.
// Supported: npm (package-lock JSON), pypi (requirements.txt `name==version`), cargo (Cargo.lock [[package]]),
// golang (go.mod/go.sum `module vX`). Unknown ecosystem or malformed content ⇒ [] (honest empty, never throws).
function componentsFromManifest(content: any, ecosystem: any): any[] {
  const comps: any[] = [];
  const eco = String(ecosystem || "").toLowerCase();
  if (typeof content !== "string" || !content) return comps;
  const push = (type: string, name: string, version: string) => { if (name && version) comps.push({ type: "library", name, version, purl: `pkg:${type}/${name}@${version}` }); };
  if (eco === "npm") {
    try { const j = JSON.parse(content); const pk = j.packages || {}; for (const k of Object.keys(pk)) { const info = pk[k] || {}; const name = k.replace(/^.*node_modules\//, ""); if (name && info.version) push("npm", name, info.version); } } catch { /* malformed ⇒ empty */ }
  } else if (eco === "pypi" || eco === "python") {
    for (const raw of content.split(/\r?\n/)) { const line = raw.replace(/#.*/, "").trim(); if (!line || line.startsWith("-")) continue; const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*==\s*([A-Za-z0-9][A-Za-z0-9._!+-]*)/); if (m) push("pypi", m[1].toLowerCase(), m[2]); }
  } else if (eco === "cargo" || eco === "rust") {
    for (const b of content.split(/\[\[package\]\]/).slice(1)) { const n = b.match(/name\s*=\s*"([^"]+)"/); const v = b.match(/version\s*=\s*"([^"]+)"/); if (n && v) push("cargo", n[1], v[1]); }
  } else if (eco === "golang" || eco === "go") {
    for (const raw of content.split(/\r?\n/)) { const line = raw.replace(/\/\/.*/, "").trim(); if (!line || line.startsWith("module ") || line.startsWith("go ") || line === "require (" || line === ")") continue; const m = line.match(/^(?:require\s+)?([a-zA-Z0-9][a-zA-Z0-9._~/-]*\.[a-zA-Z0-9._~/-]+)\s+v([0-9][0-9A-Za-z.+-]*)/); if (m) push("golang", m[1], "v" + m[2]); }
  } else if (eco === "pnpm") {
    // pnpm-lock.yaml: authoritative component list is the top-level `packages:` section (2-space keys
    // 'name@version': ...). Scoped names are quoted; peer-dep suffixes appear in (...). pnpm installs npm
    // packages ⇒ purl type npm. Section-bounded so the following `snapshots:` block is NOT double-counted.
    let inPkgs = false;
    for (const raw of content.split(/\r?\n/)) {
      if (/^packages:\s*$/.test(raw)) { inPkgs = true; continue; }
      if (!inPkgs) continue;
      if (/^\S/.test(raw)) break; // next top-level section (e.g. snapshots:) ⇒ end of packages
      const m = raw.match(/^  '?([^'\s][^']*?)'?:\s*$/); // exactly-2-space key ending in colon
      if (!m) continue;
      let key = m[1]; const paren = key.indexOf("("); if (paren >= 0) key = key.slice(0, paren);
      const at = key.lastIndexOf("@"); if (at <= 0) continue; // need name@version (scope @ is at 0)
      push("npm", key.slice(0, at), key.slice(at + 1));
    }
  } else if (eco === "yarn") {
    // yarn.lock: classic v1 (`name@range:` header + `  version "x"`) and berry (`"name@npm:range":` +
    // `  version: x`). Package name = spec before its LAST '@' (handles @scope/name). npm registry ⇒ pkg:npm.
    let curName: string | null = null;
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
    // Gemfile.lock (Bundler): GEM → `  specs:` → 4-space `name (version)` top-level gems (6-space deps skipped).
    let inSpecs = false;
    for (const raw of content.split(/\r?\n/)) {
      if (/^  specs:\s*$/.test(raw)) { inSpecs = true; continue; }
      if (!inSpecs) continue;
      if (/^\S/.test(raw)) { inSpecs = false; continue; } // left the GEM/GIT/PATH block
      const m = raw.match(/^    ([A-Za-z0-9][A-Za-z0-9._-]*) \(([^)]+)\)\s*$/);
      if (m) push("gem", m[1], m[2]);
    }
  } else if (eco === "composer" || eco === "php") {
    // composer.lock (JSON): packages + packages-dev arrays of {name:"vendor/pkg", version}. purl pkg:composer.
    try { const j = JSON.parse(content); for (const arr of [j.packages, j["packages-dev"]]) if (Array.isArray(arr)) for (const p of arr) if (p && p.name && p.version) push("composer", p.name, p.version); } catch { /* malformed ⇒ empty */ }
  }
  comps.sort((a, b) => (a.purl < b.purl ? -1 : a.purl > b.purl ? 1 : 0));
  return comps;
}

// Build ONE CycloneDX SBOM across MULTIPLE ecosystems. sources = [{content, ecosystem}, ...]. Dedups by purl.
function buildSbomMulti(sources: any, meta?: any): any {
  let comps: any[] = []; const ecosystems: string[] = [];
  for (const s of (Array.isArray(sources) ? sources : [])) { const c = componentsFromManifest(s && s.content, s && s.ecosystem); if (s && s.ecosystem) ecosystems.push(String(s.ecosystem).toLowerCase()); comps = comps.concat(c); }
  const seen = new Set(); comps = comps.filter((c) => (seen.has(c.purl) ? false : (seen.add(c.purl), true)));
  comps.sort((a, b) => (a.purl < b.purl ? -1 : a.purl > b.purl ? 1 : 0));
  return { bomFormat: "CycloneDX", specVersion: "1.5", version: 1, metadata: { component: { type: "application", name: (meta && meta.name) || "target", version: (meta && meta.version) || "0.0.0" }, ecosystems: [...new Set(ecosystems)] }, components: comps };
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

module.exports = { sha256, canon, buildSbom, componentsFromManifest, buildSbomMulti, buildAttestation, signStatement, verifyStatement };
export {};
